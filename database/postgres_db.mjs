import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_001_PATH = path.join(__dirname, 'postgresql', '001_teenstack_complete_schema.sql');
const TRIGGERS_002_PATH = path.join(__dirname, 'postgresql', '002_triggers_and_views.sql');

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function toIsoOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    return new Date(Number(str)).toISOString();
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Creates and initializes TeenStack's complete 38-table PostgreSQL database engine.
 * - Uses `pg.Pool` when `DATABASE_URL` (`postgresql://...`) is configured.
 * - Uses `@electric-sql/pglite` (real PostgreSQL WASM engine with gzipped PGDATA persistence)
 *   for zero-setup local execution and automated test suites.
 */
export async function createPostgresDatabase({
  env = process.env,
  pgDumpPath = null,
} = {}) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  const useExternalPg =
    databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');

  let pool = null;
  let pglite = null;
  const mode = useExternalPg ? 'external_pg' : 'embedded_pglite';

  if (useExternalPg) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl:
        env.PGSSLMODE === 'require' || env.NODE_ENV === 'production'
          ? { rejectUnauthorized: env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
          : false,
      max: 10,
    });
  } else {
    let loadDataDir;
    if (pgDumpPath && fs.existsSync(pgDumpPath)) {
      try {
        const rawBytes = fs.readFileSync(pgDumpPath);
        if (rawBytes.length > 0) {
          loadDataDir = new Blob([rawBytes]);
        }
      } catch {
        loadDataDir = undefined;
      }
    }
    pglite = new PGlite(loadDataDir ? { loadDataDir } : undefined);
  }

  async function exec(sqlText) {
    if (pool) {
      await pool.query(sqlText);
    } else {
      await pglite.exec(sqlText);
    }
  }

  async function query(sqlText, params = []) {
    if (pool) {
      return pool.query(sqlText, params);
    }
    return pglite.query(sqlText, params);
  }

  async function persistToDisk() {
    if (!pglite || !pgDumpPath) return;
    const blob = await pglite.dumpDataDir('gzip');
    const buf = Buffer.from(await blob.arrayBuffer());
    fs.mkdirSync(path.dirname(pgDumpPath), { recursive: true });
    fs.writeFileSync(pgDumpPath, buf);
  }

  // Apply complete 38-table PostgreSQL DDL + PL/pgSQL triggers + views
  await exec(fs.readFileSync(SCHEMA_001_PATH, 'utf8'));
  await exec(fs.readFileSync(TRIGGERS_002_PATH, 'utf8'));

  const verRes = await query('SELECT version() AS version');
  const pgVersion = verRes.rows[0]?.version || 'PostgreSQL';

  let syncChain = Promise.resolve();

  /**
   * Synchronizes every single piece of TeenStack state into the 38 normalized
   * PostgreSQL tables inside an atomic transaction.
   */
  function syncFromSqlite(sqliteDb, { persist = false } = {}) {
    syncChain = syncChain.then(async () => {
      await exec('BEGIN');
      try {
        // 1. Users & Normalized Profile / Privacy / Subjects / Skills / Skill-Tags
        const users = sqliteDb.prepare('SELECT * FROM users').all();
        const userIdSet = new Set(users.map((u) => u.id));
        const usernameToId = new Map(users.map((u) => [String(u.username).toLowerCase(), u.id]));

        if (users.length === 0) {
          await query('DELETE FROM users');
        } else {
          await query('DELETE FROM users WHERE NOT (id = ANY($1::text[]))', [
            Array.from(userIdSet),
          ]);
        }

        for (const u of users) {
          const prof = safeJsonParse(u.profile_json, {});
          const priv = prof.privacy || {};

          await query(
            `
            INSERT INTO users (
              id, full_name, username, email, email_lookup_hash, mobile, mobile_lookup_hash,
              password_hash, declared_dob, verified_age_band, account_status, role,
              age, marketing_opt_in, onboarding_step, onboarding_completed, profile_json,
              last_active_at, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10::verified_age_band_enum, $11::account_status_enum, $12::user_role_enum,
              $13, $14, $15, $16, $17::jsonb,
              $18::timestamptz, $19::timestamptz
            )
            ON CONFLICT (id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              username = EXCLUDED.username,
              email = EXCLUDED.email,
              email_lookup_hash = EXCLUDED.email_lookup_hash,
              mobile = EXCLUDED.mobile,
              mobile_lookup_hash = EXCLUDED.mobile_lookup_hash,
              password_hash = EXCLUDED.password_hash,
              declared_dob = EXCLUDED.declared_dob,
              verified_age_band = EXCLUDED.verified_age_band,
              account_status = EXCLUDED.account_status,
              role = EXCLUDED.role,
              age = EXCLUDED.age,
              marketing_opt_in = EXCLUDED.marketing_opt_in,
              onboarding_step = EXCLUDED.onboarding_step,
              onboarding_completed = EXCLUDED.onboarding_completed,
              profile_json = EXCLUDED.profile_json,
              last_active_at = EXCLUDED.last_active_at
            `,
            [
              u.id,
              u.full_name,
              String(u.username).toLowerCase().slice(0, 24),
              u.email,
              u.email_lookup_hash || null,
              u.mobile || '',
              u.mobile_lookup_hash || null,
              u.password_hash,
              u.declared_dob || '',
              u.verified_age_band || 'UNVERIFIED',
              u.account_status || 'PENDING_VERIFICATION',
              u.role || 'student',
              Math.max(5, Math.min(100, Number(u.age) || 16)),
              Boolean(u.marketing_opt_in),
              Math.max(1, Math.min(5, Number(u.onboarding_step) || 1)),
              Boolean(u.onboarding_completed),
              JSON.stringify(prof),
              toIsoOrNull(u.last_active_at),
              toIsoOrNull(u.created_at) || new Date().toISOString(),
            ]
          );

          await query(
            `
            INSERT INTO user_profiles (
              user_id, education_level, school, headline, bio, avatar_url, avatar_preset,
              portfolio_url, experience_years, projects_completed, rate_per_project,
              target_clients, career_aim, desired_field, career_interests, base_mutuals, is_online
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11,
              $12, $13, $14, $15::text[], $16, $17
            )
            ON CONFLICT (user_id) DO UPDATE SET
              education_level = EXCLUDED.education_level,
              school = EXCLUDED.school,
              headline = EXCLUDED.headline,
              bio = EXCLUDED.bio,
              avatar_url = EXCLUDED.avatar_url,
              avatar_preset = EXCLUDED.avatar_preset,
              portfolio_url = EXCLUDED.portfolio_url,
              experience_years = EXCLUDED.experience_years,
              projects_completed = EXCLUDED.projects_completed,
              rate_per_project = EXCLUDED.rate_per_project,
              target_clients = EXCLUDED.target_clients,
              career_aim = EXCLUDED.career_aim,
              desired_field = EXCLUDED.desired_field,
              career_interests = EXCLUDED.career_interests,
              base_mutuals = EXCLUDED.base_mutuals,
              is_online = EXCLUDED.is_online
            `,
            [
              u.id,
              prof.educationLevel || 'High School Student',
              prof.school || '',
              prof.headline || '',
              prof.bio || '',
              prof.avatarUrl || '',
              prof.avatarPreset || 'violet-coder',
              prof.portfolioUrl || '',
              Math.max(0, Math.min(20, Number(prof.experienceYears) || 0)),
              Math.max(0, Number(prof.projectsCompleted) || 0),
              prof.ratePerProject || '',
              prof.targetClients || '',
              prof.careerAim || '',
              prof.desiredField || '',
              Array.isArray(prof.careerInterests) ? prof.careerInterests.map(String) : [],
              Number(prof.baseMutuals ?? 4),
              Boolean(prof.online),
            ]
          );

          const allowedVis = ['students_only', 'connections', 'public_mentors'].includes(
            priv.profileVisibility
          )
            ? priv.profileVisibility
            : 'students_only';
          const allowedDm = ['connections_only', 'verified_students'].includes(priv.dmPermission)
            ? priv.dmPermission
            : 'connections_only';

          await query(
            `
            INSERT INTO user_privacy_settings (
              user_id, profile_visibility, dm_permission, hide_contact_info, guardian_email, content_safety_filter
            ) VALUES ($1, $2::profile_visibility_enum, $3::dm_permission_enum, $4, $5, $6)
            ON CONFLICT (user_id) DO UPDATE SET
              profile_visibility = EXCLUDED.profile_visibility,
              dm_permission = EXCLUDED.dm_permission,
              hide_contact_info = EXCLUDED.hide_contact_info,
              guardian_email = EXCLUDED.guardian_email,
              content_safety_filter = EXCLUDED.content_safety_filter
            `,
            [
              u.id,
              allowedVis,
              allowedDm,
              priv.hideContactInfo !== false,
              priv.guardianEmail || '',
              priv.contentSafetyFilter !== false,
            ]
          );

          await query('DELETE FROM user_subjects WHERE user_id = $1', [u.id]);
          const subjects = Array.isArray(prof.subjects) ? prof.subjects : [];
          for (let i = 0; i < subjects.length; i++) {
            const sub = String(subjects[i] || '').trim();
            if (sub) {
              await query(
                'INSERT INTO user_subjects (user_id, subject_name, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [u.id, sub, i]
              );
            }
          }

          await query('DELETE FROM user_skills WHERE user_id = $1', [u.id]);
          const activeSkills = (Array.isArray(prof.skills) ? prof.skills : []).slice(0, 10);
          for (let i = 0; i < activeSkills.length; i++) {
            const sk = String(activeSkills[i] || '').trim();
            if (sk) {
              await query(
                `INSERT INTO user_skills (user_id, skill_name, skill_kind, experience_years, sort_order)
                 VALUES ($1, $2, 'active', $3, $4) ON CONFLICT DO NOTHING`,
                [u.id, sk, Math.max(0, Math.min(20, Number(prof.experienceYears) || 0)), i]
              );
            }
          }
          const learningSkills = Array.isArray(prof.skillsToLearn) ? prof.skillsToLearn : [];
          for (let i = 0; i < learningSkills.length; i++) {
            const sk = String(learningSkills[i] || '').trim();
            if (sk) {
              await query(
                `INSERT INTO user_skills (user_id, skill_name, skill_kind, experience_years, sort_order)
                 VALUES ($1, $2, 'learning', 0, $3) ON CONFLICT DO NOTHING`,
                [u.id, sk, i]
              );
            }
          }

          await query('DELETE FROM user_skill_tags WHERE user_id = $1', [u.id]);
          const tags = Array.isArray(prof.generatedTags) ? prof.generatedTags : [];
          for (let i = 0; i < tags.length; i++) {
            const tg = String(tags[i] || '').trim();
            if (tg) {
              await query(
                `INSERT INTO user_skill_tags (user_id, tag_label, is_primary, sort_order)
                 VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                [u.id, tg, i === 0, i]
              );
            }
          }
        }

        // 2. Sessions & Password Reset Tokens
        await query('DELETE FROM sessions');
        const sessions = sqliteDb.prepare('SELECT * FROM sessions').all();
        for (const s of sessions) {
          if (!userIdSet.has(s.user_id)) continue;
          await query(
            `INSERT INTO sessions (token, user_id, role, user_agent, created_at, expires_at)
             VALUES ($1, $2, $3::user_role_enum, $4, $5::timestamptz, $6::timestamptz)
             ON CONFLICT (token) DO NOTHING`,
            [
              s.token,
              s.user_id,
              s.role || 'student',
              s.user_agent || '',
              toIsoOrNull(s.created_at) || new Date().toISOString(),
              toIsoOrNull(s.expires_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM password_reset_tokens');
        const pwdTokens = sqliteDb.prepare('SELECT * FROM password_reset_tokens').all();
        for (const t of pwdTokens) {
          if (!userIdSet.has(t.user_id)) continue;
          await query(
            `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, consumed_at, created_at)
             VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              t.id,
              t.user_id,
              t.token_hash,
              toIsoOrNull(t.expires_at) || new Date().toISOString(),
              toIsoOrNull(t.consumed_at),
              toIsoOrNull(t.created_at) || new Date().toISOString(),
            ]
          );
        }

        // 3. Signzy Age Verification, Parent Verification, Consents, Audit Logs & DPDP Deletions
        const ageVerifs = sqliteDb.prepare('SELECT * FROM age_verifications').all();
        for (const av of ageVerifs) {
          if (!userIdSet.has(av.user_id)) continue;
          await query(
            `INSERT INTO age_verifications (
               id, user_id, provider_name, provider_reference, verification_status,
               verified_age_band, method_used, idempotency_key, hosted_url,
               expires_at, verification_timestamp, created_at
             ) VALUES (
               $1, $2, $3, $4, $5::verification_status_enum,
               $6::verified_age_band_enum, $7, $8, $9,
               $10::timestamptz, $11::timestamptz, $12::timestamptz
             )
             ON CONFLICT (id) DO UPDATE SET
               verification_status = EXCLUDED.verification_status,
               verified_age_band = EXCLUDED.verified_age_band,
               verification_timestamp = EXCLUDED.verification_timestamp`,
            [
              av.id,
              av.user_id,
              av.provider_name,
              av.provider_reference,
              av.verification_status || 'PENDING',
              av.verified_age_band || 'UNVERIFIED',
              av.method_used || 'digilocker',
              av.idempotency_key || null,
              av.hosted_url || '',
              toIsoOrNull(av.expires_at) || new Date().toISOString(),
              toIsoOrNull(av.verification_timestamp),
              toIsoOrNull(av.created_at) || new Date().toISOString(),
            ]
          );
        }

        const parentVerifs = sqliteDb.prepare('SELECT * FROM parent_verifications').all();
        const pvIdSet = new Set();
        for (const pv of parentVerifs) {
          if (!userIdSet.has(pv.student_id)) continue;
          pvIdSet.add(pv.id);
          await query(
            `INSERT INTO parent_verifications (
               id, student_id, parent_name, parent_email, parent_email_lookup_hash,
               parent_mobile, parent_mobile_lookup_hash, relationship_type,
               adult_verification_status, authority_verification_status, provider_reference,
               invite_token_hash, invite_expires_at, invite_consumed_at,
               parent_session_hash, parent_session_expires_at, created_at
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8::parent_relationship_enum,
               $9, $10, $11,
               $12, $13::timestamptz, $14::timestamptz,
               $15, $16::timestamptz, $17::timestamptz
             )
             ON CONFLICT (id) DO UPDATE SET
               parent_name = EXCLUDED.parent_name,
               parent_email = EXCLUDED.parent_email,
               parent_email_lookup_hash = EXCLUDED.parent_email_lookup_hash,
               parent_mobile = EXCLUDED.parent_mobile,
               parent_mobile_lookup_hash = EXCLUDED.parent_mobile_lookup_hash,
               relationship_type = EXCLUDED.relationship_type,
               adult_verification_status = EXCLUDED.adult_verification_status,
               authority_verification_status = EXCLUDED.authority_verification_status,
               provider_reference = EXCLUDED.provider_reference,
               invite_expires_at = EXCLUDED.invite_expires_at,
               invite_consumed_at = EXCLUDED.invite_consumed_at,
               parent_session_hash = EXCLUDED.parent_session_hash,
               parent_session_expires_at = EXCLUDED.parent_session_expires_at`,
            [
              pv.id,
              pv.student_id,
              pv.parent_name || '',
              pv.parent_email,
              pv.parent_email_lookup_hash,
              pv.parent_mobile || '',
              pv.parent_mobile_lookup_hash || '',
              pv.relationship_type || 'UNSPECIFIED',
              pv.adult_verification_status || 'PENDING',
              pv.authority_verification_status || 'PENDING',
              pv.provider_reference || null,
              pv.invite_token_hash || null,
              toIsoOrNull(pv.invite_expires_at) || new Date().toISOString(),
              toIsoOrNull(pv.invite_consumed_at),
              pv.parent_session_hash || null,
              toIsoOrNull(pv.parent_session_expires_at),
              toIsoOrNull(pv.created_at) || new Date().toISOString(),
            ]
          );
        }

        const consents = sqliteDb.prepare('SELECT * FROM parental_consents').all();
        for (const pc of consents) {
          if (!userIdSet.has(pc.student_id) || !pvIdSet.has(pc.parent_verification_id)) continue;
          await query(
            `INSERT INTO parental_consents (
               id, student_id, parent_verification_id, consent_status, consent_version,
               provider_reference, verification_result, policy_acknowledgements,
               withdrawal_token_hash, consent_timestamp, withdrawal_timestamp
             ) VALUES (
               $1, $2, $3, $4::consent_status_enum, $5,
               $6, $7, $8::jsonb,
               $9, $10::timestamptz, $11::timestamptz
             )
             ON CONFLICT (id) DO UPDATE SET
               consent_status = EXCLUDED.consent_status,
               withdrawal_timestamp = EXCLUDED.withdrawal_timestamp`,
            [
              pc.id,
              pc.student_id,
              pc.parent_verification_id,
              pc.consent_status,
              pc.consent_version,
              pc.provider_reference,
              pc.verification_result,
              JSON.stringify(safeJsonParse(pc.policy_acknowledgements_json, {})),
              pc.withdrawal_token_hash || null,
              toIsoOrNull(pc.consent_timestamp) || new Date().toISOString(),
              toIsoOrNull(pc.withdrawal_timestamp),
            ]
          );
        }

        const auditLogs = sqliteDb.prepare('SELECT * FROM verification_audit_logs').all();
        for (const al of auditLogs) {
          await query(
            `INSERT INTO verification_audit_logs (
               id, user_reference, event_type, event_status, provider_reference, actor_role, metadata, timestamp
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              al.id,
              al.user_reference,
              al.event_type,
              al.event_status,
              al.provider_reference || '',
              al.actor_role || 'system',
              JSON.stringify(safeJsonParse(al.metadata_json, {})),
              toIsoOrNull(al.timestamp) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM webhook_replay_nonces');
        const nonces = sqliteDb.prepare('SELECT * FROM webhook_replay_nonces').all();
        for (const n of nonces) {
          await query(
            'INSERT INTO webhook_replay_nonces (nonce_key, received_at) VALUES ($1, $2::timestamptz) ON CONFLICT DO NOTHING',
            [n.nonce_key, toIsoOrNull(n.received_at) || new Date().toISOString()]
          );
        }

        const deletions = sqliteDb.prepare('SELECT * FROM data_deletion_requests').all();
        for (const dr of deletions) {
          await query(
            `INSERT INTO data_deletion_requests (
               id, user_id, reason, requested_by_role, status, scheduled_purge_at, completed_at, created_at
             ) VALUES ($1, $2, $3, $4, $5::deletion_status_enum, $6::timestamptz, $7::timestamptz, $8::timestamptz)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               scheduled_purge_at = EXCLUDED.scheduled_purge_at,
               completed_at = EXCLUDED.completed_at`,
            [
              dr.id,
              dr.user_id,
              dr.reason,
              dr.requested_by_role,
              dr.status || 'SCHEDULED',
              toIsoOrNull(dr.scheduled_purge_at) || new Date().toISOString(),
              toIsoOrNull(dr.completed_at),
              toIsoOrNull(dr.created_at) || new Date().toISOString(),
            ]
          );
        }

        // 4. Media Assets
        await query('DELETE FROM media_assets');
        const mediaRows = sqliteDb.prepare('SELECT * FROM media_assets').all();
        for (const m of mediaRows) {
          if (!userIdSet.has(m.owner_id)) continue;
          await query(
            `INSERT INTO media_assets (id, owner_id, filename, mime_type, byte_size, purpose, storage_url, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              m.id,
              m.owner_id,
              m.filename,
              m.mime_type,
              Number(m.byte_size) || 1,
              ['avatar', 'post', 'story', 'reel'].includes(m.purpose) ? m.purpose : 'post',
              `/uploads/${m.filename}`,
              toIsoOrNull(m.created_at) || new Date().toISOString(),
            ]
          );
        }

        // 5. Posts, Reels, Stories, @Tagged People, Comments & Story Views
        const posts = sqliteDb.prepare('SELECT * FROM posts').all().filter((p) => userIdSet.has(p.author_id));
        const postIdSet = new Set(posts.map((p) => p.id));
        if (posts.length === 0) {
          await query('DELETE FROM posts');
        } else {
          await query('DELETE FROM posts WHERE NOT (id = ANY($1::text[]))', [
            Array.from(postIdSet),
          ]);
        }

        for (const p of posts) {
          const meta = safeJsonParse(p.media_meta, {});
          const skTags = safeJsonParse(p.skill_tags, []);
          await query(
            `INSERT INTO posts (
               id, author_id, author_name, author_handle, author_school, author_avatar,
               category, title, topic, content, media_type, image_url, video_url, attached_link,
               media_meta, skill_tags, likes_count, shares_count, views_count, expires_at, created_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6,
               $7::post_category_enum, $8, $9, $10, $11::media_type_enum, $12, $13, $14,
               $15::jsonb, $16::text[], $17, $18, $19, $20::timestamptz, $21::timestamptz
             )
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               topic = EXCLUDED.topic,
               content = EXCLUDED.content,
               image_url = EXCLUDED.image_url,
               video_url = EXCLUDED.video_url,
               attached_link = EXCLUDED.attached_link,
               media_meta = EXCLUDED.media_meta,
               skill_tags = EXCLUDED.skill_tags,
               likes_count = EXCLUDED.likes_count,
               shares_count = EXCLUDED.shares_count,
               views_count = EXCLUDED.views_count,
               expires_at = EXCLUDED.expires_at`,
            [
              p.id,
              p.author_id,
              p.author_name,
              p.author_handle,
              p.author_school,
              p.author_avatar,
              p.category || 'post',
              p.title || '',
              meta.topic || '',
              p.content,
              p.media_type || 'none',
              meta.imageUrl || '',
              meta.videoUrl || '',
              meta.attachedLink || '',
              JSON.stringify(meta),
              Array.isArray(skTags) ? skTags.map(String) : [],
              Math.max(0, Number(p.likes_count) || 0),
              Math.max(0, Number(p.shares_count) || 0),
              Math.max(0, Number(p.views_count) || 0),
              toIsoOrNull(p.expires_at),
              toIsoOrNull(p.created_at) || new Date().toISOString(),
            ]
          );

          await query('DELETE FROM post_tagged_people WHERE post_id = $1', [p.id]);
          const taggedHandles = Array.isArray(meta.taggedPeople)
            ? meta.taggedPeople.slice(0, 10)
            : [];
          for (const rawH of taggedHandles) {
            const cleanUname = String(rawH).replace(/^@+/, '').toLowerCase();
            const handleStr = `@${cleanUname}`;
            const taggedUid = usernameToId.get(cleanUname) || null;
            if (cleanUname) {
              await query(
                `INSERT INTO post_tagged_people (post_id, tagged_handle, tagged_user_id)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [p.id, handleStr, taggedUid]
              );
            }
          }
        }

        const comments = sqliteDb
          .prepare('SELECT * FROM post_comments')
          .all()
          .filter((c) => postIdSet.has(c.post_id) && userIdSet.has(c.author_id));

        // Also backfill any legacy inline `comments_json` entries not yet present in `post_comments`
        const seenCommentIds = new Set(comments.map((c) => c.id));
        for (const p of posts) {
          const inlineComments = safeJsonParse(p.comments_json, []);
          for (const ic of inlineComments) {
            if (ic && ic.id && !seenCommentIds.has(ic.id)) {
              const resolvedAuthorId =
                ic.authorId && userIdSet.has(ic.authorId) ? ic.authorId : p.author_id;
              comments.push({
                id: ic.id,
                post_id: p.id,
                author_id: resolvedAuthorId,
                author_name: ic.author || 'TeenStack Student',
                author_avatar: ic.avatar || 'violet-coder',
                text: ic.text || '',
                created_at: p.created_at,
              });
              seenCommentIds.add(ic.id);
            }
          }
        }

        const commentIdSet = new Set(comments.map((c) => c.id));
        if (comments.length === 0) {
          await query('DELETE FROM post_comments');
        } else {
          await query('DELETE FROM post_comments WHERE NOT (id = ANY($1::text[]))', [
            Array.from(commentIdSet),
          ]);
        }
        for (const c of comments) {
          await query(
            `INSERT INTO post_comments (id, post_id, author_id, author_name, author_avatar, text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              c.id,
              c.post_id,
              c.author_id,
              c.author_name,
              c.author_avatar,
              c.text,
              toIsoOrNull(c.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM story_views');
        const sViews = sqliteDb.prepare('SELECT * FROM story_views').all();
        for (const sv of sViews) {
          if (!postIdSet.has(sv.story_id) || !userIdSet.has(sv.viewer_id)) continue;
          await query(
            'INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES ($1, $2, $3::timestamptz) ON CONFLICT DO NOTHING',
            [sv.story_id, sv.viewer_id, toIsoOrNull(sv.viewed_at) || new Date().toISOString()]
          );
        }

        // 6. Portfolio Projects, Achievements & Social Graph
        await query('DELETE FROM student_projects');
        for (const pr of sqliteDb.prepare('SELECT * FROM student_projects').all()) {
          if (!userIdSet.has(pr.user_id)) continue;
          await query(
            `INSERT INTO student_projects (id, user_id, title, summary, link, tag, featured, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              pr.id,
              pr.user_id,
              pr.title,
              pr.summary || '',
              pr.link || '',
              pr.tag || 'Student Build',
              Boolean(pr.featured),
              toIsoOrNull(pr.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM student_achievements');
        for (const ac of sqliteDb.prepare('SELECT * FROM student_achievements').all()) {
          if (!userIdSet.has(ac.user_id)) continue;
          await query(
            `INSERT INTO student_achievements (id, user_id, title, achievement_type, issuer, verified, course_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              ac.id,
              ac.user_id,
              ac.title,
              ac.course_id ? 'certificate' : 'milestone',
              ac.issuer || 'TeenStack Verified Network',
              Boolean(ac.verified),
              ac.course_id || null,
              toIsoOrNull(ac.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM friendships');
        for (const f of sqliteDb.prepare('SELECT * FROM friendships').all()) {
          if (!userIdSet.has(f.user_id) || !userIdSet.has(f.friend_id) || f.user_id === f.friend_id) continue;
          await query(
            `INSERT INTO friendships (user_id, friend_id, status, created_at)
             VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT DO NOTHING`,
            [f.user_id, f.friend_id, f.status || 'ACCEPTED', toIsoOrNull(f.created_at) || new Date().toISOString()]
          );
        }

        // 7. Opportunities, Courses & Interactions (Likes / Bookmarks / Module Progress)
        const opps = sqliteDb.prepare('SELECT * FROM opportunities').all();
        const oppIdSet = new Set(opps.map((o) => o.id));
        for (const o of opps) {
          const sk = safeJsonParse(o.skills_json, []);
          await query(
            `INSERT INTO opportunities (
               id, creator_id, title, organization, type, deadline, mode, reward, age_range, skills, description, featured, created_at
             ) VALUES (
               $1, $2, $3, $4, $5::opportunity_type_enum, $6, $7::opportunity_mode_enum, $8, $9, $10::text[], $11, $12, $13::timestamptz
             )
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               deadline = EXCLUDED.deadline,
               reward = EXCLUDED.reward,
               description = EXCLUDED.description`,
            [
              o.id,
              o.creator_id && userIdSet.has(o.creator_id) ? o.creator_id : null,
              o.title,
              o.organization,
              o.type || 'Student Bounty',
              o.deadline,
              o.mode || 'Remote',
              o.reward,
              o.age_range || 'Ages 13–19',
              Array.isArray(sk) ? sk.map(String) : [],
              o.description,
              Boolean(o.featured),
              toIsoOrNull(o.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM opportunity_applications');
        for (const oa of sqliteDb.prepare('SELECT * FROM opportunity_applications').all()) {
          if (!oppIdSet.has(oa.opportunity_id) || !userIdSet.has(oa.user_id)) continue;
          await query(
            `INSERT INTO opportunity_applications (id, opportunity_id, user_id, pitch_note, portfolio_snapshot, status, created_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz) ON CONFLICT DO NOTHING`,
            [
              oa.id,
              oa.opportunity_id,
              oa.user_id,
              oa.pitch_note || '',
              JSON.stringify(safeJsonParse(oa.portfolio_snapshot_json, {})),
              oa.status || 'SUBMITTED',
              toIsoOrNull(oa.created_at) || new Date().toISOString(),
            ]
          );
        }

        const courses = sqliteDb.prepare('SELECT * FROM courses').all();
        const courseIdSet = new Set(courses.map((c) => c.id));
        for (const c of courses) {
          const sk = safeJsonParse(c.skills_json, []);
          await query(
            `INSERT INTO courses (id, title, track, level, duration, mentor, skills, summary, sort_order, created_at)
             VALUES ($1, $2, $3, $4::course_level_enum, $5, $6, $7::text[], $8, $9, $10::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              c.id,
              c.title,
              c.track,
              c.level || 'Beginner',
              c.duration,
              c.mentor,
              Array.isArray(sk) ? sk.map(String) : [],
              c.summary,
              Number(c.sort_order) || 0,
              toIsoOrNull(c.created_at) || new Date().toISOString(),
            ]
          );
        }

        const cMods = sqliteDb.prepare('SELECT * FROM course_modules').all();
        const validModKey = new Set();
        for (const m of cMods) {
          if (!courseIdSet.has(m.course_id)) continue;
          validModKey.add(`${m.course_id}:${m.module_code}`);
          await query(
            `INSERT INTO course_modules (id, course_id, module_code, title, duration, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [m.id, m.course_id, m.module_code, m.title, m.duration, Number(m.sort_order) || 0]
          );
        }

        await query('DELETE FROM course_module_progress');
        for (const mp of sqliteDb.prepare('SELECT * FROM course_module_progress').all()) {
          if (!userIdSet.has(mp.user_id) || !validModKey.has(`${mp.course_id}:${mp.module_code}`)) continue;
          await query(
            `INSERT INTO course_module_progress (user_id, course_id, module_code, completed_at)
             VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT DO NOTHING`,
            [mp.user_id, mp.course_id, mp.module_code, toIsoOrNull(mp.completed_at) || new Date().toISOString()]
          );
        }

        await query('DELETE FROM user_interactions');
        await query('DELETE FROM post_likes');
        await query('DELETE FROM post_bookmarks');
        await query('DELETE FROM opportunity_bookmarks');
        for (const ui of sqliteDb.prepare('SELECT * FROM user_interactions').all()) {
          if (!userIdSet.has(ui.user_id)) continue;
          await query(
            `INSERT INTO user_interactions (user_id, target_type, target_id, meta)
             VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING`,
            [ui.user_id, ui.target_type, ui.target_id, JSON.stringify(safeJsonParse(ui.meta_json, {}))]
          );
          if (ui.target_type === 'like' && postIdSet.has(ui.target_id)) {
            await query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
              ui.target_id,
              ui.user_id,
            ]);
          } else if (ui.target_type === 'save' && postIdSet.has(ui.target_id)) {
            await query('INSERT INTO post_bookmarks (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
              ui.target_id,
              ui.user_id,
            ]);
          } else if (ui.target_type === 'opportunity_save' && oppIdSet.has(ui.target_id)) {
            await query(
              'INSERT INTO opportunity_bookmarks (opportunity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [ui.target_id, ui.user_id]
            );
          }
        }

        // 8. Chat Threads, Participants & Messages
        const threads = sqliteDb.prepare('SELECT * FROM chat_threads').all();
        const threadIdSet = new Set(threads.map((t) => t.id));
        for (const t of threads) {
          await query(
            `INSERT INTO chat_threads (id, name, handle, role_badge, avatar_preset, is_group, direct_key, updated_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
             ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
            [
              t.id,
              t.name,
              t.handle || '',
              t.role_badge || '',
              t.avatar_preset || 'violet-coder',
              Boolean(t.is_group),
              t.direct_key || null,
              toIsoOrNull(t.updated_at) || new Date().toISOString(),
              toIsoOrNull(t.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM chat_participants');
        for (const cp of sqliteDb.prepare('SELECT * FROM chat_participants').all()) {
          if (!threadIdSet.has(cp.thread_id) || !userIdSet.has(cp.user_id)) continue;
          await query(
            `INSERT INTO chat_participants (thread_id, user_id, last_read_at, joined_at)
             VALUES ($1, $2, $3::timestamptz, $4::timestamptz) ON CONFLICT DO NOTHING`,
            [
              cp.thread_id,
              cp.user_id,
              toIsoOrNull(cp.last_read_at) || '1970-01-01T00:00:00Z',
              toIsoOrNull(cp.joined_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM messages');
        for (const m of sqliteDb.prepare('SELECT * FROM messages').all()) {
          if (!threadIdSet.has(m.thread_id) || !userIdSet.has(m.sender_id)) continue;
          const att = safeJsonParse(m.attachment_json, null);
          await query(
            `INSERT INTO messages (id, thread_id, sender_id, sender_name, text, attachment, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz) ON CONFLICT (id) DO NOTHING`,
            [
              m.id,
              m.thread_id,
              m.sender_id,
              m.sender_name,
              m.text,
              att ? JSON.stringify(att) : null,
              toIsoOrNull(m.created_at) || new Date().toISOString(),
            ]
          );
        }

        // 9. Notifications, User Blocks & Safety Reports
        await query('DELETE FROM notifications');
        for (const n of sqliteDb.prepare('SELECT * FROM notifications').all()) {
          if (!userIdSet.has(n.user_id)) continue;
          await query(
            `INSERT INTO notifications (id, user_id, type, title, detail, target_route, is_read, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) ON CONFLICT (id) DO NOTHING`,
            [
              n.id,
              n.user_id,
              n.type || 'system',
              n.title,
              n.detail || '',
              n.target_route || 'home',
              Boolean(n.is_read),
              toIsoOrNull(n.created_at) || new Date().toISOString(),
            ]
          );
        }

        await query('DELETE FROM user_blocks');
        for (const b of sqliteDb.prepare('SELECT * FROM user_blocks').all()) {
          if (!userIdSet.has(b.blocker_id) || !userIdSet.has(b.blocked_id) || b.blocker_id === b.blocked_id) continue;
          await query(
            `INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at)
             VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT DO NOTHING`,
            [b.blocker_id, b.blocked_id, b.reason || '', toIsoOrNull(b.created_at) || new Date().toISOString()]
          );
        }

        await query('DELETE FROM safety_reports');
        for (const r of sqliteDb.prepare('SELECT * FROM safety_reports').all()) {
          if (!userIdSet.has(r.reporter_id)) continue;
          await query(
            `INSERT INTO safety_reports (
               id, reporter_id, target_type, target_id, reason_category, details,
               status, resolution_note, reviewed_by, reviewed_at, created_at
             ) VALUES (
               $1, $2, $3::report_target_enum, $4, $5, $6,
               $7::report_status_enum, $8, $9, $10::timestamptz, $11::timestamptz
             ) ON CONFLICT (id) DO NOTHING`,
            [
              r.id,
              r.reporter_id,
              r.target_type,
              r.target_id,
              r.reason_category,
              r.details || '',
              r.status || 'OPEN',
              r.resolution_note || '',
              r.reviewed_by || null,
              toIsoOrNull(r.reviewed_at),
              toIsoOrNull(r.created_at) || new Date().toISOString(),
            ]
          );
        }

        await exec('COMMIT');
      } catch (err) {
        await exec('ROLLBACK').catch(() => {});
        throw err;
      }

      if (persist) {
        await persistToDisk();
      }
    });

    return syncChain;
  }

  async function getDatabaseOverview() {
    const tablesRes = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `);
    const viewsRes = await query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name ASC
    `);
    const enumsRes = await query(`
      SELECT typname
      FROM pg_type
      WHERE typtype = 'e'
      ORDER BY typname ASC
    `);

    const tableCounts = {};
    for (const row of tablesRes.rows) {
      const cRes = await query(`SELECT COUNT(*)::int AS c FROM "${row.table_name}"`);
      tableCounts[row.table_name] = cRes.rows[0]?.c || 0;
    }

    const directorySample = await query(`
      SELECT id, full_name, username, verified_age_band, account_status, school,
             experience_years, rate_per_project, active_skills, subjects, skill_tags,
             projects_count::int, achievements_count::int, friends_count::int
      FROM v_student_complete_directory
      ORDER BY created_at ASC
      LIMIT 10
    `);

    return {
      engine: 'PostgreSQL',
      mode,
      version: pgVersion,
      totalTables: tablesRes.rows.length,
      totalViews: viewsRes.rows.length,
      totalEnums: enumsRes.rows.length,
      tables: tableCounts,
      views: viewsRes.rows.map((v) => v.table_name),
      enums: enumsRes.rows.map((e) => e.typname),
      studentDirectorySample: directorySample.rows,
    };
  }

  async function close() {
    await syncChain.catch(() => {});
    if (pool) {
      await pool.end();
    } else if (pglite) {
      await persistToDisk().catch(() => {});
      await pglite.close();
    }
  }

  return {
    mode,
    version: pgVersion,
    exec,
    query,
    syncFromSqlite,
    persistToDisk,
    getDatabaseOverview,
    close,
  };
}
