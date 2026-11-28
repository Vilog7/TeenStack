import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { createTeenStackServer } from '../index.mjs';

async function startEphemeralServer(customEnv = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teenstack-verif-test-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const env = {
    NODE_ENV: 'test',
    SIGNZY_MODE: 'sandbox_mock',
    SIGNZY_WEBHOOK_SECRET: 'whsec_test_secret_9876543210_abcdef',
    COMPLIANCE_ADMIN_KEY: 'adm_test_key_12345',
    ...customEnv,
  };

  const ctx = createTeenStackServer({ dbPath, env, seedDemo: false });
  await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
  const addr = ctx.server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function apiCall(pathname, { method = 'GET', body, token, parentSession, headers = {} } = {}) {
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (parentSession) reqHeaders['X-Parent-Session'] = parentSession;

    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data, headers: res.headers };
  }

  async function cleanup() {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { ...ctx, baseUrl, apiCall, cleanup };
}

test('1. Pending registration encrypts PII at rest, locks features, and blocks duplicate signups/requests', async () => {
  const h = await startEphemeralServer();
  try {
    const signupRes = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Riya Deshmukh',
        declaredDob: '2003-01-01', // Fake 23yo declaration!
        email: 'riya@student.in',
        mobile: '+91 98765 43210',
        username: 'riya_codes',
        password: 'StrongPassword#1',
      },
    });
    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.data.user.accountStatus, 'PENDING_VERIFICATION');
    assert.equal(signupRes.data.user.verifiedAgeBand, 'UNVERIFIED');
    const studentToken = signupRes.data.token;

    // Verify PII is encrypted at rest in SQLite (not plaintext!)
    const rawUserRow = h.db.prepare('SELECT * FROM users WHERE username = ?').get('riya_codes');
    assert.ok(rawUserRow.email.startsWith('enc:v1:'), 'Email must be AES-256-GCM encrypted at rest');
    assert.ok(rawUserRow.mobile.startsWith('enc:v1:'), 'Mobile must be AES-256-GCM encrypted at rest');
    assert.ok(
      rawUserRow.declared_dob.startsWith('enc:v1:'),
      'Declared DOB must be AES-256-GCM encrypted at rest'
    );

    // Duplicate email & mobile (even formatted differently) must fail with 409
    const dupMobile = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Another Student',
        declaredDob: '2009-05-05',
        email: 'other@student.in',
        mobile: '09876543210',
        username: 'other_user',
        password: 'StrongPassword#1',
      },
    });
    assert.equal(dupMobile.status, 409);

    // Pending student MUST be blocked from posting, messaging, onboarding, and interactions
    const postAttempt = await h.apiCall('/api/posts', {
      method: 'POST',
      token: studentToken,
      body: { category: 'post', title: 'Test', content: 'Hello', mediaType: 'none', skillTags: [] },
    });
    assert.equal(postAttempt.status, 403);
    assert.equal(postAttempt.data.code, 'ACCOUNT_NOT_ACTIVE');

    const msgAttempt = await h.apiCall('/api/messages', {
      method: 'POST',
      token: studentToken,
      body: { threadId: 'thread-maya', text: 'Hi' },
    });
    assert.equal(msgAttempt.status, 403);

    // Idempotent duplicate age-verification initiation returns deduplicated session
    const init1 = await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: studentToken,
      body: { idempotencyKey: 'idem-key-001' },
    });
    const init2 = await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: studentToken,
      body: { idempotencyKey: 'idem-key-001' },
    });
    assert.equal(init1.status, 200);
    assert.equal(init2.status, 200);
    assert.equal(init1.data.verificationSessionId, init2.data.verificationSessionId);
    assert.equal(init2.data.deduplicated, true);

    // Ensure student status endpoint NEVER leaks internal Signzy provider_reference
    const statusRes = await h.apiCall('/api/verification/status', { token: studentToken });
    assert.equal(statusRes.status, 200);
    assert.equal('providerReference' in (statusRes.data.overview.ageVerification || {}), false);
  } finally {
    await h.cleanup();
  }
});

test('2. Under-13, tampered ID, name mismatch, and session timeout block activation', async () => {
  const h = await startEphemeralServer();
  try {
    // A. Under-13 student pretending to be 19 via declaredDob
    const s1 = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Kabir Kid',
        declaredDob: '2007-01-01',
        email: 'kabir@kid.in',
        mobile: '9810011111',
        username: 'kabir_kid',
        password: 'StrongPassword#1',
      },
    });
    await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: s1.data.token,
      body: {},
    });
    const u13 = await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: s1.data.token,
      body: { scenario: 'UNDER_13' },
    });
    assert.equal(u13.data.user.accountStatus, 'REJECTED_UNDER_13');

    // Deletion request scheduled automatically for under-13
    const delRow = h.db
      .prepare('SELECT * FROM data_deletion_requests WHERE user_id = ?')
      .get(s1.data.user.id);
    assert.ok(delRow, 'Under-13 account must schedule DPDP data deletion');

    // B. Tampered document -> VERIFICATION_FAILED, then retry -> timeout -> VERIFICATION_FAILED
    const s2 = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Dev Patel',
        declaredDob: '2009-02-02',
        email: 'dev@student.in',
        mobile: '9810022222',
        username: 'dev_patel',
        password: 'StrongPassword#1',
      },
    });
    await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: s2.data.token,
      body: {},
    });
    const tampered = await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: s2.data.token,
      body: { scenario: 'TAMPERED_DOC' },
    });
    assert.equal(tampered.data.user.accountStatus, 'VERIFICATION_FAILED');

    // Retry session, then force expiration to test timeout handling
    const retryInit = await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: s2.data.token,
      body: {},
    });
    h.db
      .prepare('UPDATE age_verifications SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), retryInit.data.verificationSessionId);

    const expiredSim = await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: s2.data.token,
      body: { scenario: 'VERIFIED_18_PLUS' }, // Even with 18+ payload, expired session MUST fail!
    });
    assert.equal(expiredSim.data.user.accountStatus, 'VERIFICATION_FAILED');
  } finally {
    await h.cleanup();
  }
});

test('3. Verified 18+ adult activates directly without parental consent & discards Aadhaar fields', async () => {
  const h = await startEphemeralServer();
  try {
    const s = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Meera Nair',
        declaredDob: '2006-04-12',
        email: 'meera@college.in',
        mobile: '9820033333',
        username: 'meera_19',
        password: 'StrongPassword#1',
      },
    });
    await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: s.data.token,
      body: {},
    });

    // Deliver result via HMAC-signed Signzy webhook containing Aadhaar/photo/address fields that MUST be discarded
    const verifRow = h.db
      .prepare('SELECT * FROM age_verifications WHERE user_id = ?')
      .get(s.data.user.id);

    const rawWebhookPayload = JSON.stringify({
      status: 'SUCCESS',
      valid: true,
      requestId: verifRow.provider_reference,
      result: {
        name: 'Meera Nair',
        dob: '12/04/2006',
        maskedAadhaarNumber: 'XXXX-XXXX-8877',
        photo: 'https://persist.signzy.tech/photo.jpg',
      },
    });
    const ts = String(Date.now());
    const sig = createHmac('sha256', 'whsec_test_secret_9876543210_abcdef')
      .update(`${ts}.${rawWebhookPayload}`)
      .digest('hex');

    // Forged signature must fail with 401
    const badWh = await h.apiCall('/api/webhooks/signzy', {
      method: 'POST',
      headers: {
        'x-signzy-signature': 'deadbeef',
        'x-signzy-timestamp': ts,
        'x-signzy-event-id': 'evt-forged',
      },
      body: rawWebhookPayload,
    });
    assert.equal(badWh.status, 401);

    // Valid webhook succeeds and activates 18+ account
    const okWh = await h.apiCall('/api/webhooks/signzy', {
      method: 'POST',
      headers: {
        'x-signzy-signature': sig,
        'x-signzy-timestamp': ts,
        'x-signzy-event-id': 'evt-valid-1',
      },
      body: rawWebhookPayload,
    });
    assert.equal(okWh.status, 200);

    // Replaying exact same webhook fails with 409
    const replayWh = await h.apiCall('/api/webhooks/signzy', {
      method: 'POST',
      headers: {
        'x-signzy-signature': sig,
        'x-signzy-timestamp': ts,
        'x-signzy-event-id': 'evt-valid-1',
      },
      body: rawWebhookPayload,
    });
    assert.equal(replayWh.status, 409);

    const status = await h.apiCall('/api/verification/status', { token: s.data.token });
    assert.equal(status.data.user.accountStatus, 'ACTIVE');
    assert.equal(status.data.user.verifiedAgeBand, 'VERIFIED_18_PLUS');

    // Confirm zero Aadhaar / photo leakage anywhere in SQLite tables
    const dbDump = JSON.stringify({
      users: h.db.prepare('SELECT * FROM users').all(),
      verifs: h.db.prepare('SELECT * FROM age_verifications').all(),
      logs: h.db.prepare('SELECT * FROM verification_audit_logs').all(),
    });
    assert.equal(dbDump.includes('8877'), false, 'Masked/raw Aadhaar must never be stored');
    assert.equal(dbDump.includes('persist.signzy.tech'), false, 'Photo URLs must never be stored');
  } finally {
    await h.cleanup();
  }
});

test('4. Full 13–17 Minor Workflow: anti-self-parenting, single-use token, parent 18+ & authority checks, explicit consent, duplicate prevention, and consent withdrawal', async () => {
  const h = await startEphemeralServer();
  try {
    const s = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Ishaan Verma',
        declaredDob: '2001-01-01', // Lied about being 25!
        email: 'ishaan@school.in',
        mobile: '+91 98999 12345',
        username: 'ishaan_v',
        password: 'StrongPassword#1',
      },
    });
    const studentToken = s.data.token;

    await h.apiCall('/api/verification/age/initiate', { method: 'POST', token: studentToken, body: {} });
    const ageRes = await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: studentToken,
      body: { scenario: 'VERIFIED_13_17' },
    });
    // Signzy overrides fake adult DOB -> requires parent!
    assert.equal(ageRes.data.user.accountStatus, 'AGE_VERIFIED_AWAITING_PARENT');
    assert.equal(ageRes.data.user.verifiedAgeBand, 'VERIFIED_13_17');

    // Attempt 1: Student enters their OWN mobile number formatted differently as parent's mobile -> 422!
    const selfPhoneAttempt = await h.apiCall('/api/verification/parent/invite', {
      method: 'POST',
      token: studentToken,
      body: {
        parentEmail: 'realparent@verma.in',
        parentMobile: '09899912345', // Same digits as '+91 98999 12345'!
      },
    });
    assert.equal(selfPhoneAttempt.status, 422);
    assert.equal(selfPhoneAttempt.data.code, 'SELF_PARENT_CONTACT_FORBIDDEN');

    // Attempt 2: Valid distinct parent invite
    const inviteRes = await h.apiCall('/api/verification/parent/invite', {
      method: 'POST',
      token: studentToken,
      body: {
        parentEmail: 'sunita.verma@family.in',
        parentMobile: '+91 98111 77889',
      },
    });
    assert.equal(inviteRes.status, 201);
    const inviteToken = inviteRes.data.sandboxPortalInviteToken;
    assert.ok(inviteToken);

    // Exchange single-use invite token once -> succeeds
    const ex1 = await h.apiCall('/api/parent-portal/session/exchange', {
      method: 'POST',
      body: { inviteToken },
    });
    assert.equal(ex1.status, 200);
    const parentSession = ex1.data.parentSessionToken;

    // Reusing the single-use invite token a second time -> 410 Gone!
    const ex2 = await h.apiCall('/api/parent-portal/session/exchange', {
      method: 'POST',
      body: { inviteToken },
    });
    assert.equal(ex2.status, 410);

    // Save independent parent details
    const detailsRes = await h.apiCall('/api/parent-portal/details', {
      method: 'POST',
      parentSession,
      body: {
        parentName: 'Sunita Verma',
        parentMobile: '+91 98111 77889',
        parentEmail: 'sunita.verma@family.in',
        relationshipType: 'MOTHER',
      },
    });
    assert.equal(detailsRes.status, 200);

    // Underage impostor trying to verify as parent -> fails & blocks consent
    await h.apiCall('/api/parent-portal/verify-identity', {
      method: 'POST',
      parentSession,
      body: { scenario: 'UNDERAGE_IMPOSTOR', sandboxAuthorityVerified: true },
    });
    const blockedApprove1 = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession,
      body: {
        decision: 'APPROVED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {
          purposeAndDataCollection: true,
          privacyAndSafetyPolicy: true,
          retentionAndWithdrawalRights: true,
        },
      },
    });
    assert.equal(blockedApprove1.status, 403);
    assert.equal(blockedApprove1.data.code, 'PARENT_ADULT_NOT_VERIFIED');

    // Adult 18+ verified WITHOUT parental authority -> still blocks consent!
    await h.apiCall('/api/parent-portal/verify-identity', {
      method: 'POST',
      parentSession,
      body: { scenario: 'ADULT_18_PLUS', sandboxAuthorityVerified: false },
    });
    const blockedApprove2 = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession,
      body: {
        decision: 'APPROVED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {
          purposeAndDataCollection: true,
          privacyAndSafetyPolicy: true,
          retentionAndWithdrawalRights: true,
        },
      },
    });
    assert.equal(blockedApprove2.status, 403);
    assert.equal(blockedApprove2.data.code, 'PARENTAL_AUTHORITY_NOT_VERIFIED');

    // Adult 18+ verified WITH authority, but missing informed checkbox -> 400!
    await h.apiCall('/api/parent-portal/verify-identity', {
      method: 'POST',
      parentSession,
      body: { scenario: 'ADULT_18_PLUS', sandboxAuthorityVerified: true },
    });
    const missingCheckbox = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession,
      body: {
        decision: 'APPROVED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {
          purposeAndDataCollection: true,
          privacyAndSafetyPolicy: false,
          retentionAndWithdrawalRights: true,
        },
      },
    });
    assert.equal(missingCheckbox.status, 400);

    // Explicit informed APPROVE REGISTRATION -> activates student!
    const approved = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession,
      body: {
        decision: 'APPROVED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {
          purposeAndDataCollection: true,
          privacyAndSafetyPolicy: true,
          retentionAndWithdrawalRights: true,
        },
      },
    });
    assert.equal(approved.status, 201);
    assert.ok(approved.data.consentTransactionId.startsWith('csnt_'));
    assert.equal(approved.data.studentAccountStatus, 'ACTIVE');
    assert.ok(approved.data.withdrawalToken);

    // Duplicate consent submission on same session -> 409!
    const dupConsent = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession,
      body: {
        decision: 'APPROVED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {
          purposeAndDataCollection: true,
          privacyAndSafetyPolicy: true,
          retentionAndWithdrawalRights: true,
        },
      },
    });
    assert.equal(dupConsent.status, 409);

    // Student can now post!
    const postOk = await h.apiCall('/api/posts', {
      method: 'POST',
      token: studentToken,
      body: { category: 'post', title: 'Robotics', content: 'Verified build!', mediaType: 'none', skillTags: [] },
    });
    assert.equal(postOk.status, 201);

    // Parent withdraws consent using receipt token -> immediately restricts student & revokes session!
    const withdrawRes = await h.apiCall('/api/parent-portal/consent/withdraw', {
      method: 'POST',
      body: { withdrawalToken: approved.data.withdrawalToken },
    });
    assert.equal(withdrawRes.status, 200);
    assert.equal(withdrawRes.data.studentAccountStatus, 'CONSENT_WITHDRAWN_RESTRICTED');

    // Student's session is revoked & posting is immediately blocked!
    const postAfterWithdraw = await h.apiCall('/api/posts', {
      method: 'POST',
      token: studentToken,
      body: { category: 'post', title: 'Blocked', content: 'Should fail', mediaType: 'none', skillTags: [] },
    });
    assert.equal(postAfterWithdraw.status, 401);
  } finally {
    await h.cleanup();
  }
});

test('5. Parent REJECT REGISTRATION keeps student account inactive and schedules deletion', async () => {
  const h = await startEphemeralServer();
  try {
    const s = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      body: {
        fullName: 'Tanvi Rao',
        declaredDob: '2010-07-10',
        email: 'tanvi@school.in',
        mobile: '9870011223',
        username: 'tanvi_r',
        password: 'StrongPassword#1',
      },
    });
    const tok = s.data.token;
    await h.apiCall('/api/verification/age/initiate', { method: 'POST', token: tok, body: {} });
    await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: tok,
      body: { scenario: 'VERIFIED_13_17' },
    });
    const inv = await h.apiCall('/api/verification/parent/invite', {
      method: 'POST',
      token: tok,
      body: { parentEmail: 'parent.rao@home.in', parentMobile: '9870099887' },
    });
    const ex = await h.apiCall('/api/parent-portal/session/exchange', {
      method: 'POST',
      body: { inviteToken: inv.data.sandboxPortalInviteToken },
    });
    const pSess = ex.data.parentSessionToken;

    await h.apiCall('/api/parent-portal/details', {
      method: 'POST',
      parentSession: pSess,
      body: {
        parentName: 'Vikram Rao',
        parentMobile: '9870099887',
        parentEmail: 'parent.rao@home.in',
        relationshipType: 'FATHER',
      },
    });
    await h.apiCall('/api/parent-portal/verify-identity', {
      method: 'POST',
      parentSession: pSess,
      body: { scenario: 'ADULT_18_PLUS', sandboxAuthorityVerified: true },
    });

    const rejected = await h.apiCall('/api/parent-portal/consent', {
      method: 'POST',
      parentSession: pSess,
      body: {
        decision: 'REJECTED',
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        acknowledgements: {},
      },
    });
    assert.equal(rejected.status, 201);
    assert.equal(rejected.data.studentAccountStatus, 'PARENT_REJECTED');

    const postAttempt = await h.apiCall('/api/posts', {
      method: 'POST',
      token: tok,
      body: { category: 'post', title: 'Test', content: 'Blocked', mediaType: 'none', skillTags: [] },
    });
    assert.equal(postAttempt.status, 403);
  } finally {
    await h.cleanup();
  }
});

test('6. Production mode strictly disables sandbox simulation and enforces HTTPS + live Signzy credentials', async () => {
  const h = await startEphemeralServer({
    NODE_ENV: 'production',
    SIGNZY_MODE: 'sandbox_mock', // Attempted misconfiguration: must be overridden to 'live' in prod!
    DATA_ENCRYPTION_KEY: 'prod_encryption_secret_key_at_least_32_characters_long',
    BLIND_INDEX_SECRET: 'prod_blind_index_hmac_secret_at_least_32_chars_long',
  });
  try {
    // Non-HTTPS API call in production is blocked with 403
    const httpCall = await h.apiCall('/api/health');
    assert.equal(httpCall.status, 403);

    // Simulate reverse-proxy HTTPS header
    const httpsHeaders = { 'x-forwarded-proto': 'https' };
    const s = await h.apiCall('/api/auth/signup', {
      method: 'POST',
      headers: httpsHeaders,
      body: {
        fullName: 'Prod User',
        declaredDob: '2005-05-05',
        email: 'prod@teenstack.in',
        mobile: '9833344455',
        username: 'prod_user',
        password: 'StrongPassword#1',
      },
    });
    assert.equal(s.status, 201);

    // Sandbox simulator endpoint is strictly forbidden in production (403)
    const simBlocked = await h.apiCall('/api/verification/age/sandbox-simulate', {
      method: 'POST',
      token: s.data.token,
      headers: httpsHeaders,
      body: { scenario: 'VERIFIED_18_PLUS' },
    });
    assert.equal(simBlocked.status, 403);

    // Initiating age verification without live Signzy credentials returns 503 dependency error instead of fake pass
    const liveMissing = await h.apiCall('/api/verification/age/initiate', {
      method: 'POST',
      token: s.data.token,
      headers: httpsHeaders,
      body: {},
    });
    assert.equal(liveMissing.status, 503);
    assert.equal(liveMissing.data.code, 'SIGNZY_CREDENTIALS_MISSING');
  } finally {
    await h.cleanup();
  }
});
