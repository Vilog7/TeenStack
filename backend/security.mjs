import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const FORBIDDEN_LOG_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'signuppassword',
  'loginpassword',
  'aadhaar',
  'aadhaarnumber',
  'maskedaaadhaarnumber',
  'masked_aadhaar',
  'uid',
  'otp',
  'biometric',
  'biometrics',
  'documentimage',
  'document_image',
  'frontimage',
  'backimage',
  'selfie',
  'photo',
  'digilockerfiles',
  'xml',
  'accesstoken',
  'access_token',
  'authorization',
  'token',
  'invitetoken',
  'withdrawaltoken',
]);

/**
 * Resolves the 32-byte AES-256-GCM key and HMAC blind-index secret from server env.
 * In production, missing secrets throw immediately so unencrypted or weakly keyed storage is impossible.
 */
export function createCryptoContext(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const rawEncKey = env.DATA_ENCRYPTION_KEY || '';
  const rawBlindSecret = env.BLIND_INDEX_SECRET || '';

  if (isProd && (!rawEncKey || rawEncKey.length < 32)) {
    throw new Error(
      'CRITICAL SECURITY ERROR: DATA_ENCRYPTION_KEY (>= 32 chars/hex) must be configured in production.'
    );
  }
  if (isProd && (!rawBlindSecret || rawBlindSecret.length < 32)) {
    throw new Error(
      'CRITICAL SECURITY ERROR: BLIND_INDEX_SECRET (>= 32 chars) must be configured in production.'
    );
  }

  const keyBuf = rawEncKey
    ? createHash('sha256').update(rawEncKey).digest()
    : createHash('sha256').update('teenstack-dev-only-aes256-key-do-not-use-in-prod').digest();

  const blindSecret =
    rawBlindSecret || 'teenstack-dev-only-blind-index-hmac-secret-not-for-prod';

  function encryptPII(plaintext) {
    const str = String(plaintext ?? '');
    if (!str) return '';
    if (str.startsWith('enc:v1:')) return str;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  function decryptPII(ciphertext) {
    const str = String(ciphertext ?? '');
    if (!str) return '';
    if (!str.startsWith('enc:v1:')) return str; // Backward-compatible read for pre-migration demo row
    const parts = str.split(':');
    if (parts.length !== 5) return '';
    try {
      const iv = Buffer.from(parts[2], 'base64');
      const authTag = Buffer.from(parts[3], 'base64');
      const data = Buffer.from(parts[4], 'base64');
      const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  function blindIndex(domain, normalizedValue) {
    const clean = String(normalizedValue ?? '').trim().toLowerCase();
    if (!clean) return null;
    return createHmac('sha256', blindSecret).update(`${domain}:${clean}`).digest('hex');
  }

  return {
    isProd,
    encryptPII,
    decryptPII,
    blindIndex,
  };
}

export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Canonicalizes Indian & international phone numbers so students cannot bypass parent-phone
 * uniqueness checks by toggling '+91', '0', spaces, or dashes (e.g. '+91 98765-43210' === '9876543210').
 */
export function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function maskMobile(raw) {
  const plain = String(raw ?? '').trim();
  if (!plain) return '';
  const digits = plain.replace(/\D+/g, '');
  if (digits.length < 4) return '••••';
  return `••••••${digits.slice(-4)}`;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = scryptSync(String(password), salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(rawToken) {
  if (!rawToken) return null;
  return createHash('sha256').update(String(rawToken)).digest('hex');
}

export function constantTimeHexEquals(hexA, hexB) {
  if (!hexA || !hexB || typeof hexA !== 'string' || typeof hexB !== 'string') return false;
  try {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Recursively strips any forbidden credential, Aadhaar, document image, biometric, or OTP keys
 * so audit logs and console logs never leak sensitive material.
 */
export function redactSensitiveFields(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    const s = String(obj);
    // Redact 12-digit Aadhaar-like sequences proactively
    return s.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED_ID]');
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item));
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    const normalizedKey = k.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (FORBIDDEN_LOG_KEYS.has(normalizedKey)) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = redactSensitiveFields(v);
    }
  }
  return clean;
}

/**
 * Sliding-window in-memory rate limiter keyed by IP + action bucket.
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  check(key, maxRequests, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (this.buckets.get(key) || []).filter((t) => t > cutoff);
    if (timestamps.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return { allowed: true, retryAfterSec: 0 };
  }
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self';",
};
