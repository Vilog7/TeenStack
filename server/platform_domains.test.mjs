import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createTeenStackServer } from './index.mjs';

async function startSeededPlatformServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teenstack-domains-test-'));
  const dbPath = path.join(tmpDir, 'domains.sqlite');
  const env = {
    NODE_ENV: 'test',
    SIGNZY_MODE: 'sandbox_mock',
    SIGNZY_WEBHOOK_SECRET: 'whsec_domains_test_secret_123456',
  };

  const ctx = createTeenStackServer({ dbPath, env, seedDemo: true });
  await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
  const addr = ctx.server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function apiCall(pathname, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function cleanup() {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { ...ctx, apiCall, cleanup };
}

test('1. Bootstrap, Username Check, and Cryptographic Password Reset Flow', async () => {
  const h = await startSeededPlatformServer();
  try {
    // Check username availability
    const taken = await h.apiCall('/api/auth/check-username?username=arav_dev');
    assert.equal(taken.status, 200);
    assert.equal(taken.data.available, false);

    const avail = await h.apiCall('/api/auth/check-username?username=fresh_builder_99');
    assert.equal(avail.data.available, true);

    // Login as seeded demo student
    const login1 = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav@teenstack.edu', password: 'TeenStack@2026', rememberMe: true },
    });
    assert.equal(login1.status, 200);
    const token = login1.data.token;

    // Unified bootstrap returns all relational domains
    const boot = await h.apiCall('/api/bootstrap', { token });
    assert.equal(boot.status, 200);
    assert.ok(boot.data.posts.length >= 5);
    assert.ok(boot.data.peers.length >= 5);
    assert.ok(boot.data.opportunities.length >= 6);
    assert.ok(boot.data.courses.length >= 4);
    assert.ok(boot.data.threads.length >= 4);
    assert.ok(boot.data.unreadChatsCount > 0, 'Demo user starts with unread messages');

    // Request password reset -> confirm -> old session revoked -> login with new password
    const reqReset = await h.apiCall('/api/auth/password-reset/request', {
      method: 'POST',
      body: { email: 'arav@teenstack.edu' },
    });
    assert.equal(reqReset.status, 200);
    assert.ok(reqReset.data.devResetToken);

    const confReset = await h.apiCall('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: { resetToken: reqReset.data.devResetToken, newPassword: 'NewSecurePassword!99' },
    });
    assert.equal(confReset.status, 200);

    // Replaying single-use reset token fails with 410
    const replayReset = await h.apiCall('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: { resetToken: reqReset.data.devResetToken, newPassword: 'AnotherPassword!99' },
    });
    assert.equal(replayReset.status, 410);

    // Old session token was revoked
    const oldSessionCheck = await h.apiCall('/api/bootstrap', { token });
    assert.equal(oldSessionCheck.status, 401);

    // Login with new password succeeds
    const login2 = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'NewSecurePassword!99', rememberMe: false },
    });
    assert.equal(login2.status, 200);
  } finally {
    await h.cleanup();
  }
});

test('2. Feed Posts, Reels, 24h Story Expiry, Max-10 @Tag Cap, @Mention Notifications, Shares & Deletion', async () => {
  const h = await startSeededPlatformServer();
  try {
    const { data: auth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const token = auth.token;

    // 11 @tags must be rejected by server (max 10)
    const elevenTags = Array.from({ length: 11 }, (_, i) => `@user_${i + 1}`);
    const overTagged = await h.apiCall('/api/posts', {
      method: 'POST',
      token,
      body: {
        category: 'post',
        title: 'Too many tags',
        content: 'Testing server cap',
        mediaType: 'none',
        mediaMeta: { taggedPeople: elevenTags },
        skillTags: [],
      },
    });
    assert.equal(overTagged.status, 400);
    assert.equal(overTagged.data.code, 'MAX_TAGS_EXCEEDED');

    // Valid Reel tagging @rohan_builds normalizes link & notifies peer-rohan
    const createdReel = await h.apiCall('/api/posts', {
      method: 'POST',
      token,
      body: {
        category: 'reel',
        title: 'Robotics Telemetry',
        content: 'Testing live telemetry with @rohan_builds!',
        mediaType: 'video_showcase',
        mediaMeta: {
          createType: 'reel',
          topic: 'Robotics',
          taggedPeople: ['@rohan_builds'],
          attachedLink: 'github.com/vihaan/rover',
        },
        skillTags: ['Robotics'],
      },
    });
    assert.equal(createdReel.status, 201);
    assert.equal(createdReel.data.post.mediaMeta.attachedLink, 'https://github.com/vihaan/rover');

    const rohanNotifs = h.db
      .prepare("SELECT * FROM notifications WHERE user_id = 'peer-rohan' AND type = 'mention'")
      .all();
    assert.equal(rohanNotifs.length, 1);

    // Share increments sharesCount
    const shareRes = await h.apiCall(`/api/posts/${createdReel.data.post.id}/share`, {
      method: 'POST',
      token,
    });
    assert.equal(shareRes.status, 200);
    assert.equal(shareRes.data.sharesCount, 1);

    // Story sets 24h expires_at, records story view, and hides once expired
    const storyRes = await h.apiCall('/api/posts', {
      method: 'POST',
      token,
      body: {
        category: 'story',
        title: 'Hackathon Night',
        content: 'Shipping v3 tonight!',
        mediaType: 'image',
        mediaMeta: { imageUrl: 'images/posts/hackathon-win.jpg' },
        skillTags: [],
      },
    });
    assert.equal(storyRes.status, 201);
    assert.ok(storyRes.data.post.expiresAt);

    await h.apiCall(`/api/stories/${storyRes.data.post.id}/view`, { method: 'POST', token });
    const viewsCount = h.db
      .prepare('SELECT views_count FROM posts WHERE id = ?')
      .get(storyRes.data.post.id).views_count;
    assert.equal(viewsCount, 1);

    // Expire the story -> disappears from /api/posts
    h.db
      .prepare('UPDATE posts SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), storyRes.data.post.id);

    const feedAfterExpiry = await h.apiCall('/api/posts', { token });
    assert.equal(
      feedAfterExpiry.data.posts.some((p) => p.id === storyRes.data.post.id),
      false,
      'Expired 24h story must be filtered out'
    );

    // Non-owner cannot delete Maya's post (403), owner can delete own Reel (200)
    const delForbidden = await h.apiCall('/api/posts/post-solaris-1', {
      method: 'DELETE',
      token,
    });
    assert.equal(delForbidden.status, 403);

    const delOwn = await h.apiCall(`/api/posts/${createdReel.data.post.id}`, {
      method: 'DELETE',
      token,
    });
    assert.equal(delOwn.status, 200);
  } finally {
    await h.cleanup();
  }
});

test('3. Social Graph (Friends & Mutuals), Portfolio Projects & Achievements CRUD, Chats Safety & DM Privacy', async () => {
  const h = await startSeededPlatformServer();
  try {
    const { data: auth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const token = auth.token;

    // Add & delete relational Project and Achievement
    const addProj = await h.apiCall('/api/profile/projects', {
      method: 'POST',
      token,
      body: {
        title: 'Neural Braille Pad',
        summary: 'Tactile hardware interface',
        link: 'teenstack.dev/braille',
        tag: 'Hardware · AI',
      },
    });
    assert.equal(addProj.status, 201);
    assert.ok(
      addProj.data.user.profile.portfolioProjects.some((p) => p.title === 'Neural Braille Pad')
    );

    const addAch = await h.apiCall('/api/profile/achievements', {
      method: 'POST',
      token,
      body: { title: 'Winner — National STEM Fair 2026' },
    });
    assert.equal(addAch.status, 201);
    assert.ok(addAch.data.user.profile.achievements.includes('Winner — National STEM Fair 2026'));

    // Connect with Rohan & fetch full profile bundle (posts, stories, projects, achievements, friends, mutuals)
    const conn = await h.apiCall('/api/network/connect', {
      method: 'POST',
      token,
      body: { peerId: 'peer-rohan' },
    });
    assert.equal(conn.status, 200);
    assert.equal(conn.data.connected, true);

    const bundle = await h.apiCall('/api/network/profile/rohan_builds', { token });
    assert.equal(bundle.status, 200);
    assert.equal(bundle.data.profile.handle, '@rohan_builds');
    assert.ok(bundle.data.posts.length >= 2);
    assert.ok(bundle.data.projects.length >= 1);
    assert.ok(bundle.data.achievements.length >= 1);
    assert.ok(bundle.data.friends.length >= 1);
    assert.ok(bundle.data.mutuals.length >= 1);

    // Set Kai's privacy to connections_only -> DM from unconnected Arav is blocked (403 DM_CONNECTIONS_ONLY)
    const kaiRow = h.db.prepare("SELECT profile_json FROM users WHERE id = 'peer-kai'").get();
    const kaiProf = JSON.parse(kaiRow.profile_json);
    kaiProf.privacy.dmPermission = 'connections_only';
    h.db
      .prepare("UPDATE users SET profile_json = ? WHERE id = 'peer-kai'")
      .run(JSON.stringify(kaiProf));

    const blockedDm = await h.apiCall('/api/chats/threads/direct', {
      method: 'POST',
      token,
      body: { peerId: 'peer-kai' },
    });
    assert.equal(blockedDm.status, 403);
    assert.equal(blockedDm.data.code, 'DM_CONNECTIONS_ONLY');

    // Mark thread-maya read -> unread count for thread-maya becomes 0
    const readRes = await h.apiCall('/api/chats/threads/thread-maya/read', {
      method: 'POST',
      token,
    });
    const mayaThread = readRes.data.threads.find((t) => t.id === 'thread-maya');
    assert.equal(mayaThread.unread, 0);

    // Teen Safety Filter blocks sharing a 12-digit Aadhaar-like number in chat (422)
    const unsafeMsg = await h.apiCall('/api/messages', {
      method: 'POST',
      token,
      body: { threadId: 'thread-maya', text: 'Here is my ID 4589 1234 9988' },
    });
    assert.equal(unsafeMsg.status, 422);
    assert.equal(unsafeMsg.data.code, 'SAFETY_FILTER_SENSITIVE_ID');
  } finally {
    await h.cleanup();
  }
});

test('4. Opportunities Pitch Applications, Courses Auto-Credential Issuance, Search & Notifications', async () => {
  const h = await startSeededPlatformServer();
  try {
    const { data: auth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const token = auth.token;

    // Create new Student Bounty & apply with pitchNote
    const createdOpp = await h.apiCall('/api/opportunities', {
      method: 'POST',
      token,
      body: {
        title: 'Physics Sim UI Polish',
        organization: 'Westlake Physics Club',
        type: 'Student Bounty',
        deadline: '5 Days Left',
        mode: 'Remote',
        reward: '₹8,000 Grant',
        skills: ['React', 'WebGL'],
        description: 'Add touch sliders to pendulum lab.',
      },
    });
    assert.equal(createdOpp.status, 201);

    const applied = await h.apiCall(`/api/opportunities/${createdOpp.data.opportunity.id}/apply`, {
      method: 'POST',
      token,
      body: { pitchNote: 'Shipped Solaris Terrain Lab at 60fps!' },
    });
    assert.equal(applied.status, 201);

    const savedAppRow = h.db
      .prepare('SELECT pitch_note FROM opportunity_applications WHERE id = ?')
      .get(applied.data.applicationId);
    assert.equal(savedAppRow.pitch_note, 'Shipped Solaris Terrain Lab at 60fps!');

    // Complete remaining modules of course-2 (m1 already seeded; toggle m2 and m3) -> auto-awards verified credential!
    await h.apiCall('/api/courses/course-2/modules/m2/toggle', { method: 'POST', token });
    const finalMod = await h.apiCall('/api/courses/course-2/modules/m3/toggle', {
      method: 'POST',
      token,
    });
    assert.equal(finalMod.status, 200);
    assert.equal(finalMod.data.certificateAwarded, true);
    assert.ok(
      finalMod.data.user.profile.achievements.some((a) =>
        a.includes('Full-Stack Student Apps with TypeScript & SQLite')
      ),
      'Completing 100% of course modules must auto-issue verified credential to Profile Achievements'
    );

    // Unified global search & notifications read-all
    const searchRes = await h.apiCall('/api/search?q=Solaris', { token });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.posts.length >= 1);

    const readNotifs = await h.apiCall('/api/notifications/read-all', { method: 'POST', token });
    assert.equal(readNotifs.status, 200);
    assert.equal(readNotifs.data.notifications.every((n) => n.unread === false), true);
  } finally {
    await h.cleanup();
  }
});
