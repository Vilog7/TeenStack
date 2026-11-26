import http from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  createCryptoContext,
  maskMobile,
  normalizeEmail,
  RateLimiter,
  redactSensitiveFields,
  SECURITY_HEADERS,
  verifyPassword,
} from './security.mjs';
import { initializeDatabase } from './db.mjs';
import { createSignzyAgeVerificationService } from './signzy_age_verification.mjs';
import {
  createVerificationEngine,
  CURRENT_CONSENT_VERSION,
} from './verification_engine.mjs';
import { createPlatformDomainServices } from './platform_domains.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDistPath = path.resolve(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function readRawBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  const raw = buf.toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Malformed JSON request body.');
    err.status = 400;
    throw err;
  }
}

export function createTeenStackServer({
  dbPath = path.join(__dirname, 'teenstack.sqlite'),
  env = process.env,
  distPath = defaultDistPath,
  seedDemo = true,
} = {}) {
  const cryptoCtx = createCryptoContext(env);
  const db = initializeDatabase({ dbPath, cryptoCtx, seedDemo });
  const signzyService = createSignzyAgeVerificationService(env);
  const engine = createVerificationEngine({ db, cryptoCtx, signzyService });
  const domains = createPlatformDomainServices({ db, cryptoCtx, engine });
  const limiter = new RateLimiter();

  function sendJson(res, status, data, extraHeaders = {}) {
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    });
    res.end(JSON.stringify(data));
  }

  function makeCookieHeader(cookieName, token, remember = true) {
    const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
    const secureFlag = cryptoCtx.isProd ? '; Secure' : '';
    return `${cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
  }

  function sanitizeUser(row) {
    if (!row) return null;
    let profile = {};
    try {
      profile = JSON.parse(row.profile_json || '{}');
    } catch {
      profile = {};
    }
    const privacy = profile.privacy || {
      profileVisibility: 'students_only',
      dmPermission: 'connections_only',
      hideContactInfo: true,
      guardianEmail: '',
      contentSafetyFilter: true,
    };

    const plainEmail = cryptoCtx.decryptPII(row.email);
    const plainMobile = cryptoCtx.decryptPII(row.mobile);
    const plainDeclaredDob = cryptoCtx.decryptPII(row.declared_dob);

    return {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      email: plainEmail,
      phone: privacy.hideContactInfo ? maskMobile(plainMobile) : plainMobile,
      rawPhone: plainMobile,
      dob: plainDeclaredDob,
      declaredDob: plainDeclaredDob,
      verifiedAgeBand: row.verified_age_band || 'UNVERIFIED',
      accountStatus: row.account_status || 'PENDING_VERIFICATION',
      role: row.role || 'student',
      age: row.age || 16,
      marketingOptIn: Boolean(row.marketing_opt_in),
      onboardingStep: row.onboarding_step,
      onboardingCompleted: Boolean(row.onboarding_completed),
      verificationOverview: engine.getPublicStudentVerificationOverview(row),
      profile: {
        subjects: profile.subjects || [],
        educationLevel: profile.educationLevel || 'High School Student',
        school: profile.school || '',
        careerInterests: profile.careerInterests || [],
        skills: profile.skills || [],
        generatedTags: profile.generatedTags || [],
        experienceYears: profile.experienceYears ?? 0,
        projectsCompleted: profile.projectsCompleted ?? 0,
        ratePerProject: profile.ratePerProject || '',
        targetClients: profile.targetClients || '',
        achievements: profile.achievements || [],
        competitions: profile.competitions || [],
        careerAim: profile.careerAim || '',
        desiredField: profile.desiredField || '',
        skillsToLearn: profile.skillsToLearn || [],
        avatarUrl: profile.avatarUrl || '',
        avatarPreset: profile.avatarPreset || 'violet-coder',
        bio: profile.bio || '',
        portfolioUrl: profile.portfolioUrl || '',
        portfolioProjects: profile.portfolioProjects || [],
        privacy,
      },
      createdAt: row.created_at,
    };
  }

  function getAuthUser(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || cookies.teenstack_session;
    if (!token) return null;

    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!session) return null;
    if (session.expires_at < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    if (!userRow) return null;
    return { user: sanitizeUser(userRow), token, row: userRow, sessionRole: session.role || userRow.role };
  }

  /**
   * Strict RBAC & Account Activation Gate:
   * Unverified, pending, rejected, or consent-withdrawn accounts CANNOT post, message, comment, or onboard!
   */
  function requireActiveStudentAccount(req, res) {
    const auth = getAuthUser(req);
    if (!auth) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return null;
    }
    if (auth.row.account_status !== 'ACTIVE') {
      sendJson(res, 403, {
        error:
          'Account features are locked until age verification (and verifiable parental consent for ages 13–17) is completed.',
        code: 'ACCOUNT_NOT_ACTIVE',
        accountStatus: auth.row.account_status,
      });
      return null;
    }
    return auth;
  }

  function getParentPortalAuth(req) {
    const headerToken = req.headers['x-parent-session'] || '';
    const cookies = parseCookies(req.headers.cookie || '');
    const rawToken = String(headerToken || cookies.teenstack_parent_session || '').trim();
    if (!rawToken) return null;
    return engine.authenticateParentPortalSession(rawToken);
  }

  function checkRateLimit(req, res, bucketName, maxRequests, windowMs) {
    const ip =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const check = limiter.check(`${bucketName}:${ip}`, maxRequests, windowMs);
    if (!check.allowed) {
      sendJson(
        res,
        429,
        {
          error: `Too many requests. Please wait ${check.retryAfterSec}s before retrying.`,
          code: 'RATE_LIMITED',
        },
        { 'Retry-After': String(check.retryAfterSec) }
      );
      return false;
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const proto =
        (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim() ||
        (req.socket.encrypted ? 'https' : 'http');
      const host = req.headers.host || 'localhost:3001';
      const originBaseUrl = `${proto}://${host}`;
      const urlObj = new URL(req.url || '/', originBaseUrl);
      const pathname = urlObj.pathname;
      const method = req.method || 'GET';

      // Enforce HTTPS in production behind reverse proxy
      if (cryptoCtx.isProd && proto !== 'https' && pathname.startsWith('/api/')) {
        return sendJson(res, 403, { error: 'HTTPS is strictly required in production.' });
      }

      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          engine: 'node:sqlite',
          verificationProvider: {
            mode: signzyService.mode,
            productionActivationEnabled: signzyService.productionActivationEnabled,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // =========================================================================
      // 1. AUTH & PENDING STUDENT REGISTRATION
      // =========================================================================
      if (pathname === '/api/auth/me' && method === 'GET') {
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 200, { authenticated: false });
        const interactions =
          auth.row.account_status === 'ACTIVE'
            ? db
                .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
                .all(auth.user.id)
            : [];
        return sendJson(res, 200, { authenticated: true, user: auth.user, interactions });
      }

      if (pathname === '/api/auth/signup' && method === 'POST') {
        if (!checkRateLimit(req, res, 'signup', 10, 60_000)) return;
        const body = await readJsonBody(req);
        const { fullName, username, email, phone, mobile, dob, declaredDob, password } = body;

        const userRow = engine.registerPendingStudent({
          fullName,
          declaredDob: declaredDob || dob,
          email,
          mobile: mobile || phone,
          username,
          password,
        });

        // Issue restricted verification-only session (account_status = PENDING_VERIFICATION)
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)').run(
          token,
          userRow.id,
          'student',
          Date.now() + 1000 * 60 * 60 * 24
        );

        return sendJson(
          res,
          201,
          { user: sanitizeUser(userRow), token },
          { 'Set-Cookie': makeCookieHeader('teenstack_session', token, false) }
        );
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        if (!checkRateLimit(req, res, 'login', 15, 60_000)) return;
        const body = await readJsonBody(req);
        const { identifier, password, rememberMe } = body;
        if (!identifier || !password) {
          return sendJson(res, 400, { error: 'Please enter your username or email and password.' });
        }

        const cleanId = String(identifier).trim().toLowerCase();
        const emailLookup = cryptoCtx.blindIndex('email', normalizeEmail(cleanId));
        const userRow = db
          .prepare('SELECT * FROM users WHERE email_lookup_hash = ? OR LOWER(username) = ?')
          .get(emailLookup, cleanId.replace(/^@/, ''));

        if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
          return sendJson(res, 401, {
            error: 'Invalid credentials. Check your username/email and password.',
          });
        }

        if (
          userRow.account_status === 'REJECTED_UNDER_13' ||
          userRow.account_status === 'CONSENT_WITHDRAWN_RESTRICTED'
        ) {
          // Still allow viewing status notice screen, or issue read-only status session without active features
        }

        const token = randomBytes(32).toString('hex');
        const ttl = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
        db.prepare('INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)').run(
          token,
          userRow.id,
          userRow.role || 'student',
          Date.now() + ttl
        );

        const interactions =
          userRow.account_status === 'ACTIVE'
            ? db
                .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
                .all(userRow.id)
            : [];

        return sendJson(
          res,
          200,
          { user: sanitizeUser(userRow), token, interactions },
          { 'Set-Cookie': makeCookieHeader('teenstack_session', token, Boolean(rememberMe)) }
        );
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const auth = getAuthUser(req);
        if (auth) db.prepare('DELETE FROM sessions WHERE token = ?').run(auth.token);
        return sendJson(
          res,
          200,
          { ok: true },
          { 'Set-Cookie': 'teenstack_session=; HttpOnly; Path=/; Max-Age=0' }
        );
      }

      // =========================================================================
      // 2. STUDENT SIGNZY AGE VERIFICATION ROUTES
      // =========================================================================
      if (pathname === '/api/verification/status' && method === 'GET') {
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
        engine.evaluateAndApplyAccountActivation(auth.row.id);
        const freshRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.row.id);
        return sendJson(res, 200, {
          user: sanitizeUser(freshRow),
          overview: engine.getPublicStudentVerificationOverview(freshRow),
        });
      }

      if (pathname === '/api/verification/age/initiate' && method === 'POST') {
        if (!checkRateLimit(req, res, 'age_init', 8, 60_000)) return;
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
        const body = await readJsonBody(req);
        try {
          const initRes = await engine.startStudentAgeVerification({
            userRow: auth.row,
            idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null,
            originBaseUrl,
          });
          return sendJson(res, 200, initRes);
        } catch (err) {
          if (err.code && String(err.code).startsWith('SIGNZY_')) {
            engine.writeAuditLog({
              userReference: auth.row.id,
              eventType: 'SIGNZY_PROVIDER_DEPENDENCY_BLOCKED',
              eventStatus: err.code,
              actorRole: 'student',
            });
            return sendJson(res, 503, {
              error:
                'Signzy live verification credentials or DigiLocker SKU are not yet configured for this environment.',
              code: err.code,
            });
          }
          throw err;
        }
      }

      if (pathname === '/api/verification/age/poll' && method === 'POST') {
        if (!checkRateLimit(req, res, 'age_poll', 12, 60_000)) return;
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

        const pendingVerif = db
          .prepare(
            "SELECT * FROM age_verifications WHERE user_id = ? AND verification_status = 'PENDING' ORDER BY datetime(created_at) DESC LIMIT 1"
          )
          .get(auth.row.id);

        if (!pendingVerif) {
          const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.row.id);
          return sendJson(res, 200, { user: sanitizeUser(fresh) });
        }

        if (signzyService.mode === 'live') {
          const polled = await signzyService.pollVerificationSession({
            providerReference: pendingVerif.provider_reference,
            expectedFullName: auth.row.full_name,
          });
          if (polled.internalStatus !== 'PENDING') {
            engine.finalizeStudentAgeVerification({
              verifRow: pendingVerif,
              mappedResult: polled,
              source: 'poll',
            });
          }
        }

        const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.row.id);
        return sendJson(res, 200, { user: sanitizeUser(fresh) });
      }

      // Explicitly labelled NON-PRODUCTION Sandbox Simulator endpoint (strictly disabled in production!)
      if (pathname === '/api/verification/age/sandbox-simulate' && method === 'POST') {
        if (signzyService.isProd || signzyService.mode !== 'sandbox_mock') {
          return sendJson(res, 403, {
            error: 'Sandbox simulation is strictly disabled in live/production environments.',
          });
        }
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
        const body = await readJsonBody(req);

        const pendingVerif = db
          .prepare(
            "SELECT * FROM age_verifications WHERE user_id = ? AND verification_status = 'PENDING' ORDER BY datetime(created_at) DESC LIMIT 1"
          )
          .get(auth.row.id);

        if (!pendingVerif) {
          return sendJson(res, 400, {
            error: 'No active pending age-verification session. Initiate verification first.',
          });
        }

        // Build synthetic Signzy DigiLocker payload to exercise exact mapping & data-minimization code paths
        const scenario = String(body.scenario || 'VERIFIED_13_17');
        let simulatedSignzyPayload;
        if (scenario === 'VERIFIED_13_17') {
          simulatedSignzyPayload = {
            status: 'SUCCESS',
            valid: true,
            result: {
              name: auth.row.full_name,
              dob: '15/06/2010', // Age 16 in 2026 -> VERIFIED_13_17
              maskedAadhaarNumber: 'XXXX-XXXX-9999', // Verified discarded by mapper!
            },
          };
        } else if (scenario === 'VERIFIED_18_PLUS') {
          simulatedSignzyPayload = {
            status: 'SUCCESS',
            valid: true,
            result: {
              name: auth.row.full_name,
              dob: '10/03/2005', // Age 21 -> VERIFIED_18_PLUS
            },
          };
        } else if (scenario === 'UNDER_13') {
          simulatedSignzyPayload = {
            status: 'SUCCESS',
            valid: true,
            result: {
              name: auth.row.full_name,
              dob: '20/08/2016', // Age 10 -> UNDER_13
            },
          };
        } else if (scenario === 'TAMPERED_DOC') {
          simulatedSignzyPayload = {
            status: 'SUCCESS',
            result: {
              name: auth.row.full_name,
              dob: '10/03/2005',
              tampered: true,
            },
          };
        } else if (scenario === 'NAME_MISMATCH') {
          simulatedSignzyPayload = {
            status: 'SUCCESS',
            valid: true,
            result: {
              name: 'Completely Different Person',
              dob: '10/03/2005',
            },
          };
        } else if (scenario === 'MANUAL_REVIEW') {
          simulatedSignzyPayload = {
            status: 'MANUAL_REVIEW',
            result: { manualReviewRequired: true, confidenceScore: 0.52 },
          };
        } else {
          simulatedSignzyPayload = {
            status: 'FAILED',
            valid: false,
            error: 'DOCUMENT_UNREADABLE',
          };
        }

        const mapped = signzyService.mapSignzyPayloadToMinimalResult(
          simulatedSignzyPayload,
          auth.row.full_name
        );
        engine.finalizeStudentAgeVerification({
          verifRow: pendingVerif,
          mappedResult: mapped,
          source: 'sandbox_simulation',
        });

        const updatedRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.row.id);
        return sendJson(res, 200, {
          user: sanitizeUser(updatedRow),
          overview: engine.getPublicStudentVerificationOverview(updatedRow),
        });
      }

      // Signzy Authenticated Webhook Receiver (HMAC-SHA256 + Replay Nonce Protection)
      if (pathname === '/api/webhooks/signzy' && method === 'POST') {
        const rawBuf = await readRawBody(req);
        const signatureHeader = req.headers['x-signzy-signature'] || '';
        const timestampHeader = req.headers['x-signzy-timestamp'] || '';
        const eventNonce = req.headers['x-signzy-event-id'] || '';

        const authCheck = signzyService.verifyWebhookAuthenticity({
          rawBodyBuffer: rawBuf,
          signatureHeader,
          timestampHeader,
        });

        if (!authCheck.valid) {
          engine.writeAuditLog({
            userReference: 'webhook',
            eventType: 'WEBHOOK_SIGNATURE_REJECTED',
            eventStatus: authCheck.reason,
          });
          return sendJson(res, 401, { error: 'Invalid webhook signature', reason: authCheck.reason });
        }

        const replayKey = `${eventNonce || signatureHeader}:${timestampHeader}`;
        const seenNonce = db
          .prepare('SELECT nonce_key FROM webhook_replay_nonces WHERE nonce_key = ?')
          .get(replayKey);
        if (seenNonce) {
          engine.writeAuditLog({
            userReference: 'webhook',
            eventType: 'WEBHOOK_REPLAY_BLOCKED',
            eventStatus: 'DUPLICATE_NONCE',
          });
          return sendJson(res, 409, { error: 'Duplicate or replayed webhook rejected.' });
        }

        db.prepare('INSERT INTO webhook_replay_nonces (nonce_key, received_at) VALUES (?, ?)').run(
          replayKey,
          Date.now()
        );

        let payload;
        try {
          payload = JSON.parse(rawBuf.toString('utf8'));
        } catch {
          return sendJson(res, 400, { error: 'Invalid JSON' });
        }

        const providerRef =
          payload.requestId || payload.referenceId || payload.result?.requestId || '';
        if (!providerRef) {
          return sendJson(res, 400, { error: 'Missing provider referenceId/requestId' });
        }

        // Match student age verification or parent adult verification
        const studentAgeVerif = db
          .prepare('SELECT * FROM age_verifications WHERE provider_reference = ?')
          .get(providerRef);
        if (studentAgeVerif) {
          const studentRow = db
            .prepare('SELECT * FROM users WHERE id = ?')
            .get(studentAgeVerif.user_id);
          const mapped = signzyService.mapSignzyPayloadToMinimalResult(
            payload,
            studentRow?.full_name || ''
          );
          engine.finalizeStudentAgeVerification({
            verifRow: studentAgeVerif,
            mappedResult: mapped,
            source: 'webhook',
          });
          return sendJson(res, 200, { received: true });
        }

        const parentVerif = db
          .prepare('SELECT * FROM parent_verifications WHERE provider_reference = ?')
          .get(providerRef);
        if (parentVerif) {
          const mapped = signzyService.mapSignzyPayloadToMinimalResult(
            payload,
            parentVerif.parent_name
          );
          const nextAdultStatus =
            mapped.internalStatus === 'VERIFIED_18_PLUS'
              ? 'VERIFIED_18_PLUS'
              : mapped.internalStatus === 'MANUAL_REVIEW'
              ? 'MANUAL_REVIEW'
              : 'VERIFICATION_FAILED';

          const authorityRes =
            nextAdultStatus === 'VERIFIED_18_PLUS'
              ? await signzyService.verifyParentalAuthorityPlaceholder({
                  studentId: parentVerif.student_id,
                  parentVerificationId: parentVerif.id,
                  relationshipType: parentVerif.relationship_type,
                })
              : { authorityStatus: 'FAILED' };

          db.prepare(`
            UPDATE parent_verifications
            SET adult_verification_status = ?, authority_verification_status = ?
            WHERE id = ?
          `).run(nextAdultStatus, authorityRes.authorityStatus, parentVerif.id);

          engine.evaluateAndApplyAccountActivation(parentVerif.student_id);
          return sendJson(res, 200, { received: true });
        }

        return sendJson(res, 404, { error: 'Unknown provider reference' });
      }

      // =========================================================================
      // 3. PARENT INVITATION, PARENT PORTAL VERIFICATION & CONSENT ENDPOINTS
      // =========================================================================
      if (pathname === '/api/verification/parent/invite' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_invite', 6, 60_000)) return;
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
        const body = await readJsonBody(req);

        const inviteRes = engine.createParentVerificationInvite({
          studentRow: auth.row,
          parentEmail: body.parentEmail,
          parentMobile: body.parentMobile,
        });

        const freshRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.row.id);
        return sendJson(res, 201, {
          ...inviteRes,
          user: sanitizeUser(freshRow),
        });
      }

      if (pathname === '/api/parent-portal/session/exchange' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_exchange', 10, 60_000)) return;
        const body = await readJsonBody(req);
        const exchanged = engine.consumeParentInviteToken(body.inviteToken);
        return sendJson(
          res,
          200,
          exchanged,
          {
            'Set-Cookie': makeCookieHeader(
              'teenstack_parent_session',
              exchanged.parentSessionToken,
              false
            ),
          }
        );
      }

      if (pathname === '/api/parent-portal/state' && method === 'GET') {
        const pAuth = getParentPortalAuth(req);
        if (!pAuth) {
          return sendJson(res, 401, {
            error: 'Valid parent verification session required. Please open a valid parent invite link.',
          });
        }
        const { pvRow, studentRow } = pAuth;
        const consentRow = db
          .prepare('SELECT * FROM parental_consents WHERE parent_verification_id = ?')
          .get(pvRow.id);

        return sendJson(res, 200, {
          consentVersion: CURRENT_CONSENT_VERSION,
          environmentMode: signzyService.mode,
          productionActivationDisabled: signzyService.mode !== 'live',
          student: {
            fullName: studentRow.full_name,
            username: studentRow.username,
            verifiedAgeBand: studentRow.verified_age_band,
            accountStatus: studentRow.account_status,
          },
          parentVerification: {
            id: pvRow.id,
            parentName: pvRow.parent_name,
            parentEmail: cryptoCtx.decryptPII(pvRow.parent_email),
            parentMobile: cryptoCtx.decryptPII(pvRow.parent_mobile),
            relationshipType: pvRow.relationship_type,
            adultVerificationStatus: pvRow.adult_verification_status,
            authorityVerificationStatus: pvRow.authority_verification_status,
          },
          consent: consentRow
            ? {
                consentTransactionId: consentRow.id,
                consentStatus: consentRow.consent_status,
                consentVersion: consentRow.consent_version,
                consentTimestamp: consentRow.consent_timestamp,
                withdrawalTimestamp: consentRow.withdrawal_timestamp,
              }
            : null,
        });
      }

      if (pathname === '/api/parent-portal/details' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_details', 10, 60_000)) return;
        const pAuth = getParentPortalAuth(req);
        if (!pAuth) return sendJson(res, 401, { error: 'Parent session required.' });
        const body = await readJsonBody(req);

        const updatedPv = engine.submitParentIndependentDetails({
          pvRow: pAuth.pvRow,
          studentRow: pAuth.studentRow,
          parentName: body.parentName,
          parentMobile: body.parentMobile,
          parentEmail: body.parentEmail,
          relationshipType: body.relationshipType,
        });

        return sendJson(res, 200, {
          parentVerification: {
            id: updatedPv.id,
            parentName: updatedPv.parent_name,
            parentEmail: cryptoCtx.decryptPII(updatedPv.parent_email),
            parentMobile: cryptoCtx.decryptPII(updatedPv.parent_mobile),
            relationshipType: updatedPv.relationship_type,
            adultVerificationStatus: updatedPv.adult_verification_status,
            authorityVerificationStatus: updatedPv.authority_verification_status,
          },
        });
      }

      if (pathname === '/api/parent-portal/verify-identity' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_kyc', 8, 60_000)) return;
        const pAuth = getParentPortalAuth(req);
        if (!pAuth) return sendJson(res, 401, { error: 'Parent session required.' });
        const body = await readJsonBody(req);

        let sandboxPayload = null;
        if (signzyService.mode === 'sandbox_mock') {
          const scenario = String(body.scenario || 'ADULT_18_PLUS');
          if (scenario === 'ADULT_18_PLUS') {
            sandboxPayload = {
              status: 'SUCCESS',
              valid: true,
              result: {
                name: pAuth.pvRow.parent_name,
                dob: '14/08/1982', // 44yo adult
              },
            };
          } else if (scenario === 'UNDERAGE_IMPOSTOR') {
            sandboxPayload = {
              status: 'SUCCESS',
              valid: true,
              result: {
                name: pAuth.pvRow.parent_name,
                dob: '11/05/2010', // 16yo minor pretending to be parent!
              },
            };
          } else {
            sandboxPayload = { status: 'FAILED', valid: false };
          }
        }

        const verifyRes = await engine.verifyParentAdultAndAuthority({
          pvRow: pAuth.pvRow,
          studentRow: pAuth.studentRow,
          originBaseUrl,
          sandboxPayload,
          sandboxAuthorityVerified: Boolean(body.sandboxAuthorityVerified),
        });

        return sendJson(res, 200, verifyRes);
      }

      if (pathname === '/api/parent-portal/consent' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_consent', 6, 60_000)) return;
        const pAuth = getParentPortalAuth(req);
        if (!pAuth) return sendJson(res, 401, { error: 'Parent session required.' });
        const body = await readJsonBody(req);

        const consentRes = engine.recordParentalConsent({
          pvRow: pAuth.pvRow,
          studentRow: pAuth.studentRow,
          decision: body.decision,
          consentVersion: body.consentVersion,
          acknowledgements: body.acknowledgements,
        });

        return sendJson(res, 201, consentRes);
      }

      if (pathname === '/api/parent-portal/consent/withdraw' && method === 'POST') {
        if (!checkRateLimit(req, res, 'parent_withdraw', 6, 60_000)) return;
        const pAuth = getParentPortalAuth(req);
        const body = await readJsonBody(req);

        if (!pAuth && !body.withdrawalToken) {
          return sendJson(res, 401, {
            error: 'Valid parent session or consent withdrawal token is required.',
          });
        }

        const withdrawn = engine.withdrawParentalConsent({
          pvRowFromSession: pAuth?.pvRow || null,
          rawWithdrawalToken: body.withdrawalToken || null,
        });
        return sendJson(res, 200, withdrawn);
      }

      // =========================================================================
      // 4. PRIVACY, DATA RETENTION & COMPLIANCE AUDIT RBAC ENDPOINTS
      // =========================================================================
      if (pathname === '/api/privacy/delete-account' && method === 'POST') {
        const auth = getAuthUser(req);
        if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
        const deletionId = engine.scheduleDataDeletion(
          auth.row.id,
          'USER_REQUESTED_ERASURE',
          auth.sessionRole
        );
        db.prepare(`
          UPDATE users
          SET account_status = 'CONSENT_WITHDRAWN_RESTRICTED', marketing_opt_in = 0
          WHERE id = ?
        `).run(auth.row.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(auth.row.id);
        return sendJson(res, 200, {
          ok: true,
          deletionRequestId: deletionId,
          status: 'SCHEDULED',
        });
      }

      if (pathname === '/api/admin/compliance/audit-logs' && method === 'GET') {
        const auth = getAuthUser(req);
        const adminKeyHeader = req.headers['x-compliance-admin-key'] || '';
        const expectedAdminKey = env.COMPLIANCE_ADMIN_KEY || '';
        const isAdminRole = auth && auth.sessionRole === 'compliance_admin';
        const isKeyAuthed = expectedAdminKey && adminKeyHeader === expectedAdminKey;

        if (!isAdminRole && !isKeyAuthed) {
          return sendJson(res, 403, { error: 'Forbidden: compliance_admin role required.' });
        }

        const logs = db
          .prepare(
            'SELECT id, user_reference, event_type, event_status, provider_reference, actor_role, metadata_json, timestamp FROM verification_audit_logs ORDER BY datetime(timestamp) DESC, rowid DESC LIMIT 100'
          )
          .all();

        return sendJson(res, 200, {
          providerDiagnostics: signzyService.getProviderDiagnostics(),
          auditLogs: logs.map((l) => ({
            ...l,
            metadata: JSON.parse(l.metadata_json || '{}'),
          })),
        });
      }

      // =========================================================================
      // 1B. USERNAME AVAILABILITY & PASSWORD RESET ENDPOINTS
      // =========================================================================
      if (pathname === '/api/auth/check-username' && method === 'GET') {
        const q = urlObj.searchParams.get('username') || '';
        return sendJson(res, 200, domains.checkUsernameAvailability(q));
      }

      if (pathname === '/api/auth/password-reset/request' && method === 'POST') {
        if (!checkRateLimit(req, res, 'pwd_reset_req', 5, 60_000)) return;
        const body = await readJsonBody(req);
        const resetRes = domains.requestPasswordReset(body.email);
        return sendJson(res, 200, resetRes);
      }

      if (pathname === '/api/auth/password-reset/confirm' && method === 'POST') {
        if (!checkRateLimit(req, res, 'pwd_reset_confirm', 5, 60_000)) return;
        const body = await readJsonBody(req);
        const done = domains.confirmPasswordReset({
          resetToken: body.resetToken,
          newPassword: body.newPassword,
        });
        return sendJson(res, 200, done);
      }

      // =========================================================================
      // 5. GATED TEENSTACK FULL PLATFORM ENDPOINTS (REQUIRE ACTIVE STATUS!)
      // =========================================================================
      if (pathname === '/api/bootstrap' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const bundle = domains.getAuthenticatedBootstrap(auth.user);
        return sendJson(res, 200, { user: auth.user, ...bundle });
      }

      if (pathname === '/api/onboarding' && method === 'PUT') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const { step, completed, profilePatch, fullName } = body;

        let currentProfile = {};
        try {
          currentProfile = JSON.parse(auth.row.profile_json || '{}');
        } catch {
          currentProfile = {};
        }

        const mergedProfile = {
          ...currentProfile,
          ...(profilePatch || {}),
          privacy: {
            ...(currentProfile.privacy || {}),
            ...((profilePatch && profilePatch.privacy) || {}),
          },
        };

        const nextStep =
          typeof step === 'number' ? Math.max(1, Math.min(5, step)) : auth.row.onboarding_step;
        const nextCompleted =
          completed !== undefined ? (completed ? 1 : 0) : auth.row.onboarding_completed;
        const nextName = fullName ? String(fullName).trim() : auth.row.full_name;

        db.prepare(`
          UPDATE users
          SET full_name = ?, onboarding_step = ?, onboarding_completed = ?, profile_json = ?
          WHERE id = ?
        `).run(nextName, nextStep, nextCompleted, JSON.stringify(mergedProfile), auth.user.id);

        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 200, { user: sanitizeUser(updated) });
      }

      // --- Profile Projects & Achievements CRUD ---
      if (pathname === '/api/profile/projects' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const project = domains.addStudentProject({
          userId: auth.user.id,
          title: body.title,
          summary: body.summary,
          link: body.link,
          tag: body.tag,
        });
        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 201, { project, user: sanitizeUser(updated) });
      }

      const projDeleteMatch = pathname.match(/^\/api\/profile\/projects\/([^/]+)$/);
      if (projDeleteMatch && method === 'DELETE') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        domains.deleteStudentProject({
          userId: auth.user.id,
          projectId: decodeURIComponent(projDeleteMatch[1]),
        });
        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 200, { user: sanitizeUser(updated) });
      }

      if (pathname === '/api/profile/achievements' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const achievement = domains.addStudentAchievement({
          userId: auth.user.id,
          title: body.title,
          issuer: body.issuer,
        });
        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 201, { achievement, user: sanitizeUser(updated) });
      }

      const achDeleteMatch = pathname.match(/^\/api\/profile\/achievements\/([^/]+)$/);
      if (achDeleteMatch && method === 'DELETE') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        domains.deleteStudentAchievement({
          userId: auth.user.id,
          achievementId: decodeURIComponent(achDeleteMatch[1]),
        });
        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 200, { user: sanitizeUser(updated) });
      }

      // --- Social Network: Peers, Friends, Mutuals & Profile Bundle ---
      if (pathname === '/api/network/peers' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(res, 200, { peers: domains.listPeersForUser(auth.user.id) });
      }

      if (pathname === '/api/network/connect' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const result = domains.toggleFriendship({
          viewerRow: auth.row,
          targetPeerId: body.peerId,
        });
        return sendJson(res, 200, {
          ...result,
          peers: domains.listPeersForUser(auth.user.id),
        });
      }

      const profileBundleMatch = pathname.match(/^\/api\/network\/profile\/([^/]+)$/);
      if (profileBundleMatch && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const bundle = domains.getFullProfileBundle({
          viewerId: auth.user.id,
          identifier: decodeURIComponent(profileBundleMatch[1]),
        });
        return sendJson(res, 200, bundle);
      }

      // --- Feed, Posts, Reels, 24h Stories, Comments & Shares ---
      if (pathname === '/api/posts' && method === 'GET') {
        const auth = getAuthUser(req);
        const viewerId = auth?.row?.account_status === 'ACTIVE' ? auth.user.id : null;
        const posts = domains.listFeedPosts({
          viewerId,
          category: urlObj.searchParams.get('category'),
          skill: urlObj.searchParams.get('skill'),
          authorId: urlObj.searchParams.get('authorId'),
          savedOnly: urlObj.searchParams.get('savedOnly') === 'true',
          includeStories: urlObj.searchParams.get('excludeStories') !== 'true',
        });
        return sendJson(res, 200, { posts });
      }

      if (pathname === '/api/posts' && method === 'POST') {
        if (!checkRateLimit(req, res, 'create_post', 15, 60_000)) return;
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const post = domains.createPostWithRules({
          authorUser: auth.user,
          category: body.category,
          title: body.title,
          content: body.content,
          mediaType: body.mediaType,
          mediaMeta: body.mediaMeta,
          skillTags: body.skillTags,
        });
        return sendJson(res, 201, { post });
      }

      const postItemMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
      if (postItemMatch && method === 'DELETE') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const result = domains.deletePost({
          userId: auth.user.id,
          postId: decodeURIComponent(postItemMatch[1]),
        });
        return sendJson(res, 200, result);
      }

      const commentMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comment$/);
      if (commentMatch && method === 'POST') {
        if (!checkRateLimit(req, res, 'comment_post', 20, 60_000)) return;
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const comments = domains.addCommentToPost({
          authorUser: auth.user,
          postId: decodeURIComponent(commentMatch[1]),
          text: body.text,
        });
        return sendJson(res, 200, { comments });
      }

      const shareMatch = pathname.match(/^\/api\/posts\/([^/]+)\/share$/);
      if (shareMatch && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const shareRes = domains.recordPostShare(decodeURIComponent(shareMatch[1]));
        return sendJson(res, 200, shareRes);
      }

      const storyViewMatch = pathname.match(/^\/api\/stories\/([^/]+)\/view$/);
      if (storyViewMatch && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const viewRes = domains.recordStoryView({
          viewerId: auth.user.id,
          storyId: decodeURIComponent(storyViewMatch[1]),
        });
        return sendJson(res, 200, viewRes);
      }

      // --- Unified Interactions Toggle (Likes, Saves, Connects, Course/Opp sync) ---
      if (pathname === '/api/interactions/toggle' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const { targetType, targetId, meta } = body;
        if (!targetType || !targetId) {
          return sendJson(res, 400, { error: 'Invalid interaction target' });
        }

        if (targetType === 'connect') {
          const fRes = domains.toggleFriendship({
            viewerRow: auth.row,
            targetPeerId: targetId,
          });
          const interactions = db
            .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
            .all(auth.user.id);
          return sendJson(res, 200, { active: fRes.connected, interactions });
        }

        if (targetType === 'course_module' && String(targetId).includes(':')) {
          const [cId, mCode] = String(targetId).split(':');
          const cRes = domains.toggleCourseModuleProgress({
            user: auth.user,
            courseId: cId,
            moduleCode: mCode,
          });
          const interactions = db
            .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
            .all(auth.user.id);
          return sendJson(res, 200, {
            active: cRes.completed,
            certificateAwarded: cRes.certificateAwarded,
            interactions,
          });
        }

        const existing = db
          .prepare(
            'SELECT * FROM user_interactions WHERE user_id = ? AND target_type = ? AND target_id = ?'
          )
          .get(auth.user.id, targetType, targetId);

        let active = false;
        if (existing) {
          db.prepare(
            'DELETE FROM user_interactions WHERE user_id = ? AND target_type = ? AND target_id = ?'
          ).run(auth.user.id, targetType, targetId);
          if (targetType === 'like') {
            db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(
              targetId
            );
          }
        } else {
          db.prepare(
            'INSERT INTO user_interactions (user_id, target_type, target_id, meta_json) VALUES (?, ?, ?, ?)'
          ).run(auth.user.id, targetType, targetId, JSON.stringify(meta || {}));
          active = true;
          if (targetType === 'like') {
            db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(targetId);
          }
        }

        const interactions = db
          .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
          .all(auth.user.id);
        return sendJson(res, 200, { active, interactions });
      }

      // --- Chats, Threads, Read Receipts & Messages ---
      if (pathname === '/api/chats/threads' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(res, 200, domains.listThreadsForUser(auth.user.id));
      }

      if (pathname === '/api/chats/threads/direct' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const directRes = domains.openDirectThreadWithPrivacyCheck({
          senderRow: auth.row,
          targetPeerId: body.peerId,
        });
        return sendJson(res, 200, {
          ...directRes,
          ...domains.listThreadsForUser(auth.user.id),
        });
      }

      const threadReadMatch = pathname.match(/^\/api\/chats\/threads\/([^/]+)\/read$/);
      if (threadReadMatch && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(
          res,
          200,
          domains.markThreadRead({
            userId: auth.user.id,
            threadId: decodeURIComponent(threadReadMatch[1]),
          })
        );
      }

      if (pathname === '/api/messages' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const threadFilter = urlObj.searchParams.get('threadId');
        const rows = threadFilter
          ? db
              .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY datetime(created_at) ASC')
              .all(threadFilter)
          : db.prepare('SELECT * FROM messages ORDER BY datetime(created_at) ASC').all();
        return sendJson(res, 200, {
          messages: rows.map((m) => ({
            id: m.id,
            threadId: m.thread_id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            text: m.text,
            createdAt: m.created_at,
          })),
        });
      }

      if (pathname === '/api/messages' && method === 'POST') {
        if (!checkRateLimit(req, res, 'send_message', 30, 60_000)) return;
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        if (!body.threadId || !body.text || !String(body.text).trim()) {
          return sendJson(res, 400, { error: 'Message text required' });
        }
        const message = domains.sendChatMessageWithSafety({
          senderUser: auth.user,
          threadId: body.threadId,
          text: body.text,
        });
        return sendJson(res, 201, { message });
      }

      // --- Opportunities, Hackathons & Student Bounties ---
      if (pathname === '/api/opportunities' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const opportunities = domains.listOpportunities({
          userId: auth.user.id,
          typeFilter: urlObj.searchParams.get('type'),
        });
        return sendJson(res, 200, { opportunities });
      }

      if (pathname === '/api/opportunities' && method === 'POST') {
        if (!checkRateLimit(req, res, 'create_opp', 6, 60_000)) return;
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const opportunity = domains.createOpportunityBounty({
          creatorUser: auth.user,
          title: body.title,
          organization: body.organization,
          type: body.type,
          deadline: body.deadline,
          mode: body.mode,
          reward: body.reward,
          skills: body.skills,
          description: body.description,
        });
        return sendJson(res, 201, { opportunity });
      }

      const oppApplyMatch = pathname.match(/^\/api\/opportunities\/([^/]+)\/apply$/);
      if (oppApplyMatch && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const body = await readJsonBody(req);
        const appRes = domains.applyToOpportunity({
          user: auth.user,
          opportunityId: decodeURIComponent(oppApplyMatch[1]),
          pitchNote: body.pitchNote,
        });
        return sendJson(res, 201, appRes);
      }

      // --- Learning Courses & Module Progress ---
      if (pathname === '/api/courses' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(res, 200, domains.listCoursesWithProgress(auth.user.id));
      }

      const modToggleMatch = pathname.match(/^\/api\/courses\/([^/]+)\/modules\/([^/]+)\/toggle$/);
      if (modToggleMatch && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const toggled = domains.toggleCourseModuleProgress({
          user: auth.user,
          courseId: decodeURIComponent(modToggleMatch[1]),
          moduleCode: decodeURIComponent(modToggleMatch[2]),
        });
        const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
        return sendJson(res, 200, {
          ...toggled,
          user: sanitizeUser(updatedUser),
        });
      }

      // --- Notifications & Unified Global Search ---
      if (pathname === '/api/notifications' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(res, 200, { notifications: domains.listNotifications(auth.user.id) });
      }

      if (pathname === '/api/notifications/read-all' && method === 'POST') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        return sendJson(res, 200, { notifications: domains.markNotificationsRead(auth.user.id) });
      }

      if (pathname === '/api/search' && method === 'GET') {
        const auth = requireActiveStudentAccount(req, res);
        if (!auth) return;
        const results = domains.executeGlobalSearch({
          viewerId: auth.user.id,
          query: urlObj.searchParams.get('q') || '',
        });
        return sendJson(res, 200, results);
      }

      // Serve static production frontend from dist/
      if (fs.existsSync(distPath)) {
        const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const candidate = path.resolve(distPath, safeRel);
        if (
          candidate.startsWith(distPath) &&
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isFile()
        ) {
          const ext = path.extname(candidate).toLowerCase();
          const cacheControl = pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : pathname.startsWith('/images/')
            ? 'public, max-age=86400'
            : 'no-cache';
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': cacheControl,
          });
          fs.createReadStream(candidate).pipe(res);
          return;
        }
        const indexHtml = path.join(distPath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/html; charset=utf-8',
          });
          fs.createReadStream(indexHtml).pipe(res);
          return;
        }
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const status = typeof err.status === 'number' ? err.status : 500;
      if (status >= 500) {
        console.error('[TeenStack Error]', redactSensitiveFields({ message: err.message }));
      }
      sendJson(res, status, {
        error: status === 500 ? 'Internal server error' : err.message,
        code: err.code || undefined,
      });
    }
  });

  return { server, db, cryptoCtx, signzyService, engine, domains };
}

// Start server automatically when invoked directly via `node server/index.mjs`
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === __filename) {
  const PORT = Number(process.env.PORT || 3001);
  const { server, signzyService } = createTeenStackServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `[TeenStack Server] Running HTTP + SQLite on http://127.0.0.1:${PORT} (Signzy mode: ${signzyService.mode})`
    );
  });
}
