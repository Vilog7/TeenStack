-- =============================================================================
-- TEENSTACK — COMPLETE PRODUCTION POSTGRESQL DATABASE SCHEMA (38 TABLES)
-- File: database/postgresql/001_teenstack_complete_schema.sql
-- Target: PostgreSQL 15 / 16 / 17+
--
-- Stores every single piece of platform information in normalized relational
-- PostgreSQL tables with strict foreign keys, ENUM types, JSONB, TEXT[] arrays,
-- GIN indexes, and DPDP Act 2023 / Rules 2025 privacy guardrails:
--   - Encrypted PII at rest (AES-256-GCM ciphertext in email, mobile, declared_dob)
--   - Deterministic HMAC-SHA256 blind indexes (*_lookup_hash)
--   - Zero columns for Aadhaar numbers, identity document scans, OTPs, or biometrics
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CUSTOM POSTGRESQL ENUMERATED TYPES (Idempotent Creation)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE verified_age_band_enum AS ENUM (
    'UNVERIFIED', 'UNDER_13', 'VERIFIED_13_17', 'VERIFIED_18_PLUS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status_enum AS ENUM (
    'PENDING_VERIFICATION',
    'AGE_VERIFIED_AWAITING_PARENT',
    'ACTIVE',
    'REJECTED_UNDER_13',
    'PARENT_REJECTED',
    'VERIFICATION_FAILED',
    'MANUAL_REVIEW',
    'CONSENT_WITHDRAWN_RESTRICTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('student', 'parent', 'compliance_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status_enum AS ENUM (
    'PENDING', 'VERIFIED_13_17', 'VERIFIED_18_PLUS', 'UNDER_13', 'VERIFICATION_FAILED', 'MANUAL_REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE parent_relationship_enum AS ENUM (
    'UNSPECIFIED', 'MOTHER', 'FATHER', 'COURT_APPOINTED_GUARDIAN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE consent_status_enum AS ENUM ('APPROVED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE profile_visibility_enum AS ENUM ('students_only', 'connections', 'public_mentors');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dm_permission_enum AS ENUM ('connections_only', 'verified_students');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_category_enum AS ENUM (
    'story', 'post', 'reel', 'project', 'achievement', 'tutorial', 'video', 'certificate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_type_enum AS ENUM (
    'none', 'landscape_illustration', 'code_preview', 'certificate_card', 'video_showcase', 'image'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_type_enum AS ENUM (
    'Hackathon', 'Competition', 'Internship', 'Workshop', 'Student Bounty'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_mode_enum AS ENUM ('Remote', 'Hybrid', 'In-Person');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE course_level_enum AS ENUM ('Beginner', 'Intermediate', 'Advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_target_enum AS ENUM ('post', 'comment', 'message', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status_enum AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deletion_status_enum AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2. IDENTITY, NORMALIZED STUDENT PROFILE, SKILLS, SUBJECTS & PRIVACY TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username VARCHAR(24) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,24}$'),
  email TEXT NOT NULL,
  email_lookup_hash CHAR(64) UNIQUE,
  mobile TEXT NOT NULL DEFAULT '',
  mobile_lookup_hash CHAR(64),
  password_hash TEXT NOT NULL,
  declared_dob TEXT NOT NULL DEFAULT '',
  verified_age_band verified_age_band_enum NOT NULL DEFAULT 'UNVERIFIED',
  account_status account_status_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
  role user_role_enum NOT NULL DEFAULT 'student',
  age SMALLINT NOT NULL DEFAULT 16 CHECK (age BETWEEN 5 AND 100),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step SMALLINT NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 5),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_pg_users_mobile_lookup ON users(mobile_lookup_hash);
CREATE INDEX IF NOT EXISTS idx_pg_users_profile_gin ON users USING GIN (profile_json);

-- 1:1 Normalized Student Setup & Profile Details
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  education_level TEXT NOT NULL DEFAULT 'High School Student',
  school TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_preset TEXT NOT NULL DEFAULT 'violet-coder',
  portfolio_url TEXT NOT NULL DEFAULT '',
  experience_years SMALLINT NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 20),
  projects_completed INTEGER NOT NULL DEFAULT 0 CHECK (projects_completed >= 0),
  rate_per_project TEXT NOT NULL DEFAULT '',
  target_clients TEXT NOT NULL DEFAULT '',
  career_aim TEXT NOT NULL DEFAULT '',
  desired_field TEXT NOT NULL DEFAULT '',
  career_interests TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  base_mutuals INTEGER NOT NULL DEFAULT 4,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1:1 Normalized Teen Privacy Shield Settings
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_visibility profile_visibility_enum NOT NULL DEFAULT 'students_only',
  dm_permission dm_permission_enum NOT NULL DEFAULT 'connections_only',
  hide_contact_info BOOLEAN NOT NULL DEFAULT TRUE,
  guardian_email TEXT NOT NULL DEFAULT '',
  content_safety_filter BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalized Interested Subjects (Selected on Onboarding Page 1)
CREATE TABLE IF NOT EXISTS user_subjects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_name)
);

CREATE INDEX IF NOT EXISTS idx_pg_user_subjects_name ON user_subjects(LOWER(subject_name));

-- Normalized Student Skills (Active max-10 skills + skills_to_learn)
CREATE TABLE IF NOT EXISTS user_skills (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_kind TEXT NOT NULL DEFAULT 'active' CHECK (skill_kind IN ('active', 'learning')),
  experience_years SMALLINT NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, skill_name, skill_kind)
);

CREATE INDEX IF NOT EXISTS idx_pg_user_skills_lookup ON user_skills(LOWER(skill_name), skill_kind);

-- Normalized #SkillTag Badges (Claimed on Setup Profile Page 2)
CREATE TABLE IF NOT EXISTS user_skill_tags (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_label TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_label)
);

-- -----------------------------------------------------------------------------
-- 3. SESSIONS & CRYPTOGRAPHIC PASSWORD RESET TOKENS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role_enum NOT NULL DEFAULT 'student',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_pwd_reset_user ON password_reset_tokens(user_id);

-- -----------------------------------------------------------------------------
-- 4. SIGNZY AGE VERIFICATION, PARENTAL CONSENT & DPDP COMPLIANCE TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS age_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_reference TEXT NOT NULL UNIQUE,
  verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
  verified_age_band verified_age_band_enum NOT NULL DEFAULT 'UNVERIFIED',
  method_used TEXT NOT NULL DEFAULT 'digilocker',
  idempotency_key TEXT UNIQUE,
  hosted_url TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  verification_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_age_verifications_user ON age_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_age_verifications_status ON age_verifications(verification_status);

CREATE TABLE IF NOT EXISTS parent_verifications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_name TEXT NOT NULL DEFAULT '',
  parent_email TEXT NOT NULL,
  parent_email_lookup_hash CHAR(64) NOT NULL,
  parent_mobile TEXT NOT NULL DEFAULT '',
  parent_mobile_lookup_hash CHAR(64) NOT NULL DEFAULT '',
  relationship_type parent_relationship_enum NOT NULL DEFAULT 'UNSPECIFIED',
  adult_verification_status TEXT NOT NULL DEFAULT 'PENDING',
  authority_verification_status TEXT NOT NULL DEFAULT 'PENDING',
  provider_reference TEXT,
  invite_token_hash CHAR(64) UNIQUE,
  invite_expires_at TIMESTAMPTZ NOT NULL,
  invite_consumed_at TIMESTAMPTZ,
  parent_session_hash CHAR(64) UNIQUE,
  parent_session_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_parent_verif_student ON parent_verifications(student_id);

CREATE TABLE IF NOT EXISTS parental_consents (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_verification_id TEXT NOT NULL REFERENCES parent_verifications(id) ON DELETE CASCADE,
  consent_status consent_status_enum NOT NULL,
  consent_version TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  verification_result TEXT NOT NULL,
  policy_acknowledgements JSONB NOT NULL DEFAULT '{}'::jsonb,
  withdrawal_token_hash CHAR(64) UNIQUE,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawal_timestamp TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pg_parental_consents_student ON parental_consents(student_id);

CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id TEXT PRIMARY KEY,
  user_reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL,
  provider_reference TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_audit_logs_user ON verification_audit_logs(user_reference);
CREATE INDEX IF NOT EXISTS idx_pg_audit_logs_time ON verification_audit_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS webhook_replay_nonces (
  nonce_key TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  status deletion_status_enum NOT NULL DEFAULT 'SCHEDULED',
  scheduled_purge_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_deletion_due ON data_deletion_requests(status, scheduled_purge_at);

-- -----------------------------------------------------------------------------
-- 5. MEDIA ASSETS, POSTS, STORIES, REELS, @TAGS, LIKES, BOOKMARKS & COMMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  purpose TEXT NOT NULL DEFAULT 'post' CHECK (purpose IN ('avatar', 'post', 'story', 'reel')),
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_media_owner ON media_assets(owner_id);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_school TEXT NOT NULL,
  author_avatar TEXT NOT NULL,
  category post_category_enum NOT NULL DEFAULT 'post',
  title TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  media_type media_type_enum NOT NULL DEFAULT 'none',
  image_url TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  attached_link TEXT NOT NULL DEFAULT '',
  media_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  skill_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  shares_count INTEGER NOT NULL DEFAULT 0 CHECK (shares_count >= 0),
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_posts_category ON posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_posts_skills_gin ON posts USING GIN (skill_tags);
CREATE INDEX IF NOT EXISTS idx_pg_posts_meta_gin ON posts USING GIN (media_meta);

-- Normalized @People Tags on Posts/Stories/Reels (Max 10 enforced by trigger)
CREATE TABLE IF NOT EXISTS post_tagged_people (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tagged_handle TEXT NOT NULL,
  tagged_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, tagged_handle)
);

CREATE INDEX IF NOT EXISTS idx_pg_post_tagged_user ON post_tagged_people(tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_pg_post_tagged_handle ON post_tagged_people(LOWER(tagged_handle));

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_post_likes_user ON post_likes(user_id);

CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_post_bookmarks_user ON post_bookmarks(user_id);

CREATE TABLE IF NOT EXISTS post_shares (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_avatar TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_post_comments_post ON post_comments(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- -----------------------------------------------------------------------------
-- 6. PORTFOLIO PROJECTS, ACHIEVEMENTS, COMPETITIONS & SOCIAL GRAPH
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT 'Student Build',
  featured BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_student_projects_user ON student_projects(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  achievement_type TEXT NOT NULL DEFAULT 'milestone' CHECK (achievement_type IN ('milestone', 'competition', 'certificate')),
  issuer TEXT NOT NULL DEFAULT 'TeenStack Verified Network',
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  course_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_student_achievements_user ON student_achievements(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN ('PENDING', 'ACCEPTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_friendships_friend ON friendships(friend_id);

CREATE TABLE IF NOT EXISTS user_interactions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);

-- -----------------------------------------------------------------------------
-- 7. MESSAGING, STUDY GROUPS, PARTICIPANT READ CURSORS & CHAT MESSAGES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  role_badge TEXT NOT NULL DEFAULT '',
  avatar_preset TEXT NOT NULL DEFAULT 'violet-coder',
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  direct_key TEXT UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_chat_participants_user ON chat_participants(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  attachment JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_messages_thread_time ON messages(thread_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 8. OPPORTUNITIES, HACKATHONS, STUDENT BOUNTIES, APPLICATIONS & BOOKMARKS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  type opportunity_type_enum NOT NULL DEFAULT 'Student Bounty',
  deadline TEXT NOT NULL,
  mode opportunity_mode_enum NOT NULL DEFAULT 'Remote',
  reward TEXT NOT NULL,
  age_range TEXT NOT NULL DEFAULT 'Ages 13–19',
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  description TEXT NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_opportunities_type ON opportunities(type);
CREATE INDEX IF NOT EXISTS idx_pg_opportunities_skills_gin ON opportunities USING GIN (skills);

CREATE TABLE IF NOT EXISTS opportunity_applications (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pitch_note TEXT NOT NULL DEFAULT '',
  portfolio_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_opp_apps_user ON opportunity_applications(user_id);

CREATE TABLE IF NOT EXISTS opportunity_bookmarks (
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (opportunity_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 9. COURSES, INTERACTIVE MODULES & PER-STUDENT MODULE COMPLETION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  track TEXT NOT NULL,
  level course_level_enum NOT NULL DEFAULT 'Beginner',
  duration TEXT NOT NULL,
  mentor TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (course_id, module_code)
);

CREATE TABLE IF NOT EXISTS course_module_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id, module_code),
  FOREIGN KEY (course_id, module_code) REFERENCES course_modules(course_id, module_code) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 10. IN-APP NOTIFICATIONS, USER BLOCKS & SAFETY MODERATION QUEUE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  target_route TEXT NOT NULL DEFAULT 'home',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_user_blocks_blocked ON user_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS safety_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type report_target_enum NOT NULL,
  target_id TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status report_status_enum NOT NULL DEFAULT 'OPEN',
  resolution_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_safety_reports_status ON safety_reports(status, created_at DESC);
