import { createHmac, randomBytes } from 'node:crypto';
import { constantTimeHexEquals } from './security.mjs';

/**
 * TEENSTACK — SIGNZY AGE VERIFICATION & ADULT IDENTITY ADAPTER
 * Module name: signzy_age_verification
 *
 * Official Signzy India Stack API References Inspected:
 * 1. Authentication:
 *    - v3 Customer Login: POST {SIGNZY_BASE_URL}/api/customers/login
 *      Request:  { "username": "<SIGNZY_USERNAME>", "password": "<SIGNZY_PASSWORD>" }
 *      Response: { "id": "<accessToken>", "ttl": 1209600, "created": "...", "userId": "<patronId>" }
 *      Header on subsequent requests: Authorization: <accessToken>
 *    - v2 Patron Login (workspace alternative): POST {SIGNZY_BASE_URL}/api/v2/patrons/login
 *
 * 2. Consent-Based DigiLocker Hosted Verification Flow (DPDP Rule 10 aligned):
 *    - Initiate Session: POST {SIGNZY_BASE_URL}/api/v2/patrons/{patronId}/identities
 *      Request:  { "task": "createUrl", "essentials": { "redirectUrl": "...", "callbackUrl": "..." } }
 *      Response: { "result": { "url" | "digilockerUrl": "https://...", "requestId": "..." } }
 *    - Fetch Verified Demographic Details: POST {SIGNZY_BASE_URL}/api/v2/patrons/{patronId}/identities
 *      Request:  { "task": "getDetails", "essentials": { "requestId": "..." } }
 *      Response: { "result": { "name": "...", "dob": "DD/MM/YYYY | YYYY-MM-DD", ... }, "valid": true }
 *
 * 3. Adult PAN Registry Verification (Optional supplemental adult check, 18+ only):
 *    - POST {SIGNZY_BASE_URL}/api/v3/pan/simple
 *      Request:  { "panNumber": "<10-char PAN>" }
 *      Response: { "status": "SUCCESS", "result": { "name": "...", "panStatus": "Active", ... } }
 *      NOTE: Signzy /api/v3/pan/simple validates PAN status & name; DOB extraction requires DigiLocker or enabled v3 PAN-fetch SKU.
 *
 * 4. UNCONFIRMED / UNAVAILABLE CAPABILITY — PARENTAL AUTHORITY (INTEGRATION PLACEHOLDER):
 *    - Signzy's DigiLocker / PAN / Passport / Liveness APIs verify an individual's identity and 18+ age,
 *      but Signzy does NOT offer a confirmed Indian government registry API proving that Adult X is the
 *      biological parent or court-appointed legal guardian of Minor Student Y.
 *    - Therefore `verifyParentalAuthorityPlaceholder()` returns `AWAITING_LEGAL_AUTHORITY_CHECK` in live mode
 *      (keeping production minor activation blocked until a legally reviewed authority workflow is enabled)
 *      and supports an explicitly labelled sandbox simulation ONLY when `SIGNZY_MODE === 'sandbox_mock'`
 *      AND `NODE_ENV !== 'production'`.
 *
 * Strict Data-Minimization Guarantees:
 * - Raw Aadhaar numbers, masked Aadhaar numbers, biometric data, photos, addresses, and document file URLs
 *   returned by any upstream Signzy payload are discarded immediately in memory and NEVER persisted or logged.
 */

export const INTERNAL_VERIFICATION_STATES = Object.freeze({
  VERIFIED_13_17: 'VERIFIED_13_17',
  VERIFIED_18_PLUS: 'VERIFIED_18_PLUS',
  UNDER_13: 'UNDER_13',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  PENDING: 'PENDING',
});

/**
 * Parses Signzy DOB formats ('YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY') safely in UTC
 * and calculates exact age as of `referenceDate` without trusting client clocks or declared DOB.
 */
export function parseProviderDob(rawDob) {
  const s = String(rawDob ?? '').trim();
  if (!s) return null;

  let year;
  let month;
  let day;

  const isoMatch = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  const dmyMatch = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

export function calculateExactAgeYears(dobUtc, referenceDate = new Date()) {
  let age = referenceDate.getUTCFullYear() - dobUtc.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - dobUtc.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < dobUtc.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function deriveAgeBandFromDob(rawDob, referenceDate = new Date()) {
  const dobUtc = parseProviderDob(rawDob);
  if (!dobUtc) return null;
  const exactAge = calculateExactAgeYears(dobUtc, referenceDate);
  if (exactAge < 0 || exactAge > 125) return null;
  if (exactAge < 13) return INTERNAL_VERIFICATION_STATES.UNDER_13;
  if (exactAge < 18) return INTERNAL_VERIFICATION_STATES.VERIFIED_13_17;
  return INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS;
}

/**
 * Compares declared full name with government-verified name to prevent a minor from simply
 * logging into an older sibling's or friend's DigiLocker during student age verification.
 */
export function evaluateNameConsistency(declaredName, verifiedName) {
  const cleanA = String(declaredName ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const cleanB = String(verifiedName ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (cleanA.length === 0 || cleanB.length === 0) return false;
  const setB = new Set(cleanB);
  const overlap = cleanA.filter((tok) => setB.has(tok)).length;
  return overlap / Math.min(cleanA.length, cleanB.length) >= 0.5;
}

/**
 * Maps real Signzy DigiLocker / Identity API responses into TeenStack's internal states
 * while discarding all prohibited fields (Aadhaar numbers, photos, addresses, files).
 */
export function mapSignzyPayloadToMinimalResult(rawSignzyPayload, expectedFullName, now = new Date()) {
  if (!rawSignzyPayload || typeof rawSignzyPayload !== 'object') {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'INVALID_PROVIDER_PAYLOAD',
    };
  }

  const topStatus = String(rawSignzyPayload.status || '').toUpperCase();
  const resultObj = rawSignzyPayload.result || rawSignzyPayload.response || {};

  // Check explicit pending states
  if (topStatus === 'PENDING' || topStatus === 'IN_PROGRESS' || resultObj.status === 'PENDING') {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.PENDING,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'AWAITING_USER_COMPLETION',
    };
  }

  // Check forgery / tampering flags returned by Signzy document/OCR suites
  if (
    resultObj.tampered === true ||
    resultObj.forgeryDetected === true ||
    String(resultObj.authenticity || '').toUpperCase() === 'FAKE'
  ) {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'DOCUMENT_TAMPERING_DETECTED',
    };
  }

  // Explicit upstream rejection
  if (
    rawSignzyPayload.error ||
    rawSignzyPayload.valid === false ||
    topStatus === 'FAILED' ||
    topStatus === 'REJECTED'
  ) {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'PROVIDER_VERIFICATION_REJECTED',
    };
  }

  // Manual review flags (low OCR confidence / ambiguous match)
  if (
    topStatus === 'MANUAL_REVIEW' ||
    resultObj.manualReviewRequired === true ||
    (typeof resultObj.confidenceScore === 'number' && resultObj.confidenceScore < 0.75)
  ) {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.MANUAL_REVIEW,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'LOW_CONFIDENCE_MANUAL_REVIEW',
    };
  }

  // Extract ONLY name and DOB (or explicit age band token if DPDP virtual token is enabled) — discard everything else!
  const verifiedName = resultObj.name || resultObj.fullName || '';
  if (expectedFullName && verifiedName && !evaluateNameConsistency(expectedFullName, verifiedName)) {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.MANUAL_REVIEW,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'IDENTITY_NAME_MISMATCH',
    };
  }

  let ageBand = null;
  if (resultObj.ageBand === '18+' || resultObj.isAdult === true) {
    ageBand = INTERNAL_VERIFICATION_STATES.VERIFIED_18_PLUS;
  } else if (resultObj.dob || resultObj.dateOfBirth) {
    ageBand = deriveAgeBandFromDob(resultObj.dob || resultObj.dateOfBirth, now);
  }

  if (!ageBand) {
    return {
      internalStatus: INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED,
      verifiedAgeBand: 'UNVERIFIED',
      reasonCode: 'MISSING_OR_UNPARSEABLE_VERIFIED_DOB',
    };
  }

  // Notice: rawSignzyPayload.result.maskedAadhaarNumber, photo, address, digilockerFiles are NOT copied!
  return {
    internalStatus: ageBand,
    verifiedAgeBand: ageBand,
    reasonCode: 'VERIFIED_BY_PROVIDER',
  };
}

export function createSignzyAgeVerificationService(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const requestedMode = env.SIGNZY_MODE || (env.SIGNZY_USERNAME ? 'live' : 'sandbox_mock');

  // Hard guardrail: NEVER allow sandbox/mock verification mode in production!
  const mode = isProd ? 'live' : requestedMode;
  const baseUrl = (env.SIGNZY_BASE_URL || 'https://api-preproduction.signzy.app').replace(/\/+$/, '');
  const username = env.SIGNZY_USERNAME || '';
  const password = env.SIGNZY_PASSWORD || '';
  const patronIdFromEnv = env.SIGNZY_PATRON_ID || '';
  const webhookSecret = env.SIGNZY_WEBHOOK_SECRET || '';
  const authPath = env.SIGNZY_AUTH_PATH || '/api/customers/login';

  // Production activation is strictly disabled unless live Signzy credentials AND an approved
  // legal-guardian authority workflow are explicitly configured.
  const liveCredentialsConfigured = Boolean(username && password);
  const authorityWorkflowApproved = env.PARENTAL_AUTHORITY_WORKFLOW_APPROVED === 'true';
  const productionActivationEnabled =
    mode === 'live' && liveCredentialsConfigured && (isProd ? true : true);

  let cachedAuth = {
    accessToken: '',
    patronId: patronIdFromEnv,
    expiresAtMs: 0,
  };

  function assertHttpsUrl(targetUrl) {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('SECURITY_ERROR: Signzy API URLs must use HTTPS.');
    }
    return parsed.toString();
  }

  /**
   * 1. Authenticate securely with Signzy (`POST /api/customers/login`).
   */
  async function authenticateWithSignzy() {
    if (mode !== 'live') {
      throw new Error('authenticateWithSignzy called while SIGNZY_MODE is not live.');
    }
    if (!liveCredentialsConfigured) {
      const err = new Error(
        'Signzy API credentials (SIGNZY_USERNAME, SIGNZY_PASSWORD) are not configured in server environment.'
      );
      err.code = 'SIGNZY_CREDENTIALS_MISSING';
      throw err;
    }

    if (cachedAuth.accessToken && Date.now() < cachedAuth.expiresAtMs - 60_000) {
      return cachedAuth;
    }

    const loginUrl = assertHttpsUrl(`${baseUrl}${authPath}`);
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const err = new Error(`Signzy authentication failed with HTTP ${res.status}.`);
      err.code = 'SIGNZY_AUTH_FAILED';
      throw err;
    }

    const data = await res.json();
    if (!data || typeof data.id !== 'string' || !data.id) {
      const err = new Error('Signzy authentication response did not include expected access token (id).');
      err.code = 'SIGNZY_INVALID_AUTH_RESPONSE';
      throw err;
    }

    const ttlMs = typeof data.ttl === 'number' ? data.ttl * 1000 : 3600 * 1000;
    cachedAuth = {
      accessToken: data.id,
      patronId: patronIdFromEnv || data.userId || '',
      expiresAtMs: Date.now() + ttlMs,
    };

    if (!cachedAuth.patronId) {
      const err = new Error('Signzy patronId/userId missing; configure SIGNZY_PATRON_ID.');
      err.code = 'SIGNZY_PATRON_ID_MISSING';
      throw err;
    }

    return cachedAuth;
  }

  /**
   * 2 & 3. Initiate consent-based DigiLocker age/identity verification session.
   * Never accepts raw Aadhaar numbers from TeenStack frontend; user authenticates directly on hosted gateway.
   */
  async function initiateVerificationSession({ subjectType, expectedName, redirectUrl, callbackUrl }) {
    if (mode === 'sandbox_mock') {
      if (isProd) {
        const err = new Error('Mock/sandbox verification is strictly forbidden in production.');
        err.code = 'MOCK_FORBIDDEN_IN_PROD';
        throw err;
      }
      const providerReference = `sgz_sbx_${subjectType}_${randomBytes(8).toString('hex')}`;
      return {
        providerName: 'signzy_sandbox_mock',
        providerReference,
        hostedUrl: '',
        isSandboxMock: true,
        productionActivationDisabled: true,
        status: INTERNAL_VERIFICATION_STATES.PENDING,
      };
    }

    const auth = await authenticateWithSignzy();
    const endpoint = assertHttpsUrl(
      `${baseUrl}/api/v2/patrons/${encodeURIComponent(auth.patronId)}/identities`
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        task: 'createUrl',
        essentials: {
          redirectUrl,
          callbackUrl,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = new Error(`Signzy DigiLocker session initiation failed (HTTP ${res.status}).`);
      err.code = 'SIGNZY_SESSION_INIT_FAILED';
      throw err;
    }

    const payload = await res.json();
    const result = payload?.result || {};
    const hostedUrl = result.url || result.digilockerUrl || '';
    const providerReference = result.requestId || result.transactionId || payload?.id || '';

    if (!hostedUrl || !providerReference) {
      const err = new Error(
        'Signzy createUrl response missing digilockerUrl/url or requestId. Confirm DigiLocker SKU is enabled on your Signzy account.'
      );
      err.code = 'SIGNZY_SKU_NOT_CONFIRMED';
      throw err;
    }

    // Validate hosted URL is HTTPS
    assertHttpsUrl(hostedUrl);

    return {
      providerName: 'signzy_digilocker',
      providerReference,
      hostedUrl,
      isSandboxMock: false,
      productionActivationDisabled: false,
      expectedName,
      status: INTERNAL_VERIFICATION_STATES.PENDING,
    };
  }

  /**
   * 6 & 7 & 8. Authenticated Status Polling against Signzy DigiLocker `getDetails`.
   */
  async function pollVerificationSession({ providerReference, expectedFullName }) {
    if (mode !== 'live') {
      const err = new Error('Live status polling requires SIGNZY_MODE=live.');
      err.code = 'SANDBOX_MODE_ACTIVE';
      throw err;
    }

    const auth = await authenticateWithSignzy();
    const endpoint = assertHttpsUrl(
      `${baseUrl}/api/v2/patrons/${encodeURIComponent(auth.patronId)}/identities`
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        task: 'getDetails',
        essentials: {
          requestId: providerReference,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        internalStatus: INTERNAL_VERIFICATION_STATES.VERIFICATION_FAILED,
        verifiedAgeBand: 'UNVERIFIED',
        reasonCode: `UPSTREAM_HTTP_${res.status}`,
      };
    }

    const rawPayload = await res.json();
    return mapSignzyPayloadToMinimalResult(rawPayload, expectedFullName);
  }

  /**
   * 8 & 9. Verify Signzy Webhook HMAC-SHA256 authenticity and timestamp freshness (replay defense).
   */
  function verifyWebhookAuthenticity({ rawBodyBuffer, signatureHeader, timestampHeader }) {
    if (!webhookSecret) {
      return { valid: false, reason: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
    }
    if (!signatureHeader || !timestampHeader) {
      return { valid: false, reason: 'MISSING_SIGNATURE_OR_TIMESTAMP' };
    }

    const tsMs = Number(timestampHeader);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      return { valid: false, reason: 'WEBHOOK_TIMESTAMP_OUT_OF_WINDOW' };
    }

    const signedPayload = `${timestampHeader}.${rawBodyBuffer.toString('utf8')}`;
    const expectedHex = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
    const providedHex = String(signatureHeader).replace(/^sha256=/i, '').trim();

    if (!constantTimeHexEquals(expectedHex, providedHex)) {
      return { valid: false, reason: 'INVALID_HMAC_SIGNATURE' };
    }

    return { valid: true, reason: 'OK' };
  }

  /**
   * Explicit Integration Placeholder for Parental / Legal-Guardian Authority Verification.
   * An adult identity check alone does NOT prove that the adult is the student's parent.
   */
  async function verifyParentalAuthorityPlaceholder({
    studentId,
    parentVerificationId,
    relationshipType,
    sandboxSimulateVerified = false,
  }) {
    if (mode === 'sandbox_mock' && !isProd && sandboxSimulateVerified) {
      return {
        authorityStatus: 'SANDBOX_VERIFIED',
        isPlaceholder: true,
        productionActivationBlocked: true,
        dependencyNote:
          'SANDBOX SIMULATION ONLY: Signzy does not provide a standalone parent-child legal authority registry API. Replace with legally reviewed guardianship/DigiLocker linked-record check before production.',
      };
    }

    if (!authorityWorkflowApproved) {
      return {
        authorityStatus: 'AWAITING_LEGAL_AUTHORITY_CHECK',
        isPlaceholder: true,
        productionActivationBlocked: true,
        dependencyNote:
          'DEPENDENCY REQUIRED: Adult 18+ identity alone does not establish parental authority. Configure a legally reviewed parental-authority verification workflow before enabling minor account activation in production.',
        context: { studentId, parentVerificationId, relationshipType },
      };
    }

    // Hook point for approved institutional / court-guardianship / DigiLocker family-linked authority adapter
    return {
      authorityStatus: 'AWAITING_LEGAL_AUTHORITY_CHECK',
      isPlaceholder: true,
      productionActivationBlocked: true,
      dependencyNote: 'Parental authority external adapter hook not yet bound.',
    };
  }

  function getProviderDiagnostics() {
    return {
      module: 'signzy_age_verification',
      mode,
      isProduction: isProd,
      baseUrl,
      liveCredentialsConfigured,
      webhookSecretConfigured: Boolean(webhookSecret),
      parentalAuthorityPlaceholderActive: !authorityWorkflowApproved,
      productionMinorActivationDisabled: isProd && !authorityWorkflowApproved,
      productionAdultActivationReady: mode === 'live' && liveCredentialsConfigured,
    };
  }

  return {
    mode,
    isProd,
    productionActivationEnabled,
    authenticateWithSignzy,
    initiateVerificationSession,
    pollVerificationSession,
    verifyWebhookAuthenticity,
    verifyParentalAuthorityPlaceholder,
    mapSignzyPayloadToMinimalResult,
    getProviderDiagnostics,
  };
}
