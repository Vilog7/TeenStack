# TeenStack — Signzy Age Verification & Verifiable Parental Consent Deployment Guide

## 1. Architecture Summary

TeenStack implements a zero-trust registration, age-verification, and verifiable parental-consent gate engineered for Indian student safety and alignment with the **Digital Personal Data Protection Act, 2023 (DPDP Act)** and **DPDP Rules, 2025 (Rule 10)**.

### Key Security & Privacy Guarantees
1. **Unverified Registration Isolation**: Every student registration (`POST /api/auth/signup`) creates a temporary record in `PENDING_VERIFICATION` status (`verified_age_band = 'UNVERIFIED'`). Declared date of birth (`declared_dob`) is never trusted for activation.
2. **Server-Side Feature Lock**: Posting, commenting, likes/saves, messaging, and profile onboarding return `HTTP 403 ACCOUNT_NOT_ACTIVE` until `users.account_status === 'ACTIVE'`.
3. **Strict Data Minimization**: Aadhaar numbers (raw or masked), biometric templates, facial vectors, and raw identity-document scans/files are **never** stored in SQLite or written to logs. Upstream Signzy DigiLocker fields beyond full name and date of birth are discarded in memory inside `server/signzy_age_verification.mjs`.
4. **Encryption at Rest & Blind Indexing**: Student and parent emails, mobile numbers, and declared DOBs are encrypted at rest with **AES-256-GCM** (`DATA_ENCRYPTION_KEY`), while deterministic **HMAC-SHA256** blind indexes (`BLIND_INDEX_SECRET`) enforce uniqueness and detect student-vs-parent phone/email collisions without exposing plaintext.
5. **Anti-Self-Parenting & Single-Use Links**:
   - Canonicalized mobile and email blind-index comparisons block students from entering their own phone number or email address as their parent's contact (`HTTP 422 SELF_PARENT_CONTACT_FORBIDDEN`).
   - Parent verification links use 32-byte random single-use tokens (`30-minute` TTL), stored only as SHA-256 hashes (`invite_token_hash`), and exchange into an isolated parent session (`X-Parent-Session`).

---

## 2. Database Schema & Migration

Migration file: `server/migrations/001_signzy_verification_schema.sql` (applied automatically and idempotently on startup by `server/db.mjs`).

Tables created:
- `users` (`id`, `full_name`, `username`, `email`, `email_lookup_hash`, `mobile`, `mobile_lookup_hash`, `password_hash`, `declared_dob`, `verified_age_band`, `account_status`, `role`, `created_at`, plus TeenStack profile columns)
- `age_verifications` (`id`, `user_id`, `provider_name`, `provider_reference`, `verification_status`, `verified_age_band`, `idempotency_key`, `expires_at`, `verification_timestamp`, `created_at`)
- `parent_verifications` (`id`, `student_id`, `parent_name`, `parent_email`, `parent_mobile`, `relationship_type`, `adult_verification_status`, `authority_verification_status`, `provider_reference`, `invite_token_hash`, `invite_expires_at`, `invite_consumed_at`, `created_at`)
- `parental_consents` (`id`, `student_id`, `parent_verification_id`, `consent_status`, `consent_version`, `provider_reference`, `verification_result`, `policy_acknowledgements_json`, `withdrawal_token_hash`, `consent_timestamp`, `withdrawal_timestamp`)
- `verification_audit_logs` (`id`, `user_reference`, `event_type`, `event_status`, `provider_reference`, `actor_role`, `metadata_json`, `timestamp`)
- `webhook_replay_nonces` & `data_deletion_requests`

---

## 3. Signzy APIs Integrated & Official References

Module: `server/signzy_age_verification.mjs`

| Capability | Official Signzy Endpoint | Documentation Reference | Status |
| :--- | :--- | :--- | :--- |
| **Customer / Patron Login** | `POST {SIGNZY_BASE_URL}/api/customers/login` (or `/api/v2/patrons/login`) | Signzy API Reference (`docs.signzy.com` — Authentication) | Implemented (requires account credentials) |
| **DigiLocker Session Initiation** | `POST {SIGNZY_BASE_URL}/api/v2/patrons/{patronId}/identities` (`task: "createUrl"`) | Signzy India Stack — DigiLocker KYC API | Implemented (requires DigiLocker SKU enabled) |
| **DigiLocker Verified Details** | `POST {SIGNZY_BASE_URL}/api/v2/patrons/{patronId}/identities` (`task: "getDetails"`) | Signzy India Stack — DigiLocker KYC API | Implemented with strict in-memory Aadhaar/photo stripping |
| **Webhook Delivery** | `POST /api/webhooks/signzy` (`x-signzy-signature`, `x-signzy-timestamp`) | Signzy Asynchronous Callback / Webhook Spec | Implemented with HMAC-SHA256 + 5-min replay window + nonce deduplication |
| **Parental / Guardian Legal Authority** | *No standalone Signzy Indian parent-child authority registry API confirmed* | Integration placeholder (`verifyParentalAuthorityPlaceholder`) | **Awaiting legal & institutional authority adapter** (`PARENTAL_AUTHORITY_WORKFLOW_APPROVED=false`) |

---

## 4. Features Awaiting Signzy Provisioning & Legal Review Before Go-Live

1. **Signzy Account Provisioning**: Obtain `SIGNZY_USERNAME`, `SIGNZY_PASSWORD`, `SIGNZY_PATRON_ID`, and `SIGNZY_WEBHOOK_SECRET` from Signzy, and confirm contractual permission to invoke DigiLocker age/identity verification for minors (13–17) and adults (18+).
2. **Data Processing Agreement (DPA)**: Execute a DPDP-compliant contract defining TeenStack as **Data Fiduciary** and Signzy as **Data Processor**, confirming zero unauthorized retention of minor identity artifacts.
3. **Parental Authority Verification Adapter**: Because verifying an adult is `18+` does **not** prove they are the child's lawful parent or court-appointed guardian, legal counsel must approve the authority mechanism (e.g., DigiLocker family/birth-record verification, verified school institutional roster cross-check, or court-guardianship review) before setting `PARENTAL_AUTHORITY_WORKFLOW_APPROVED=true` in production.
4. **Out-of-Band Email/SMS Gateway**: Bind transactional email/SMS delivery inside `createParentVerificationInvite` so single-use parent invite links are delivered exclusively to the parent's channel in production (`sandboxPortalInviteToken` is automatically omitted when `NODE_ENV=production`).
5. **TLS Reverse Proxy**: Terminate HTTPS (`TLS 1.2+`) at Nginx/Cloudflare/ALB forwarding `X-Forwarded-Proto: https` to the Node server (`NODE_ENV=production` rejects plain HTTP API traffic with `403`).

---

## 5. Testing Instructions

Run the automated Phase 7 security & integration test suite (covers pending lockouts, AES-256-GCM encryption at rest, under-13 block, tampered ID, timeout, 18+ webhook + replay defense, 13–17 anti-self-parenting collision, single-use parent token, underage parent impostor, missing authority block, explicit consent approval, consent rejection, consent withdrawal, and production sandbox lock):

```powershell
node --no-warnings --test server/verification.test.mjs
```

Start the local server in clearly labelled non-production sandbox mode:

```powershell
node --no-warnings server/index.mjs
```
