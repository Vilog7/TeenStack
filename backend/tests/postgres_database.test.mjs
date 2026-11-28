import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createTeenStackServer } from '../index.mjs';

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;

async function startPostgresTestServer({ tmpDir: existingTmp = null, persistDump = false } = {}) {
  const tmpDir = existingTmp || fs.mkdtempSync(path.join(os.tmpdir(), 'teenstack-pg-test-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const pgDumpPath = path.join(tmpDir, 'teenstack_pgdata.tar.gz');
  const env = {
    NODE_ENV: 'test',
    FORCE_PG_DUMP: persistDump ? 'true' : '',
    SIGNZY_MODE: 'sandbox_mock',
    SIGNZY_WEBHOOK_SECRET: 'whsec_pg_test_secret_2026',
    COMPLIANCE_ADMIN_KEY: 'adm_pg_overview_key_2026',
  };

  const ctx = createTeenStackServer({ dbPath, pgDumpPath, enablePostgres: true, env, seedDemo: true });
  await ctx.getPostgres();
  await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
  const addr = ctx.server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function apiCall(pathname, { method = 'GET', body, token, headers: extraHeaders = {} } = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function closeOnly() {
    const pg = await ctx.getPostgres();
    await pg.persistToDisk();
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.db.close();
  }

  async function cleanup() {
    await closeOnly();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { ...ctx, tmpDir, pgDumpPath, apiCall, closeOnly, cleanup };
}

test('1. PostgreSQL Schema Completeness: 38 Tables, 16 Custom ENUMs, Views & Seeded Relational Data', async () => {
  const h = await startPostgresTestServer();
  try {
    const health = await h.apiCall('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.engine, 'postgresql');
    assert.equal(health.data.postgres.active, true);
    assert.equal(health.data.postgres.totalTables, 38);

    const overview = await h.apiCall('/api/admin/database/postgres-overview', {
      headers: { 'x-compliance-admin-key': 'adm_pg_overview_key_2026' },
    });
    assert.equal(overview.status, 200);
    assert.equal(overview.data.totalTables, 38, 'Must contain all 38 normalized PostgreSQL tables');
    assert.equal(overview.data.totalViews, 2, 'Must contain analytical PostgreSQL views');
    assert.equal(overview.data.totalEnums, 16, 'Must contain all 16 PostgreSQL ENUM types');

    // Verify seeded data across normalized tables
    assert.ok(overview.data.tables.users >= 6);
    assert.ok(overview.data.tables.user_profiles >= 6);
    assert.ok(overview.data.tables.user_privacy_settings >= 6);
    assert.ok(overview.data.tables.user_skills >= 20);
    assert.ok(overview.data.tables.user_subjects >= 10);
    assert.ok(overview.data.tables.user_skill_tags >= 10);
    assert.ok(overview.data.tables.posts >= 5);
    assert.ok(overview.data.tables.post_tagged_people >= 2);
    assert.ok(overview.data.tables.post_comments >= 3);
    assert.ok(overview.data.tables.student_projects >= 5);
    assert.ok(overview.data.tables.student_achievements >= 5);
    assert.ok(overview.data.tables.friendships >= 8);
    assert.ok(overview.data.tables.chat_threads >= 4);
    assert.ok(overview.data.tables.messages >= 6);
    assert.ok(overview.data.tables.opportunities >= 6);
    assert.ok(overview.data.tables.courses >= 4);
    assert.ok(overview.data.tables.course_modules >= 12);

    // Query v_student_complete_directory directly in PostgreSQL
    const pg = await h.getPostgres();
    const aravView = await pg.query(
      'SELECT * FROM v_student_complete_directory WHERE username = $1',
      ['arav_dev']
    );
    assert.equal(aravView.rows.length, 1);
    assert.equal(aravView.rows[0].school, 'Westlake STEM Academy');
    assert.ok(aravView.rows[0].active_skills.includes('TypeScript'));
    assert.ok(aravView.rows[0].subjects.includes('Computer Science'));
    assert.ok(aravView.rows[0].skill_tags.includes('#FullStackTeen'));
  } finally {
    await h.cleanup();
  }
});

test('2. PostgreSQL PL/pgSQL Triggers Enforce Max-10 Skills, Max-10 @Tags & Auto-Count Comments', async () => {
  const h = await startPostgresTestServer();
  try {
    const pg = await h.getPostgres();

    // Seeded Arav has 6 active skills; insert 4 more (total 10 -> allowed), then 11th must fail with 23514!
    for (let i = 7; i <= 10; i++) {
      await pg.query(
        `INSERT INTO user_skills (user_id, skill_name, skill_kind, sort_order)
         VALUES ('usr-demo-arav', $1, 'active', $2)`,
        [`ExtraSkill_${i}`, i]
      );
    }

    await assert.rejects(
      () =>
        pg.query(
          `INSERT INTO user_skills (user_id, skill_name, skill_kind, sort_order)
           VALUES ('usr-demo-arav', 'EleventhForbiddenSkill', 'active', 11)`
        ),
      /MAX_SKILLS_EXCEEDED/,
      'PostgreSQL trigger must block >10 active skills'
    );

    // Max 10 @tagged people per post enforced at PostgreSQL level
    await pg.query('DELETE FROM post_tagged_people WHERE post_id = $1', ['post-rohan-2']);
    for (let i = 1; i <= 10; i++) {
      await pg.query(
        'INSERT INTO post_tagged_people (post_id, tagged_handle) VALUES ($1, $2)',
        ['post-rohan-2', `@tag_peer_${i}`]
      );
    }
    await assert.rejects(
      () =>
        pg.query('INSERT INTO post_tagged_people (post_id, tagged_handle) VALUES ($1, $2)', [
          'post-rohan-2',
          '@tag_peer_11',
        ]),
      /MAX_TAGS_EXCEEDED/,
      'PostgreSQL trigger must block >10 @tags on a post'
    );

    // Comment count trigger auto-increments and auto-decrements posts.comments_count
    const beforeCount = (
      await pg.query('SELECT comments_count FROM posts WHERE id = $1', ['post-zara-3'])
    ).rows[0].comments_count;

    await pg.query(
      `INSERT INTO post_comments (id, post_id, author_id, author_name, author_avatar, text)
       VALUES ('pg-trig-c1', 'post-zara-3', 'usr-demo-arav', 'Arav Sharma', 'violet-coder', 'Trigger test!')`
    );
    const afterInsertCount = (
      await pg.query('SELECT comments_count FROM posts WHERE id = $1', ['post-zara-3'])
    ).rows[0].comments_count;
    assert.equal(afterInsertCount, beforeCount + 1);

    await pg.query('DELETE FROM post_comments WHERE id = $1', ['pg-trig-c1']);
    const afterDeleteCount = (
      await pg.query('SELECT comments_count FROM posts WHERE id = $1', ['post-zara-3'])
    ).rows[0].comments_count;
    assert.equal(afterDeleteCount, beforeCount);
  } finally {
    await h.cleanup();
  }
});

test('3. Live Write-Through Sync Across All Domains & Persistent PGDATA Reload', async () => {
  const h = await startPostgresTestServer({ persistDump: true });
  const sharedTmpDir = h.tmpDir;
  let newStudentId = '';
  try {
    // 1. Register new student -> verify -> complete onboarding -> upload media -> create Reel -> apply & block
    const reg = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Meera Nair',
        declaredDob: '2006-09-12',
        email: 'meera.pg@teenstack.edu',
        mobile: '+91 98450 77889',
        username: 'meera_quantum',
        password: 'QuantumPassword!2026',
      },
    });
    assert.equal(reg.status, 201);
    const token = reg.data.token;
    newStudentId = reg.data.user.id;

    await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token,
      body: { idempotencyKey: 'pg-idem-meera-1' },
    });
    await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token,
      body: { scenario: 'VERIFIED_18_PLUS' },
    });

    await h.apiCall('/api/onboarding', {
      method: 'PUT',
      token,
      body: {
        step: 2,
        completed: true,
        profilePatch: {
          subjects: ['Quantum Computing', 'Linear Algebra'],
          skills: ['Python', 'Qiskit', 'Rust'],
          skillsToLearn: ['CUDA'],
          experienceYears: 3,
          ratePerProject: '₹15,000 / project',
          avatarUrl: SAMPLE_PNG_DATA_URL,
          bio: 'Building quantum circuit visualizers.',
          portfolioUrl: 'https://meera.teenstack.dev',
          generatedTags: ['#QuantumBuilder', '#RustSystems'],
        },
      },
    });

    const createdPost = await h.apiCall('/api/posts', {
      method: 'POST',
      token,
      body: {
        category: 'reel',
        title: 'Bloch Sphere Visualizer',
        content: 'Interactive 2-qubit entanglement demo with @arav_dev',
        mediaType: 'video_showcase',
        mediaMeta: {
          topic: 'Quantum Computing',
          imageUrl: SAMPLE_PNG_DATA_URL,
          taggedPeople: ['@arav_dev'],
          attachedLink: 'https://meera.teenstack.dev/bloch',
        },
        skillTags: ['Qiskit', 'WebGL'],
      },
    });
    assert.equal(createdPost.status, 201);

    await h.apiCall(`/api/interactions/toggle`, {
      method: 'POST',
      token,
      body: { targetType: 'like', targetId: 'post-solaris-1' },
    });
    await h.apiCall(`/api/interactions/toggle`, {
      method: 'POST',
      token,
      body: { targetType: 'save', targetId: 'post-solaris-1' },
    });

    // Verify all normalized PostgreSQL rows exist right now!
    const pg = await h.getPostgres();
    const pgUser = await pg.query('SELECT * FROM users WHERE id = $1', [newStudentId]);
    assert.equal(pgUser.rows[0].account_status, 'ACTIVE');
    assert.ok(pgUser.rows[0].email.startsWith('enc:v1:'), 'Email PII must be encrypted in PostgreSQL');

    const pgProf = await pg.query('SELECT * FROM user_profiles WHERE user_id = $1', [newStudentId]);
    assert.equal(pgProf.rows[0].rate_per_project, '₹15,000 / project');
    assert.equal(pgProf.rows[0].experience_years, 3);
    assert.match(pgProf.rows[0].avatar_url, /^\/uploads\/avatar_/);

    const pgSkills = await pg.query(
      'SELECT skill_name, skill_kind FROM user_skills WHERE user_id = $1 ORDER BY skill_name ASC',
      [newStudentId]
    );
    assert.equal(pgSkills.rows.length, 4); // 3 active + 1 learning (CUDA)

    const pgMedia = await pg.query('SELECT * FROM media_assets WHERE owner_id = $1', [newStudentId]);
    assert.equal(pgMedia.rows.length, 2); // avatar + reel cover

    const pgTag = await pg.query(
      'SELECT * FROM post_tagged_people WHERE post_id = $1',
      [createdPost.data.post.id]
    );
    assert.equal(pgTag.rows.length, 1);
    assert.equal(pgTag.rows[0].tagged_user_id, 'usr-demo-arav');

    const pgLike = await pg.query(
      'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
      ['post-solaris-1', newStudentId]
    );
    assert.equal(pgLike.rows.length, 1);

    const pgBookmark = await pg.query(
      'SELECT * FROM post_bookmarks WHERE post_id = $1 AND user_id = $2',
      ['post-solaris-1', newStudentId]
    );
    assert.equal(pgBookmark.rows.length, 1);

    // Close server 1 (persists teenstack_pgdata.tar.gz) & verify tarball was written
    await h.closeOnly();
    assert.equal(fs.existsSync(h.pgDumpPath), true, 'PGDATA gzip archive must be persisted');

    // Boot a fresh PostgreSQL instance directly from the persisted PGDATA archive and verify Meera's rows survived!
    const h2 = await startPostgresTestServer({ tmpDir: sharedTmpDir, persistDump: true });
    try {
      const pg2 = await h2.getPostgres();
      const reloaded = await pg2.query(
        'SELECT full_name, active_skills, subjects FROM v_student_complete_directory WHERE id = $1',
        [newStudentId]
      );
      assert.equal(reloaded.rows.length, 1);
      assert.equal(reloaded.rows[0].full_name, 'Meera Nair');
      assert.ok(reloaded.rows[0].active_skills.includes('Qiskit'));
    } finally {
      await h2.cleanup();
    }
  } catch (err) {
    fs.rmSync(sharedTmpDir, { recursive: true, force: true });
    throw err;
  }
});
