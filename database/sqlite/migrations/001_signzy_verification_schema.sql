-- TEENSTACK — SIGNZY AGE VERIFICATION & PARENTAL CONSENT SCHEMA
-- Migration: 001_signzy_verification_schema.sql
-- Notes:
-- 1. Raw Aadhaar numbers, identity-document images, OTPs, and biometric templates MUST NEVER be stored in any column.
-- 2. Sensitive PII fields (email, mobile, declared_dob, parent_email, parent_mobile) are encrypted at rest with AES-256-GCM.
-- 3. Deterministic HMAC-SHA256 blind-index columns (*_lookup_hash) enforce uniqueness and detect student-parent phone/email collisions without exposing plaintext.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  email_lookup_hash TEXT UNIQUE,
  mobile TEXT NOT NULL DEFAULT '',
  mobile_lookup_hash TEXT,
  password_hash TEXT NOT NULL,
  declared_dob TEXT NOT NULL DEFAULT '',
  verified_age_band TEXT NOT NULL DEFAULT 'UNVERIFIED',
  account_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  role TEXT NOT NULL DEFAULT 'student',
  phone TEXT DEFAULT '',
  dob TEXT DEFAULT '',
  age INTEGER DEFAULT 16,
  marketing_opt_in INTEGER DEFAULT 0,
  onboarding_step INTEGER DEFAULT 1,
  onboarding_completed INTEGER DEFAULT 0,
  profile_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_mobile_lookup ON users(mobile_lookup_hash);

CREATE TABLE IF NOT EXISTS age_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_reference TEXT UNIQUE NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  verified_age_band TEXT DEFAULT 'UNVERIFIED',
  method_used TEXT NOT NULL DEFAULT 'digilocker',
  idempotency_key TEXT UNIQUE,
  hosted_url TEXT DEFAULT '',
  expires_at TEXT NOT NULL,
  verification_timestamp TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_age_verifications_user_id ON age_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_age_verifications_status ON age_verifications(verification_status);

CREATE TABLE IF NOT EXISTS parent_verifications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_name TEXT NOT NULL DEFAULT '',
  parent_email TEXT NOT NULL,
  parent_email_lookup_hash TEXT NOT NULL,
  parent_mobile TEXT NOT NULL DEFAULT '',
  parent_mobile_lookup_hash TEXT DEFAULT '',
  relationship_type TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  adult_verification_status TEXT NOT NULL DEFAULT 'PENDING',
  authority_verification_status TEXT NOT NULL DEFAULT 'PENDING',
  provider_reference TEXT,
  invite_token_hash TEXT UNIQUE,
  invite_expires_at TEXT NOT NULL,
  invite_consumed_at TEXT,
  parent_session_hash TEXT UNIQUE,
  parent_session_expires_at INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parent_verifications_student_id ON parent_verifications(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_verifications_invite_hash ON parent_verifications(invite_token_hash);
CREATE INDEX IF NOT EXISTS idx_parent_verifications_session_hash ON parent_verifications(parent_session_hash);

CREATE TABLE IF NOT EXISTS parental_consents (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_verification_id TEXT NOT NULL REFERENCES parent_verifications(id) ON DELETE CASCADE,
  consent_status TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  verification_result TEXT NOT NULL,
  policy_acknowledgements_json TEXT NOT NULL DEFAULT '{}',
  withdrawal_token_hash TEXT UNIQUE,
  consent_timestamp TEXT NOT NULL,
  withdrawal_timestamp TEXT
);

CREATE INDEX IF NOT EXISTS idx_parental_consents_student_id ON parental_consents(student_id);
CREATE INDEX IF NOT EXISTS idx_parental_consents_parent_verif ON parental_consents(parent_verification_id);

CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id TEXT PRIMARY KEY,
  user_reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL,
  provider_reference TEXT DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT 'system',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_ref ON verification_audit_logs(user_reference);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON verification_audit_logs(timestamp);

CREATE TABLE IF NOT EXISTS webhook_replay_nonces (
  nonce_key TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  scheduled_purge_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
