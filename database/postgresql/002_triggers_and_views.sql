-- =============================================================================
-- TEENSTACK — POSTGRESQL PL/pgSQL TRIGGERS, BUSINESS RULES & ANALYTICAL VIEWS
-- File: database/postgresql/002_triggers_and_views.sql
-- =============================================================================

-- 1. Auto-update `updated_at` timestamp trigger function
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_user_privacy_updated_at ON user_privacy_settings;
CREATE TRIGGER trg_user_privacy_updated_at
  BEFORE UPDATE ON user_privacy_settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_posts_updated_at ON posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_student_projects_updated_at ON student_projects;
CREATE TRIGGER trg_student_projects_updated_at
  BEFORE UPDATE ON student_projects
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Database-level enforcement: Maximum 10 active skills per student
CREATE OR REPLACE FUNCTION fn_enforce_max_10_active_skills()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW.skill_kind = 'active' THEN
    SELECT COUNT(*) INTO active_count
    FROM user_skills
    WHERE user_id = NEW.user_id
      AND skill_kind = 'active'
      AND skill_name <> NEW.skill_name;

    IF active_count >= 10 THEN
      RAISE EXCEPTION 'MAX_SKILLS_EXCEEDED: A student can select at most 10 active skills.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_10_skills ON user_skills;
CREATE TRIGGER trg_enforce_max_10_skills
  BEFORE INSERT OR UPDATE ON user_skills
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_max_10_active_skills();

-- 3. Database-level enforcement: Maximum 10 @tagged people per post/story/reel
CREATE OR REPLACE FUNCTION fn_enforce_max_10_post_tags()
RETURNS TRIGGER AS $$
DECLARE
  tag_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tag_count
  FROM post_tagged_people
  WHERE post_id = NEW.post_id
    AND tagged_handle <> NEW.tagged_handle;

  IF tag_count >= 10 THEN
    RAISE EXCEPTION 'MAX_TAGS_EXCEEDED: A post can tag at most 10 people using @.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_10_post_tags ON post_tagged_people;
CREATE TRIGGER trg_enforce_max_10_post_tags
  BEFORE INSERT OR UPDATE ON post_tagged_people
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_max_10_post_tags();

-- 4. Keep `posts.comments_count` synchronized automatically on comment insert/delete
CREATE OR REPLACE FUNCTION fn_sync_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_post_comments_count ON post_comments;
CREATE TRIGGER trg_sync_post_comments_count
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION fn_sync_post_comments_count();

-- 5. Analytical View: Complete Normalized Student Directory
CREATE OR REPLACE VIEW v_student_complete_directory AS
SELECT
  u.id,
  u.full_name,
  u.username,
  u.verified_age_band,
  u.account_status,
  u.role,
  u.age,
  u.onboarding_completed,
  p.education_level,
  p.school,
  p.headline,
  p.bio,
  p.avatar_url,
  p.avatar_preset,
  p.portfolio_url,
  p.experience_years,
  p.rate_per_project,
  p.is_online,
  priv.profile_visibility,
  priv.dm_permission,
  priv.hide_contact_info,
  COALESCE(
    (SELECT ARRAY_AGG(s.skill_name ORDER BY s.sort_order)
     FROM user_skills s
     WHERE s.user_id = u.id AND s.skill_kind = 'active'),
    ARRAY[]::TEXT[]
  ) AS active_skills,
  COALESCE(
    (SELECT ARRAY_AGG(sub.subject_name ORDER BY sub.sort_order)
     FROM user_subjects sub
     WHERE sub.user_id = u.id),
    ARRAY[]::TEXT[]
  ) AS subjects,
  COALESCE(
    (SELECT ARRAY_AGG(t.tag_label ORDER BY t.sort_order)
     FROM user_skill_tags t
     WHERE t.user_id = u.id),
    ARRAY[]::TEXT[]
  ) AS skill_tags,
  (SELECT COUNT(*) FROM student_projects sp WHERE sp.user_id = u.id) AS projects_count,
  (SELECT COUNT(*) FROM student_achievements sa WHERE sa.user_id = u.id) AS achievements_count,
  (SELECT COUNT(*) FROM friendships f WHERE f.user_id = u.id AND f.status = 'ACCEPTED') AS friends_count,
  u.created_at
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id
LEFT JOIN user_privacy_settings priv ON priv.user_id = u.id;

-- 6. Analytical View: Real-Time Per-User Unread Message Counts
CREATE OR REPLACE VIEW v_unread_thread_counts AS
SELECT
  cp.user_id,
  cp.thread_id,
  COUNT(m.id) AS unread_count
FROM chat_participants cp
LEFT JOIN messages m
  ON m.thread_id = cp.thread_id
 AND m.sender_id <> cp.user_id
 AND m.created_at > cp.last_read_at
GROUP BY cp.user_id, cp.thread_id;
