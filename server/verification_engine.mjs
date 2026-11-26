import { randomBytes } from 'node:crypto';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  maskMobile,
  normalizeEmail,
  normalizeMobile,
  redactSensitiveFields,
} from './security.mjs';
import { INTERNAL_VERIFICATION_STATES } from './signzy_age_verification.mjs';

export const CURRENT_CONSENT_VERSION = 'DPDP-TEENSTACK-CONSENT-v2026.1';
const AGE_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const PARENT_INVITE_TTL_MS = 30 * 60 * 1000; // 30 minutes, single-use
const PARENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const RETENTION_PURGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7-day grace window before hard purge

export function createVerificationEngine({ db, cryptoCtx, signzyService }) {
  function writeAuditLog({
    userReference,
    eventType,
    eventStatus,
    providerReference = '',
    actorRole = 'system',
    metadata = {},
  }) {
    const id = `aud_${randomBytes(8).toString('hex')}`;
    const safeMeta = redactSensitiveFields(metadata || {});
    db.prepare(`
      INSERT INTO verification_audit_logs (
        id, user_reference, event_type, event_status, provider_reference, actor_role, metadata_json, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(userReference || 'unknown'),
      String(eventType),
      String(eventStatus),
      String(providerReference || ''),
      String(actorRole || 'system'),
      JSON.stringify(safeMeta),
      new Date().toISOString()
    );
  }

  function scheduleDataDeletion(userId, reason, requestedByRole) {
    const existing = db
      .prepare("SELECT id FROM data_deletion_requests WHERE user_id = ? AND status = 'SCHEDULED'")
      .get(userId);
    if (existing) return existing.id;

    const delId = `del_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const purgeAt = new Date(now.getTime() + RETENTION_PURGE_WINDOW_MS).toISOString();
    db.prepare(`
      INSERT INTO data_deletion_requests (
        id, user_id, reason, requested_by_role, status, scheduled_purge_at, created_at
      ) VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?)
    `).run(delId, userId, reason, requestedByRole, purgeAt, now.toISOString());

    writeAuditLog({
      userReference: userId,
      eventType: 'DATA_RETENTION_DELETION_SCHEDULED',
      eventStatus: 'SCHEDULED',
      actorRole: requestedByRole,
      metadata: { reason, scheduledPurgeAt: purgeAt },
    });
    return delId;
  }

  /**
   * SECTION 5: STRICT SERVER-SIDE ACCOUNT ACTIVATION ENGINE
   * Never trusts declared_dob. Evaluates cryptographic/provider verification records only.
   */
  function evaluateAndApplyAccountActivation(studentId) {
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
    if (!userRow) return null;

    const latestAgeVerif = db
      .prepare(
        'SELECT * FROM age_verifications WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1'
      )
      .get(studentId);

    const latestConsent = db
      .prepare(
        'SELECT * FROM parental_consents WHERE student_id = ? ORDER BY datetime(consent_timestamp) DESC, rowid DESC LIMIT 1'
      )
      .get(studentId);

    const latestParentVerif = db
      .prepare(
        'SELECT * FROM parent_verifications WHERE student_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1'
      )
      .get(studentId);

    // 1. Check if parental consent was previously granted and subsequently WITHDRAWN
    if (latestConsent && latestConsent.consent_status === 'WITHDRAWN') {
      db.prepare(`
        UPDATE users
        SET account_status = 'CONSENT_WITHDRAWN_RESTRICTED', marketing_opt_in = 0
        WHERE id = ?
      `).run(studentId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(studentId);
      scheduleDataDeletion(studentId, 'PARENTAL_CONSENT_WITHDRAWN', 'parent');
      return 'CONSENT_WITHDRAWN_RESTRICTED';
    }

    if (!latestAgeVerif || latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.PENDING) {
      db.prepare("UPDATE users SET account_status = 'PENDING_VERIFICATION' WHERE id = ?").run(studentId);
      return 'PENDING_VERIFICATION';
    }

    // Check timeout expiration on pending/unverified records
    if (latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.UNDER_13) {
      db.prepare(`
        UPDATE users
        SET verified_age_band = 'UNDER_13', account_status = 'REJECTED_UNDER_13', marketing_opt_in = 0
        WHERE id = ?
      `).run(studentId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(studentId);
      scheduleDataDeletion(studentId, 'MINIMUM_AGE_POLICY_UNDER_13', 'system');
      writeAuditLog({
        userReference: studentId,
        eventType: 'ACCOUNT_ACTIVATION_BLOCKED_UNDER_13',
        eventStatus: 'REJECTED_UNDER_13',
        providerReference: latestAgeVerif.provider_reference,
      });
      return 'REJECTED_UNDER_13';
    }

    if (latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED) {
      db.prepare(`
        UPDATE users SET account_status = 'VERIFICATION_FAILED' WHERE id = ?
      `).run(studentId);
      return 'VERIFICATION_FAILED';
    }

    if (latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.MANUAL_REVIEW) {
      db.prepare(`
        UPDATE users SET account_status = 'MANUAL_REVIEW' WHERE id = ?
      `).run(studentId);
      return 'MANUAL_REVIEW';
    }

    const isSandboxResult = latestAgeVerif.provider_name === 'signzy_sandbox_mock';
    if (signzyService.isProd && isSandboxResult) {
      // Never allow sandbox mock records to activate an account in production
      db.prepare("UPDATE users SET account_status = 'PENDING_VERIFICATION' WHERE id = ?").run(studentId);
      writeAuditLog({
        userReference: studentId,
        eventType: 'PRODUCTION_SANDBOX_ACTIVATION_BLOCKED',
        eventStatus: 'BLOCKED',
        providerReference: latestAgeVerif.provider_reference,
      });
      return 'PENDING_VERIFICATION';
    }

    // 2. Adult 18+ Path: Independent age verification succeeded -> NO parental consent requested
    if (latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS) {
      db.prepare(`
        UPDATE users
        SET verified_age_band = 'VERIFIED_18_PLUS', account_status = 'ACTIVE', age = MAX(18, age)
        WHERE id = ?
      `).run(studentId);
      writeAuditLog({
        userReference: studentId,
        eventType: 'ACCOUNT_ACTIVATED_18_PLUS',
        eventStatus: 'ACTIVE',
        providerReference: latestAgeVerif.provider_reference,
      });
      return 'ACTIVE';
    }

    // 3. Minor Student 13–17 Path: Requires ALL 4 checks (Student Age + Parent 18+ + Parental Authority + Explicit Consent)
    if (latestAgeVerif.verification_status === INTERNAL_VERIFICATION_STATES.VERIFIED_13_17) {
      db.prepare(`
        UPDATE users
        SET verified_age_band = 'VERIFIED_13_17', marketing_opt_in = 0
        WHERE id = ?
      `).run(studentId);

      if (latestConsent && latestConsent.consent_status === 'REJECTED') {
        db.prepare("UPDATE users SET account_status = 'PARENT_REJECTED' WHERE id = ?").run(studentId);
        scheduleDataDeletion(studentId, 'PARENT_REJECTED_REGISTRATION', 'parent');
        return 'PARENT_REJECTED';
      }

      const parentAdultVerified =
        latestParentVerif &&
        latestParentVerif.adult_verification_status === INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS;

      const authorityVerified =
        latestParentVerif &&
        (latestParentVerif.authority_verification_status === 'VERIFIED' ||
          (!signzyService.isProd &&
            latestParentVerif.authority_verification_status === 'SANDBOX_VERIFIED'));

      const consentApproved =
        latestConsent &&
        latestParentVerif &&
        latestConsent.parent_verification_id === latestParentVerif.id &&
        latestConsent.consent_status === 'APPROVED' &&
        !latestConsent.withdrawal_timestamp;

      if (parentAdultVerified && authorityVerified && consentApproved) {
        db.prepare(`
          UPDATE users
          SET verified_age_band = 'VERIFIED_13_17', account_status = 'ACTIVE', marketing_opt_in = 0
          WHERE id = ?
        `).run(studentId);
        writeAuditLog({
          userReference: studentId,
          eventType: 'ACCOUNT_ACTIVATED_13_17_WITH_PARENTAL_CONSENT',
          eventStatus: 'ACTIVE',
          providerReference: latestConsent.id,
        });
        return 'ACTIVE';
      }

      db.prepare("UPDATE users SET account_status = 'AGE_VERIFIED_AWAITING_PARENT' WHERE id = ?").run(
        studentId
      );
      return 'AGE_VERIFIED_AWAITING_PARENT';
    }

    return userRow.account_status;
  }

  /**
   * SECTION 1: STUDENT REGISTRATION (Minimal Lawful Initial Collection, PENDING_VERIFICATION)
   */
  function registerPendingStudent({ fullName, declaredDob, email, mobile, username, password }) {
    const cleanName = String(fullName || '').trim();
    const cleanEmail = normalizeEmail(email);
    const cleanMobile = normalizeMobile(mobile);
    const cleanDob = String(declaredDob || '').trim();
    const cleanUsername = String(username || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      const err = new Error('Please enter your full legal name.');
      err.status = 400;
      throw err;
    }
    if (!cleanDob || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
      const err = new Error('Please enter a valid declared date of birth (YYYY-MM-DD).');
      err.status = 400;
      throw err;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const err = new Error('Please enter a valid email address.');
      err.status = 400;
      throw err;
    }
    if (!cleanMobile || cleanMobile.length < 10 || cleanMobile.length > 15) {
      const err = new Error('Please enter a valid 10-digit mobile number.');
      err.status = 400;
      throw err;
    }
    if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
      const err = new Error(
        'Username must be 3–24 characters using letters, numbers, underscores (_), or dots (.).'
      );
      err.status = 400;
      throw err;
    }
    if (!password || String(password).length < 8) {
      const err = new Error('Password must be at least 8 characters long.');
      err.status = 400;
      throw err;
    }

    const emailHash = cryptoCtx.blindIndex('email', cleanEmail);
    const mobileHash = cryptoCtx.blindIndex('mobile', cleanMobile);

    const existingEmail = db
      .prepare('SELECT id FROM users WHERE email_lookup_hash = ?')
      .get(emailHash);
    if (existingEmail) {
      const err = new Error('An account with this email address already exists.');
      err.status = 409;
      throw err;
    }

    const existingUsername = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
      .get(cleanUsername);
    if (existingUsername) {
      const err = new Error('That username is already taken. Please choose another.');
      err.status = 409;
      throw err;
    }

    const existingMobile = db
      .prepare('SELECT id FROM users WHERE mobile_lookup_hash = ?')
      .get(mobileHash);
    if (existingMobile) {
      const err = new Error('An account with this mobile number already exists.');
      err.status = 409;
      throw err;
    }

    const userId = `usr_${randomBytes(8).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const minimalInitialProfile = {
      subjects: [],
      educationLevel: 'Pending Verification',
      school: '',
      careerInterests: [],
      skills: [],
      generatedTags: [],
      experienceYears: 0,
      projectsCompleted: 0,
      ratePerProject: '',
      targetClients: '',
      achievements: [],
      competitions: [],
      careerAim: '',
      desiredField: '',
      skillsToLearn: [],
      avatarUrl: '',
      avatarPreset: 'violet-coder',
      bio: '',
      portfolioUrl: '',
      portfolioProjects: [],
      privacy: {
        profileVisibility: 'students_only',
        dmPermission: 'connections_only',
        hideContactInfo: true,
        guardianEmail: '',
        contentSafetyFilter: true,
      },
    };

    db.prepare(`
      INSERT INTO users (
        id, full_name, username, email, email_lookup_hash, mobile, mobile_lookup_hash,
        password_hash, declared_dob, verified_age_band, account_status, role,
        age, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED', 'PENDING_VERIFICATION', 'student', 16, 0, 1, 0, ?, ?)
    `).run(
      userId,
      cleanName,
      cleanUsername,
      cryptoCtx.encryptPII(cleanEmail),
      emailHash,
      cryptoCtx.encryptPII(mobile),
      mobileHash,
      hashPassword(password),
      cryptoCtx.encryptPII(cleanDob),
      JSON.stringify(minimalInitialProfile),
      nowIso
    );

    writeAuditLog({
      userReference: userId,
      eventType: 'STUDENT_REGISTRATION_CREATED',
      eventStatus: 'PENDING_VERIFICATION',
      actorRole: 'student',
      metadata: { declaredDobRecordedAsUnverified: true },
    });

    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }

  /**
   * Initiates or deduplicates a student age-verification session via Signzy.
   */
  async function startStudentAgeVerification({ userRow, idempotencyKey, originBaseUrl }) {
    if (userRow.account_status === 'ACTIVE') {
      const err = new Error('Account is already verified and active.');
      err.status = 409;
      throw err;
    }
    if (userRow.account_status === 'REJECTED_UNDER_13') {
      const err = new Error(
        'Registration cannot proceed under TeenStack minimum-age policy (under 13).'
      );
      err.status = 403;
      throw err;
    }

    // Prevent duplicate concurrent verification sessions / idempotent replay
    if (idempotencyKey) {
      const byKey = db
        .prepare('SELECT * FROM age_verifications WHERE idempotency_key = ? AND user_id = ?')
        .get(idempotencyKey, userRow.id);
      if (byKey) {
        return {
          verificationSessionId: byKey.id,
          status: byKey.verification_status,
          hostedUrl: byKey.hosted_url || '',
          expiresAt: byKey.expires_at,
          isSandboxMock: byKey.provider_name === 'signzy_sandbox_mock',
          deduplicated: true,
        };
      }
    }

    const activePending = db
      .prepare(
        "SELECT * FROM age_verifications WHERE user_id = ? AND verification_status = 'PENDING' ORDER BY datetime(created_at) DESC LIMIT 1"
      )
      .get(userRow.id);

    if (activePending && new Date(activePending.expires_at).getTime() > Date.now()) {
      return {
        verificationSessionId: activePending.id,
        status: activePending.verification_status,
        hostedUrl: activePending.hosted_url || '',
        expiresAt: activePending.expires_at,
        isSandboxMock: activePending.provider_name === 'signzy_sandbox_mock',
        deduplicated: true,
      };
    }

    const sessionRes = await signzyService.initiateVerificationSession({
      subjectType: 'student',
      expectedName: userRow.full_name,
      redirectUrl: `${originBaseUrl}/#/verify-status`,
      callbackUrl: `${originBaseUrl}/api/webhooks/signzy`,
    });

    const verifId = `agv_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AGE_SESSION_TTL_MS).toISOString();

    db.prepare(`
      INSERT INTO age_verifications (
        id, user_id, provider_name, provider_reference, verification_status,
        verified_age_band, method_used, idempotency_key, hosted_url, expires_at, created_at
      ) VALUES (?, ?, ?, ?, 'PENDING', 'UNVERIFIED', 'digilocker', ?, ?, ?, ?)
    `).run(
      verifId,
      userRow.id,
      sessionRes.providerName,
      sessionRes.providerReference,
      idempotencyKey || null,
      sessionRes.hostedUrl || '',
      expiresAt,
      now.toISOString()
    );

    writeAuditLog({
      userReference: userRow.id,
      eventType: 'AGE_VERIFICATION_INITIATED',
      eventStatus: 'PENDING',
      providerReference: sessionRes.providerReference,
      actorRole: 'student',
      metadata: { mode: signzyService.mode },
    });

    return {
      verificationSessionId: verifId,
      status: 'PENDING',
      hostedUrl: sessionRes.hostedUrl || '',
      expiresAt,
      isSandboxMock: sessionRes.isSandboxMock,
      deduplicated: false,
    };
  }

  /**
   * Applies a mapped verification result to `age_verifications` and runs the Account Activation Engine.
   * Never exposes provider_reference to student client responses.
   */
  function finalizeStudentAgeVerification({ verifRow, mappedResult, source }) {
    if (verifRow.verification_status !== INTERNAL_VERIFICATION_STATES.PENDING) {
      // Idempotent guard against duplicate webhook/polling completion
      return evaluateAndApplyAccountActivation(verifRow.user_id);
    }

    // Timeout check
    if (new Date(verifRow.expires_at).getTime() < Date.now()) {
      db.prepare(`
        UPDATE age_verifications
        SET verification_status = 'VERIFICATION_FAILED', verification_timestamp = ?
        WHERE id = ?
      `).run(new Date().toISOString(), verifRow.id);
      writeAuditLog({
        userReference: verifRow.user_id,
        eventType: 'AGE_VERIFICATION_SESSION_EXPIRED',
        eventStatus: 'VERIFICATION_FAILED',
        providerReference: verifRow.provider_reference,
      });
      return evaluateAndApplyAccountActivation(verifRow.user_id);
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE age_verifications
      SET verification_status = ?, verified_age_band = ?, verification_timestamp = ?
      WHERE id = ?
    `).run(
      mappedResult.internalStatus,
      mappedResult.verifiedAgeBand || 'UNVERIFIED',
      nowIso,
      verifRow.id
    );

    writeAuditLog({
      userReference: verifRow.user_id,
      eventType: `AGE_VERIFICATION_RESULT_${source.toUpperCase()}`,
      eventStatus: mappedResult.internalStatus,
      providerReference: verifRow.provider_reference,
      metadata: { reasonCode: mappedResult.reasonCode },
    });

    return evaluateAndApplyAccountActivation(verifRow.user_id);
  }

  /**
   * SECTION 3: INITIATE SEPARATE PARENT VERIFICATION LINK (Short-lived, single-use token)
   * Strictly rejects student's own mobile number or email address!
   */
  function createParentVerificationInvite({ studentRow, parentEmail, parentMobile }) {
    if (studentRow.verified_age_band !== INTERNAL_VERIFICATION_STATES.VERIFIED_13_17) {
      const err = new Error(
        'Parental verification is only initiated after student age is verified as 13–17.'
      );
      err.status = 400;
      throw err;
    }

    const cleanParentEmail = normalizeEmail(parentEmail);
    const cleanParentMobile = normalizeMobile(parentMobile);

    if (!cleanParentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanParentEmail)) {
      const err = new Error("Please enter a valid parent or legal guardian's email address.");
      err.status = 400;
      throw err;
    }
    if (!cleanParentMobile || cleanParentMobile.length < 10 || cleanParentMobile.length > 15) {
      const err = new Error("Please enter a valid 10-digit parent or legal guardian's mobile number.");
      err.status = 400;
      throw err;
    }

    const parentEmailHash = cryptoCtx.blindIndex('email', cleanParentEmail);
    const parentMobileHash = cryptoCtx.blindIndex('mobile', cleanParentMobile);

    // ANTI-SPOOFING: Block student entering their own email or mobile number as their parent's!
    if (
      parentEmailHash === studentRow.email_lookup_hash ||
      parentMobileHash === studentRow.mobile_lookup_hash
    ) {
      writeAuditLog({
        userReference: studentRow.id,
        eventType: 'SELF_PARENT_COLLISION_BLOCKED',
        eventStatus: 'REJECTED',
        actorRole: 'student',
        metadata: {
          emailMatchedStudent: parentEmailHash === studentRow.email_lookup_hash,
          mobileMatchedStudent: parentMobileHash === studentRow.mobile_lookup_hash,
        },
      });
      const err = new Error(
        "Parent's mobile number and email address must belong to your parent or legal guardian and cannot match the student's contact details."
      );
      err.status = 422;
      err.code = 'SELF_PARENT_CONTACT_FORBIDDEN';
      throw err;
    }

    // Invalidate any previous unconsumed invite tokens for this student so only 1 link is live
    db.prepare(`
      UPDATE parent_verifications
      SET invite_expires_at = ?
      WHERE student_id = ? AND invite_consumed_at IS NULL
    `).run(new Date(0).toISOString(), studentRow.id);

    const rawInviteToken = generateOpaqueToken(32);
    const inviteTokenHash = hashToken(rawInviteToken);
    const pvId = `prv_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const inviteExpiresAt = new Date(now.getTime() + PARENT_INVITE_TTL_MS).toISOString();

    db.prepare(`
      INSERT INTO parent_verifications (
        id, student_id, parent_name, parent_email, parent_email_lookup_hash,
        parent_mobile, parent_mobile_lookup_hash, relationship_type,
        adult_verification_status, authority_verification_status,
        invite_token_hash, invite_expires_at, created_at
      ) VALUES (?, ?, '', ?, ?, ?, ?, 'UNSPECIFIED', 'PENDING', 'PENDING', ?, ?, ?)
    `).run(
      pvId,
      studentRow.id,
      cryptoCtx.encryptPII(cleanParentEmail),
      parentEmailHash,
      cryptoCtx.encryptPII(parentMobile),
      parentMobileHash,
      inviteTokenHash,
      inviteExpiresAt,
      now.toISOString()
    );

    writeAuditLog({
      userReference: studentRow.id,
      eventType: 'PARENT_INVITE_ISSUED',
      eventStatus: 'PENDING',
      actorRole: 'student',
      metadata: { parentVerificationId: pvId, expiresInMinutes: 30 },
    });

    return {
      parentVerificationId: pvId,
      inviteExpiresAt,
      maskedParentMobile: maskMobile(parentMobile),
      // Only return raw link directly in non-production sandbox/dev mode for QA testing;
      // in production this token is dispatched out-of-band to the parent's email/SMS channel.
      sandboxPortalInviteToken: signzyService.isProd ? undefined : rawInviteToken,
    };
  }

  /**
   * Exchanges a short-lived, single-use parent invite token for an isolated parent portal session.
   */
  function consumeParentInviteToken(rawInviteToken) {
    const tokenHash = hashToken(rawInviteToken);
    if (!tokenHash) {
      const err = new Error('Invalid parent verification link.');
      err.status = 400;
      throw err;
    }

    const pvRow = db
      .prepare('SELECT * FROM parent_verifications WHERE invite_token_hash = ?')
      .get(tokenHash);

    if (!pvRow) {
      const err = new Error('Parent verification link is invalid or was not found.');
      err.status = 404;
      throw err;
    }

    if (pvRow.invite_consumed_at) {
      writeAuditLog({
        userReference: pvRow.student_id,
        eventType: 'PARENT_INVITE_REPLAY_BLOCKED',
        eventStatus: 'BLOCKED',
        actorRole: 'parent',
      });
      const err = new Error(
        'This single-use parent verification link has already been used. Ask your student to request a fresh link if needed.'
      );
      err.status = 410;
      err.code = 'INVITE_ALREADY_CONSUMED';
      throw err;
    }

    if (new Date(pvRow.invite_expires_at).getTime() <= Date.now()) {
      writeAuditLog({
        userReference: pvRow.student_id,
        eventType: 'PARENT_INVITE_EXPIRED',
        eventStatus: 'EXPIRED',
        actorRole: 'parent',
      });
      const err = new Error('This parent verification link has expired (30-minute security limit).');
      err.status = 410;
      err.code = 'INVITE_EXPIRED';
      throw err;
    }

    const rawParentSessionToken = generateOpaqueToken(32);
    const parentSessionHash = hashToken(rawParentSessionToken);
    const nowIso = new Date().toISOString();
    const sessionExpiresAt = Date.now() + PARENT_SESSION_TTL_MS;

    db.prepare(`
      UPDATE parent_verifications
      SET invite_consumed_at = ?, parent_session_hash = ?, parent_session_expires_at = ?
      WHERE id = ?
    `).run(nowIso, parentSessionHash, sessionExpiresAt, pvRow.id);

    writeAuditLog({
      userReference: pvRow.student_id,
      eventType: 'PARENT_PORTAL_SESSION_ESTABLISHED',
      eventStatus: 'ACTIVE',
      actorRole: 'parent',
      metadata: { parentVerificationId: pvRow.id },
    });

    return {
      parentSessionToken: rawParentSessionToken,
      parentVerificationId: pvRow.id,
    };
  }

  function authenticateParentPortalSession(rawParentSessionToken) {
    const sessionHash = hashToken(rawParentSessionToken);
    if (!sessionHash) return null;
    const pvRow = db
      .prepare('SELECT * FROM parent_verifications WHERE parent_session_hash = ?')
      .get(sessionHash);
    if (!pvRow) return null;
    if (!pvRow.parent_session_expires_at || pvRow.parent_session_expires_at <= Date.now()) {
      return null;
    }
    const studentRow = db.prepare('SELECT * FROM users WHERE id = ?').get(pvRow.student_id);
    if (!studentRow) return null;
    return { pvRow, studentRow };
  }

  /**
   * Parent independently enters their own full name, mobile, email, and relationship to student.
   */
  function submitParentIndependentDetails({
    pvRow,
    studentRow,
    parentName,
    parentMobile,
    parentEmail,
    relationshipType,
  }) {
    const cleanName = String(parentName || '').trim();
    const cleanEmail = normalizeEmail(parentEmail);
    const cleanMobile = normalizeMobile(parentMobile);
    const allowedRelationships = new Set(['MOTHER', 'FATHER', 'COURT_APPOINTED_GUARDIAN']);
    const cleanRel = String(relationshipType || '').toUpperCase();

    if (!cleanName || cleanName.length < 2) {
      const err = new Error("Please enter the parent or legal guardian's full legal name.");
      err.status = 400;
      throw err;
    }
    if (!allowedRelationships.has(cleanRel)) {
      const err = new Error(
        'Relationship must be Mother, Father, or Court-Appointed Legal Guardian.'
      );
      err.status = 400;
      throw err;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const err = new Error('Please enter a valid parent email address.');
      err.status = 400;
      throw err;
    }
    if (!cleanMobile || cleanMobile.length < 10 || cleanMobile.length > 15) {
      const err = new Error('Please enter a valid 10-digit parent mobile number.');
      err.status = 400;
      throw err;
    }

    const emailHash = cryptoCtx.blindIndex('email', cleanEmail);
    const mobileHash = cryptoCtx.blindIndex('mobile', cleanMobile);

    // Re-check anti-self-parenting collision against student's identity
    if (
      emailHash === studentRow.email_lookup_hash ||
      mobileHash === studentRow.mobile_lookup_hash ||
      cleanName.toLowerCase() === studentRow.full_name.trim().toLowerCase()
    ) {
      writeAuditLog({
        userReference: studentRow.id,
        eventType: 'PARENT_REGISTRATION_COLLISION_BLOCKED',
        eventStatus: 'REJECTED',
        actorRole: 'parent',
      });
      const err = new Error(
        'Parent details cannot match the student name, student email, or student mobile number.'
      );
      err.status = 422;
      err.code = 'SELF_PARENT_IDENTITY_FORBIDDEN';
      throw err;
    }

    db.prepare(`
      UPDATE parent_verifications
      SET parent_name = ?, parent_email = ?, parent_email_lookup_hash = ?,
          parent_mobile = ?, parent_mobile_lookup_hash = ?, relationship_type = ?
      WHERE id = ?
    `).run(
      cleanName,
      cryptoCtx.encryptPII(cleanEmail),
      emailHash,
      cryptoCtx.encryptPII(parentMobile),
      mobileHash,
      cleanRel,
      pvRow.id
    );

    writeAuditLog({
      userReference: studentRow.id,
      eventType: 'PARENT_DETAILS_RECORDED',
      eventStatus: 'RECORDED',
      actorRole: 'parent',
      metadata: { relationshipType: cleanRel, parentVerificationId: pvRow.id },
    });

    return db.prepare('SELECT * FROM parent_verifications WHERE id = ?').get(pvRow.id);
  }

  /**
   * Runs Signzy adult (18+) identity check + parental authority adapter for the parent session.
   */
  async function verifyParentAdultAndAuthority({
    pvRow,
    studentRow,
    originBaseUrl,
    sandboxPayload,
    sandboxAuthorityVerified = false,
  }) {
    if (!pvRow.parent_name || pvRow.relationship_type === 'UNSPECIFIED') {
      const err = new Error(
        'Please complete parent contact and relationship details before starting identity verification.'
      );
      err.status = 400;
      throw err;
    }

    if (signzyService.mode === 'live') {
      const sessionRes = await signzyService.initiateVerificationSession({
        subjectType: 'parent',
        expectedName: pvRow.parent_name,
        redirectUrl: `${originBaseUrl}/#/parent-portal`,
        callbackUrl: `${originBaseUrl}/api/webhooks/signzy`,
      });

      db.prepare(`
        UPDATE parent_verifications
        SET provider_reference = ?, adult_verification_status = 'PENDING'
        WHERE id = ?
      `).run(sessionRes.providerReference, pvRow.id);

      writeAuditLog({
        userReference: studentRow.id,
        eventType: 'PARENT_ADULT_VERIFICATION_INITIATED',
        eventStatus: 'PENDING',
        providerReference: sessionRes.providerReference,
        actorRole: 'parent',
      });

      return {
        adultVerificationStatus: 'PENDING',
        authorityVerificationStatus: pvRow.authority_verification_status,
        hostedUrl: sessionRes.hostedUrl,
        isSandboxMock: false,
      };
    }

    // Explicitly labelled non-production Sandbox evaluation
    const providerRef = pvRow.provider_reference || `sgz_sbx_parent_${randomBytes(8).toString('hex')}`;
    const mapped = signzyService.mapSignzyPayloadToMinimalResult(sandboxPayload, pvRow.parent_name);

    let adultStatus = 'VERIFICATION_FAILED';
    if (mapped.internalStatus === INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS) {
      adultStatus = 'VERIFIED_18_PLUS';
    } else if (mapped.internalStatus === INTERNAL_VERIFICATION_STATES.MANUAL_REVIEW) {
      adultStatus = 'MANUAL_REVIEW';
    } else {
      adultStatus = 'VERIFICATION_FAILED';
    }

    const authorityRes =
      adultStatus === 'VERIFIED_18_PLUS'
        ? await signzyService.verifyParentalAuthorityPlaceholder({
            studentId: studentRow.id,
            parentVerificationId: pvRow.id,
            relationshipType: pvRow.relationship_type,
            sandboxSimulateVerified: Boolean(sandboxAuthorityVerified),
          })
        : {
            authorityStatus: 'FAILED',
            dependencyNote: 'Adult 18+ verification must succeed before authority check.',
          };

    db.prepare(`
      UPDATE parent_verifications
      SET adult_verification_status = ?, authority_verification_status = ?, provider_reference = ?
      WHERE id = ?
    `).run(adultStatus, authorityRes.authorityStatus, providerRef, pvRow.id);

    writeAuditLog({
      userReference: studentRow.id,
      eventType: 'PARENT_ADULT_AND_AUTHORITY_EVALUATED',
      eventStatus: `${adultStatus}:${authorityRes.authorityStatus}`,
      providerReference: providerRef,
      actorRole: 'parent',
      metadata: { reasonCode: mapped.reasonCode, sandbox: true },
    });

    evaluateAndApplyAccountActivation(studentRow.id);

    return {
      adultVerificationStatus: adultStatus,
      authorityVerificationStatus: authorityRes.authorityStatus,
      dependencyNote: authorityRes.dependencyNote,
      isSandboxMock: true,
    };
  }

  /**
   * SECTION 4: EXPLICIT, INFORMED PARENTAL CONSENT RECORDING (APPROVE / REJECT)
   */
  function recordParentalConsent({
    pvRow,
    studentRow,
    decision,
    consentVersion,
    acknowledgements,
  }) {
    const cleanDecision = String(decision || '').toUpperCase();
    if (cleanDecision !== 'APPROVED' && cleanDecision !== 'REJECTED') {
      const err = new Error('Decision must be APPROVED or REJECTED.');
      err.status = 400;
      throw err;
    }

    // Prevent duplicate consent transactions on the same parent verification session
    const existingConsent = db
      .prepare('SELECT * FROM parental_consents WHERE parent_verification_id = ?')
      .get(pvRow.id);
    if (existingConsent) {
      const err = new Error(
        `A parental decision (${existingConsent.consent_status}) has already been recorded for this session.`
      );
      err.status = 409;
      err.code = 'DUPLICATE_CONSENT_TRANSACTION';
      throw err;
    }

    // Parent MUST complete Adult 18+ verification before recording consent (never allow OTP/click-only YES)
    if (pvRow.adult_verification_status !== INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS) {
      const err = new Error(
        'Adult (18+) identity verification must succeed before submitting a parental consent decision.'
      );
      err.status = 403;
      err.code = 'PARENT_ADULT_NOT_VERIFIED';
      throw err;
    }

    if (cleanDecision === 'APPROVED') {
      const authorityOk =
        pvRow.authority_verification_status === 'VERIFIED' ||
        (!signzyService.isProd && pvRow.authority_verification_status === 'SANDBOX_VERIFIED');
      if (!authorityOk) {
        const err = new Error(
          'Parental or legal-guardian authority verification has not succeeded yet. Approval cannot be completed.'
        );
        err.status = 403;
        err.code = 'PARENTAL_AUTHORITY_NOT_VERIFIED';
        throw err;
      }

      if (consentVersion !== CURRENT_CONSENT_VERSION) {
        const err = new Error('Consent policy version mismatch. Please refresh and review the current notice.');
        err.status = 400;
        throw err;
      }

      const ack = acknowledgements || {};
      if (
        ack.purposeAndDataCollection !== true ||
        ack.privacyAndSafetyPolicy !== true ||
        ack.retentionAndWithdrawalRights !== true
      ) {
        const err = new Error(
          'Explicit informed consent requires acknowledging all three TeenStack DPDP disclosures before approving.'
        );
        err.status = 400;
        throw err;
      }
    }

    const consentTxId = `csnt_${randomBytes(10).toString('hex')}`;
    const rawWithdrawalToken = cleanDecision === 'APPROVED' ? generateOpaqueToken(32) : null;
    const withdrawalTokenHash = rawWithdrawalToken ? hashToken(rawWithdrawalToken) : null;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO parental_consents (
        id, student_id, parent_verification_id, consent_status, consent_version,
        provider_reference, verification_result, policy_acknowledgements_json,
        withdrawal_token_hash, consent_timestamp, withdrawal_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      consentTxId,
      studentRow.id,
      pvRow.id,
      cleanDecision,
      CURRENT_CONSENT_VERSION,
      pvRow.provider_reference || 'signzy_unreferenced',
      `${pvRow.adult_verification_status}|${pvRow.authority_verification_status}`,
      JSON.stringify(acknowledgements || {}),
      withdrawalTokenHash,
      nowIso
    );

    writeAuditLog({
      userReference: studentRow.id,
      eventType: `PARENTAL_CONSENT_${cleanDecision}`,
      eventStatus: cleanDecision,
      providerReference: consentTxId,
      actorRole: 'parent',
      metadata: {
        parentVerificationId: pvRow.id,
        consentVersion: CURRENT_CONSENT_VERSION,
      },
    });

    const resultingAccountStatus = evaluateAndApplyAccountActivation(studentRow.id);

    return {
      consentTransactionId: consentTxId,
      consentStatus: cleanDecision,
      consentVersion: CURRENT_CONSENT_VERSION,
      consentTimestamp: nowIso,
      studentAccountStatus: resultingAccountStatus,
      withdrawalToken: rawWithdrawalToken,
    };
  }

  /**
   * DPDP Section 6(4) Consent Withdrawal — immediately restricts account processing & schedules deletion.
   */
  function withdrawParentalConsent({ pvRowFromSession, rawWithdrawalToken }) {
    let targetConsent = null;

    if (rawWithdrawalToken) {
      const wHash = hashToken(rawWithdrawalToken);
      targetConsent = db
        .prepare('SELECT * FROM parental_consents WHERE withdrawal_token_hash = ?')
        .get(wHash);
    } else if (pvRowFromSession) {
      targetConsent = db
        .prepare(
          "SELECT * FROM parental_consents WHERE parent_verification_id = ? AND consent_status = 'APPROVED'"
        )
        .get(pvRowFromSession.id);
    }

    if (!targetConsent) {
      const err = new Error('Active parental consent record not found or withdrawal credential invalid.');
      err.status = 404;
      throw err;
    }

    if (targetConsent.consent_status === 'WITHDRAWN') {
      return {
        consentTransactionId: targetConsent.id,
        consentStatus: 'WITHDRAWN',
        withdrawalTimestamp: targetConsent.withdrawal_timestamp,
        studentAccountStatus: 'CONSENT_WITHDRAWN_RESTRICTED',
      };
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE parental_consents
      SET consent_status = 'WITHDRAWN', withdrawal_timestamp = ?
      WHERE id = ?
    `).run(nowIso, targetConsent.id);

    writeAuditLog({
      userReference: targetConsent.student_id,
      eventType: 'PARENTAL_CONSENT_WITHDRAWN',
      eventStatus: 'WITHDRAWN',
      providerReference: targetConsent.id,
      actorRole: 'parent',
    });

    const resultingStatus = evaluateAndApplyAccountActivation(targetConsent.student_id);
    return {
      consentTransactionId: targetConsent.id,
      consentStatus: 'WITHDRAWN',
      withdrawalTimestamp: nowIso,
      studentAccountStatus: resultingStatus,
    };
  }

  /**
   * Builds a safe, sanitized verification overview for the student frontend.
   * NEVER leaks Signzy provider_reference, webhook tokens, or raw parent PII to the student.
   */
  function getPublicStudentVerificationOverview(userRow) {
    const latestAge = db
      .prepare(
        'SELECT verification_status, verified_age_band, hosted_url, expires_at, provider_name, verification_timestamp FROM age_verifications WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1'
      )
      .get(userRow.id);

    const latestParent = db
      .prepare(
        'SELECT id, relationship_type, adult_verification_status, authority_verification_status, invite_expires_at, invite_consumed_at, parent_mobile FROM parent_verifications WHERE student_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1'
      )
      .get(userRow.id);

    const latestConsent = db
      .prepare(
        'SELECT id, consent_status, consent_version, consent_timestamp, withdrawal_timestamp FROM parental_consents WHERE student_id = ? ORDER BY datetime(consent_timestamp) DESC, rowid DESC LIMIT 1'
      )
      .get(userRow.id);

    const decryptedParentMobile = latestParent
      ? cryptoCtx.decryptPII(latestParent.parent_mobile)
      : '';

    return {
      accountStatus: userRow.account_status,
      verifiedAgeBand: userRow.verified_age_band,
      environmentMode: signzyService.mode,
      productionActivationDisabled: signzyService.mode !== 'live',
      ageVerification: latestAge
        ? {
            status: latestAge.verification_status,
            verifiedAgeBand: latestAge.verified_age_band,
            hostedUrl: latestAge.hosted_url || '',
            expiresAt: latestAge.expires_at,
            completedAt: latestAge.verification_timestamp,
            isSandboxMock: latestAge.provider_name === 'signzy_sandbox_mock',
          }
        : null,
      parentVerification: latestParent
        ? {
            initiated: true,
            maskedParentMobile: maskMobile(decryptedParentMobile),
            relationshipType: latestParent.relationship_type,
            inviteConsumed: Boolean(latestParent.invite_consumed_at),
            inviteExpired:
              !latestParent.invite_consumed_at &&
              new Date(latestParent.invite_expires_at).getTime() <= Date.now(),
            adultVerificationStatus: latestParent.adult_verification_status,
            authorityVerificationStatus: latestParent.authority_verification_status,
          }
        : null,
      parentalConsent: latestConsent
        ? {
            consentTransactionId: latestConsent.id,
            status: latestConsent.consent_status,
            consentVersion: latestConsent.consent_version,
            consentTimestamp: latestConsent.consent_timestamp,
            withdrawalTimestamp: latestConsent.withdrawal_timestamp,
          }
        : null,
    };
  }

  return {
    writeAuditLog,
    scheduleDataDeletion,
    evaluateAndApplyAccountActivation,
    registerPendingStudent,
    startStudentAgeVerification,
    finalizeStudentAgeVerification,
    createParentVerificationInvite,
    consumeParentInviteToken,
    authenticateParentPortalSession,
    submitParentIndependentDetails,
    verifyParentAdultAndAuthority,
    recordParentalConsent,
    withdrawParentalConsent,
    getPublicStudentVerificationOverview,
  };
}
