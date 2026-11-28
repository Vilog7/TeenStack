-- TEENSTACK — FULL PLATFORM RELATIONAL SCHEMA MIGRATION
-- Migration: 002_full_platform_domains.sql
-- Covers: Social Graph (Friends & Mutuals), Portfolio Projects, Achievements,
--         Post Comments, 24h Story Views, Chat Threads & Unread Tracking,
--         Opportunities & Applications, Courses & Module Progress,
--         In-App Notifications, and Cryptographic Password Reset Tokens.

PRAGMA foreign_keys = ON;

-- 1. Password Reset Tokens (SHA-256 hashed, short-lived, single-use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_tokens(user_id);

-- 2. Relational Social Graph (Friends / Connections)
CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACCEPTED',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

-- 3. Normalized Student Portfolio Projects
CREATE TABLE IF NOT EXISTS student_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT 'Student Build',
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_projects_user ON student_projects(user_id);

-- 4. Normalized Student Achievements & Verified Credentials
CREATE TABLE IF NOT EXISTS student_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT 'TeenStack Network',
  verified INTEGER NOT NULL DEFAULT 1,
  course_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_achievements_user ON student_achievements(user_id);

-- 5. Normalized Post Comments & Story Views
CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (story_id, viewer_id)
);

-- 6. Chat Threads & Participant Read Cursors (for real SQL unread counts)
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  role_badge TEXT NOT NULL DEFAULT '',
  avatar_preset TEXT NOT NULL DEFAULT 'violet-coder',
  is_group INTEGER NOT NULL DEFAULT 0,
  direct_key TEXT UNIQUE,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_participants (
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);

-- 7. Opportunities, Hackathons, Internships & Student Applications
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  creator_id TEXT,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  type TEXT NOT NULL,
  deadline TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'Remote',
  reward TEXT NOT NULL,
  age_range TEXT NOT NULL DEFAULT 'Ages 13–19',
  skills_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(type);

CREATE TABLE IF NOT EXISTS opportunity_applications (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pitch_note TEXT NOT NULL DEFAULT '',
  portfolio_snapshot_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  created_at TEXT NOT NULL,
  UNIQUE (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_apps_user ON opportunity_applications(user_id);

-- 8. Learning Tracks, Course Modules & Per-User Progress
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  track TEXT NOT NULL,
  level TEXT NOT NULL,
  duration TEXT NOT NULL,
  mentor TEXT NOT NULL,
  skills_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (course_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);

CREATE TABLE IF NOT EXISTS course_module_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id, module_code)
);

-- 9. Persistent In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  target_route TEXT NOT NULL DEFAULT 'home',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
