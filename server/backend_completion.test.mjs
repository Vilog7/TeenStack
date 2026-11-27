import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createTeenStackServer } from './index.mjs';

// Minimal valid 1x1 transparent PNG (67 bytes, valid 89 50 4E 47 0D 0A 1A 0A header)
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;
const SAMPLE_PNG_BUFFER = Buffer.from(SAMPLE_PNG_BASE64, 'base64');

async function startCompletionTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teenstack-completion-test-'));
  const dbPath = path.join(tmpDir, 'completion.sqlite');
  const env = {
    NODE_ENV: 'test',
    SIGNZY_MODE: 'sandbox_mock',
    SIGNZY_WEBHOOK_SECRET: 'whsec_completion_test_secret_98765',
    COMPLIANCE_ADMIN_KEY: 'adm_completion_secret_key_2026',
  };

  const ctx = createTeenStackServer({ dbPath, env, seedDemo: true });
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

  async function registerAndActivateAdultStudent({ username, email, mobile }) {
    const reg = await apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: `Student ${username}`,
        declaredDob: '2006-04-10',
        email,
        mobile,
        username,
        password: 'StrongPassword!2026',
      },
    });
    assert.equal(reg.status, 201);
    const tok = reg.data.token;
    await apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: tok,
      body: { idempotencyKey: `idem-${username}` },
    });
    const sim = await apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: tok,
      body: { scenario: 'VERIFIED_18_PLUS' },
    });
    assert.equal(sim.data.user.accountStatus, 'ACTIVE');
    return { token: tok, user: sim.data.user };
  }

  async function cleanup() {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { ...ctx, baseUrl, apiCall, registerAndActivateAdultStudent, cleanup };
}

test('1. Binary & Data-URL Media Upload Service, Magic-Byte Security & Auto-Cleanup on Post Delete', async () => {
  const h = await startCompletionTestServer();
  try {
    const { data: auth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const token = auth.token;

    // 1a. Forged XSS/HTML payload disguised as image/jpeg is strictly rejected via magic-byte check (415)
    const forgedB64 = Buffer.from('<html><script>alert("xss")</script></html>').toString('base64');
    const forgedUpload = await h.apiCall('/api/media/upload', {
      method: 'POST',
      token,
      body: { dataUrl: `data:image/jpeg;base64,${forgedB64}`, purpose: 'post' },
    });
    assert.equal(forgedUpload.status, 415);
    assert.equal(forgedUpload.data.code, 'UNSUPPORTED_MEDIA_TYPE');

    // 1b. Valid PNG upload persists binary file & serves exact bytes with nosniff header
    const validUpload = await h.apiCall('/api/media/upload', {
      method: 'POST',
      token,
      body: { dataUrl: SAMPLE_PNG_DATA_URL, purpose: 'post' },
    });
    assert.equal(validUpload.status, 201);
    assert.match(validUpload.data.url, /^\/uploads\/post_[a-f0-9]+\.png$/);
    assert.equal(validUpload.data.mimeType, 'image/png');

    const served = await fetch(`${h.baseUrl}${validUpload.data.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    const servedBuf = Buffer.from(await served.arrayBuffer());
    assert.equal(Buffer.compare(servedBuf, SAMPLE_PNG_BUFFER), 0);

    // 1c. Path traversal attempt on /uploads/ returns 404
    const traversal = await fetch(`${h.baseUrl}/uploads/..%2Fcompletion.sqlite`);
    assert.equal(traversal.status, 404);

    // 1d. Inline base64 data URLs in onboarding avatar & post creation auto-convert to /uploads/...
    const onboardRes = await h.apiCall('/api/onboarding', {
      method: 'PUT',
      token,
      body: { profilePatch: { avatarUrl: SAMPLE_PNG_DATA_URL } },
    });
    assert.equal(onboardRes.status, 200);
    assert.match(onboardRes.data.user.profile.avatarUrl, /^\/uploads\/avatar_[a-f0-9]+\.png$/);

    const postRes = await h.apiCall('/api/posts', {
      method: 'POST',
      token,
      body: {
        category: 'post',
        title: 'PCB Layout Render',
        content: 'Fresh KiCad board export!',
        mediaType: 'image',
        mediaMeta: { imageUrl: SAMPLE_PNG_DATA_URL },
        skillTags: ['Hardware'],
      },
    });
    assert.equal(postRes.status, 201);
    const postUploadUrl = postRes.data.post.mediaMeta.imageUrl;
    assert.match(postUploadUrl, /^\/uploads\/post_[a-f0-9]+\.png$/);

    // Deleting the post unlinks the uploaded image file from disk
    const delPost = await h.apiCall(`/api/posts/${postRes.data.post.id}`, {
      method: 'DELETE',
      token,
    });
    assert.equal(delPost.status, 200);

    const afterUnlink = await fetch(`${h.baseUrl}${postUploadUrl}`);
    assert.equal(afterUnlink.status, 404);
  } finally {
    await h.cleanup();
  }
});

test('2. Chat Participant Isolation, Message Unsending & Comment Deletion Authorization', async () => {
  const h = await startCompletionTestServer();
  try {
    const { data: aravAuth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const aravToken = aravAuth.token;

    const student2 = await h.registerAndActivateAdultStudent({
      username: 'ishaan_sec',
      email: 'ishaan@teenstack.edu',
      mobile: '+91 98111 22334',
    });

    // 2a. student2 is NOT a participant in Arav & Maya's private DM thread ('thread-maya')
    const spyGet = await h.apiCall('/api/messages?threadId=thread-maya', {
      token: student2.token,
    });
    assert.equal(spyGet.status, 403);
    assert.equal(spyGet.data.code, 'FORBIDDEN_THREAD_ACCESS');

    const spyRead = await h.apiCall('/api/chats/threads/thread-maya/read', {
      method: 'POST',
      token: student2.token,
    });
    assert.equal(spyRead.status, 403);

    const spyPost = await h.apiCall('/api/messages', {
      method: 'POST',
      token: student2.token,
      body: { threadId: 'thread-maya', text: 'Trying to inject into private DM' },
    });
    assert.equal(spyPost.status, 403);

    // Bootstrap for student2 contains zero messages from 'thread-maya'
    const s2Boot = await h.apiCall('/api/bootstrap', { token: student2.token });
    assert.equal(s2Boot.status, 200);
    assert.equal(
      s2Boot.data.messages.some((m) => m.threadId === 'thread-maya'),
      false,
      'Private DM messages must never leak to non-participants'
    );

    // 2b. Arav sends a message in thread-study; student2 cannot delete it (403); Arav unsends it (200)
    const sent = await h.apiCall('/api/messages', {
      method: 'POST',
      token: aravToken,
      body: { threadId: 'thread-study', text: 'Sharing linear algebra cheat sheet!' },
    });
    assert.equal(sent.status, 201);

    const forbidDelMsg = await h.apiCall(`/api/messages/${sent.data.message.id}`, {
      method: 'DELETE',
      token: student2.token,
    });
    assert.equal(forbidDelMsg.status, 403);

    const ownDelMsg = await h.apiCall(`/api/messages/${sent.data.message.id}`, {
      method: 'DELETE',
      token: aravToken,
    });
    assert.equal(ownDelMsg.status, 200);

    // 2c. Comment creation & deletion authorization
    const cRes = await h.apiCall('/api/posts/post-solaris-1/comment', {
      method: 'POST',
      token: aravToken,
      body: { text: 'Awesome atmospheric scattering!' },
    });
    assert.equal(cRes.status, 200);
    const addedComment = cRes.data.comments.find(
      (c) => c.text === 'Awesome atmospheric scattering!'
    );
    assert.ok(addedComment);

    const forbidDelComment = await h.apiCall(
      `/api/posts/post-solaris-1/comments/${addedComment.id}`,
      { method: 'DELETE', token: student2.token }
    );
    assert.equal(forbidDelComment.status, 403);

    const ownDelComment = await h.apiCall(
      `/api/posts/post-solaris-1/comments/${addedComment.id}`,
      { method: 'DELETE', token: aravToken }
    );
    assert.equal(ownDelComment.status, 200);
    assert.equal(
      ownDelComment.data.comments.some((c) => c.id === addedComment.id),
      false
    );
  } finally {
    await h.cleanup();
  }
});

test('3. User Blocking (Severing Friendships, Hiding Feed/Peers/DMs) & Safety Reporting Moderation', async () => {
  const h = await startCompletionTestServer();
  try {
    const { data: aravAuth } = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const token = aravAuth.token;

    // Arav blocks peer-maya
    const blockRes = await h.apiCall('/api/safety/block', {
      method: 'POST',
      token,
      body: { targetUserId: 'peer-maya', reason: 'Unwanted messages' },
    });
    assert.equal(blockRes.status, 200);
    assert.equal(blockRes.data.blocked, true);
    assert.equal(blockRes.data.friendIds.includes('peer-maya'), false, 'Friendship must be severed');
    assert.equal(
      blockRes.data.peers.some((p) => p.id === 'peer-maya'),
      false,
      'Blocked peer must be hidden from peers list'
    );

    // Maya's posts disappear from Arav's feed, profile lookup returns 403, and DMs return 403
    const feed = await h.apiCall('/api/posts', { token });
    assert.equal(
      feed.data.posts.some((p) => p.authorId === 'peer-maya'),
      false
    );

    const prof = await h.apiCall('/api/network/profile/mayalin_gfx', { token });
    assert.equal(prof.status, 403);
    assert.equal(prof.data.code, 'USER_BLOCKED');

    const dmAttempt = await h.apiCall('/api/messages', {
      method: 'POST',
      token,
      body: { threadId: 'thread-maya', text: 'Hello after block' },
    });
    assert.equal(dmAttempt.status, 403);
    assert.equal(dmAttempt.data.code, 'USER_BLOCKED');

    // Unblock restores visibility
    const unblockRes = await h.apiCall('/api/safety/block', {
      method: 'POST',
      token,
      body: { targetUserId: 'peer-maya' },
    });
    assert.equal(unblockRes.data.blocked, false);

    // Safety Report + Compliance Admin Moderation
    const reportRes = await h.apiCall('/api/safety/report', {
      method: 'POST',
      token,
      body: {
        targetType: 'post',
        targetId: 'post-ananya-4',
        reasonCategory: 'Spam or Misleading Link',
        details: 'Suspicious external link',
      },
    });
    assert.equal(reportRes.status, 201);
    assert.equal(reportRes.data.status, 'OPEN');

    // Student cannot access admin moderation queue (403)
    const studentModAttempt = await h.apiCall('/api/admin/moderation/reports', { token });
    assert.equal(studentModAttempt.status, 403);

    // Compliance admin lists & resolves report with content removal
    const adminList = await h.apiCall('/api/admin/moderation/reports?status=OPEN', {
      headers: { 'x-compliance-admin-key': 'adm_completion_secret_key_2026' },
    });
    assert.equal(adminList.status, 200);
    assert.equal(adminList.data.reports.length, 1);

    const resolved = await h.apiCall(
      `/api/admin/moderation/reports/${reportRes.data.reportId}/resolve`,
      {
        method: 'POST',
        headers: { 'x-compliance-admin-key': 'adm_completion_secret_key_2026' },
        body: {
          status: 'ACTIONED',
          resolutionNote: 'Removed reported post after review',
          removeTargetContent: true,
        },
      }
    );
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.report.status, 'ACTIONED');

    const feedAfterMod = await h.apiCall('/api/posts', { token });
    assert.equal(
      feedAfterMod.data.posts.some((p) => p.id === 'post-ananya-4'),
      false,
      'Actioned post must be deleted'
    );
  } finally {
    await h.cleanup();
  }
});

test('4. Account Password Change, Active Sessions, DPDP Data Export & Hard-Erasure Maintenance Sweep', async () => {
  const h = await startCompletionTestServer();
  try {
    const loginA = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const loginB = await h.apiCall('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'arav_dev', password: 'TeenStack@2026' },
    });
    const tokenA = loginA.data.token;
    const tokenB = loginB.data.token;

    // Active sessions list masks raw tokens behind 12-char SHA-256 prefixes
    const sessList = await h.apiCall('/api/account/sessions', { token: tokenA });
    assert.equal(sessList.status, 200);
    assert.ok(sessList.data.sessions.length >= 2);
    assert.equal(sessList.data.sessions.some((s) => s.isCurrent), true);

    // Wrong current password rejected (401)
    const badPwd = await h.apiCall('/api/account/change-password', {
      method: 'POST',
      token: tokenA,
      body: { currentPassword: 'WrongPassword!1', newPassword: 'UpdatedPassword!2026' },
    });
    assert.equal(badPwd.status, 401);

    // Valid password change keeps current session (tokenA) and revokes other sessions (tokenB)
    const goodPwd = await h.apiCall('/api/account/change-password', {
      method: 'POST',
      token: tokenA,
      body: { currentPassword: 'TeenStack@2026', newPassword: 'UpdatedPassword!2026' },
    });
    assert.equal(goodPwd.status, 200);

    const checkTokenB = await h.apiCall('/api/account/sessions', { token: tokenB });
    assert.equal(checkTokenB.status, 401, 'Secondary session must be revoked on password change');

    // DPDP Data Export returns decrypted PII & relational portfolio/compliance records
    const exported = await h.apiCall('/api/privacy/export-data', { token: tokenA });
    assert.equal(exported.status, 200);
    assert.equal(exported.data.schemaVersion, 'DPDP-TEENSTACK-EXPORT-v2026.1');
    assert.equal(exported.data.account.email, 'arav@teenstack.edu');
    assert.ok(Array.isArray(exported.data.portfolio.projects));

    // Register a disposable account, upload media, request erasure, fast-forward purge clock, and run sweep!
    const tempStudent = await h.registerAndActivateAdultStudent({
      username: 'purge_me_99',
      email: 'purge99@teenstack.edu',
      mobile: '+91 98999 11223',
    });
    const tempMedia = await h.apiCall('/api/media/upload', {
      method: 'POST',
      token: tempStudent.token,
      body: { dataUrl: SAMPLE_PNG_DATA_URL, purpose: 'avatar' },
    });
    assert.equal(tempMedia.status, 201);

    const delReq = await h.apiCall('/api/privacy/delete-account', {
      method: 'POST',
      token: tempStudent.token,
    });
    assert.equal(delReq.status, 200);

    // Fast-forward scheduled_purge_at & insert an expired 24h story + expired session
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    h.db
      .prepare('UPDATE data_deletion_requests SET scheduled_purge_at = ? WHERE id = ?')
      .run(pastIso, delReq.data.deletionRequestId);
    h.db
      .prepare(
        "INSERT INTO sessions (token, user_id, role, expires_at) VALUES ('exp_tok_1', 'usr-demo-arav', 'student', ?)"
      )
      .run(Date.now() - 10_000);
    h.db
      .prepare(
        "INSERT INTO posts (id, author_id, author_name, author_handle, author_school, author_avatar, category, title, content, expires_at, created_at) VALUES ('exp-story-1', 'usr-demo-arav', 'Arav', '@arav_dev', 'STEM', 'violet-coder', 'story', 'Old', 'Expired', ?, ?)"
      )
      .run(pastIso, pastIso);

    const sweep = h.services.runMaintenanceSweep();
    assert.ok(sweep.expiredSessionsRemoved >= 1);
    assert.ok(sweep.expiredStoriesRemoved >= 1);
    assert.equal(sweep.accountsPurged, 1);

    // Verify hard erasure of user row, uploaded media file, and COMPLETED deletion status
    const erasedUser = h.db
      .prepare('SELECT id FROM users WHERE id = ?')
      .get(tempStudent.user.id);
    assert.equal(erasedUser, undefined);

    const erasedMediaRes = await fetch(`${h.baseUrl}${tempMedia.data.url}`);
    assert.equal(erasedMediaRes.status, 404);

    const delRow = h.db
      .prepare('SELECT status, completed_at FROM data_deletion_requests WHERE id = ?')
      .get(delReq.data.deletionRequestId);
    assert.equal(delRow.status, 'COMPLETED');
    assert.ok(delRow.completed_at);
  } finally {
    await h.cleanup();
  }
});
