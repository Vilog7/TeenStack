# TeenStack — Complete PostgreSQL Database Architecture

TeenStack stores **every single piece of platform information** in a normalized **38-table PostgreSQL database** ([001_teenstack_complete_schema.sql](file:///d:/TeenStack/database/postgresql/001_teenstack_complete_schema.sql) and [002_triggers_and_views.sql](file:///d:/TeenStack/database/postgresql/002_triggers_and_views.sql)).

## 1. Dual Runtime Modes

- **External / Cloud / Docker PostgreSQL (`pg.Pool`)**: Set `DATABASE_URL=postgresql://teenstack:teenstack_dev_pwd@127.0.0.1:5432/teenstack` in `.env` (or launch [docker-compose.postgres.yml](file:///d:/TeenStack/docker-compose.postgres.yml) with `docker compose -f docker-compose.postgres.yml up -d`).
- **Embedded Local PostgreSQL (`@electric-sql/pglite`)**: When `DATABASE_URL` is omitted in local development, TeenStack runs an embedded PostgreSQL engine and persists `PGDATA` to `server/teenstack_pgdata.tar.gz`.

Run migrations and seed/sync at any time with:

```bash
npm run db:migrate
```

---

## 2. Complete 38-Table Relational Inventory

| Domain | PostgreSQL Tables | Information Stored |
| --- | --- | --- |
| **Identity & Normalized Profile** | `users`, `user_profiles`, `user_privacy_settings`, `user_subjects`, `user_skills`, `user_skill_tags` | Encrypted PII (`email`, `mobile`, `declared_dob`), HMAC-SHA256 blind indexes, `scrypt` password hashes, education level, school, bio, avatar URL/preset, portfolio link, experience years, rate per project, career aims, interested subjects, active skills (max 10 trigger), learning skills, `#SkillTag` badges, and Teen Privacy Shield settings |
| **Sessions & Auth Recovery** | `sessions`, `password_reset_tokens` | Active login tokens, roles, user agents, expirations, and SHA-256 single-use password reset tokens |
| **Signzy Age Verification & DPDP Consent** | `age_verifications`, `parent_verifications`, `parental_consents`, `verification_audit_logs`, `webhook_replay_nonces`, `data_deletion_requests` | DigiLocker/Signzy age-band verification records, anti-spoofing parent contact hashes, single-use invite & session hashes, informed consent acknowledgements (`JSONB`), withdrawal timestamps, audit trails, webhook replay nonces, and scheduled DPDP hard-erasure jobs |
| **Media, Feed, Stories & Reels** | `media_assets`, `posts`, `post_tagged_people`, `post_likes`, `post_bookmarks`, `post_shares`, `post_comments`, `story_views` | Binary uploaded media metadata, posts/stories/reels, topics, links, `TEXT[]` skill tags, `@` tagged people (max 10 trigger), likes, bookmarks, shares, comments (auto-counted via trigger), and 24h story views |
| **Portfolio & Social Graph** | `student_projects`, `student_achievements`, `friendships`, `user_interactions` | Shipped student projects, milestones, competition wins, course certificates, accepted friendships, and interaction states |
| **Messaging & Study Rooms** | `chat_threads`, `chat_participants`, `messages` | 1:1 DM threads (`direct_key`), group study rooms, per-participant read cursors, and chat messages |
| **Opportunities & Bounties** | `opportunities`, `opportunity_applications`, `opportunity_bookmarks` | Hackathons, internships, bounties, `TEXT[]` required skills, student pitch applications (`JSONB` portfolio snapshots), and saved opportunities |
| **Learning & Credentials** | `courses`, `course_modules`, `course_module_progress` | Learning tracks, lesson modules, and per-student module completion timestamps |
| **Safety & Moderation** | `notifications`, `user_blocks`, `safety_reports` | In-app notifications, bidirectional safety blocks, and moderation tickets (`OPEN` / `ACTIONED` / `DISMISSED`) |

---

## 3. PostgreSQL Triggers, ENUMs & Views

- **16 Custom PostgreSQL `ENUM` Types**: Enforce valid states at the column type level (`verified_age_band_enum`, `account_status_enum`, `consent_status_enum`, `post_category_enum`, `report_status_enum`, etc.).
- **`PL/pgSQL` Triggers**:
  - `trg_enforce_max_10_skills`: Rejects >10 active skills per student (`SQLSTATE 23514`).
  - `trg_enforce_max_10_post_tags`: Rejects >10 `@` tagged people per post (`SQLSTATE 23514`).
  - `trg_sync_post_comments_count`: Keeps `posts.comments_count` exact on `INSERT` / `DELETE`.
  - `fn_set_updated_at`: Updates `updated_at` automatically across mutable tables.
- **Analytical SQL Views**:
  - `v_student_complete_directory`: Joins `users`, `user_profiles`, `user_privacy_settings`, aggregated `active_skills`, `subjects`, `skill_tags`, and live project/achievement/friend counts.
  - `v_unread_thread_counts`: Computes real-time unread chat message counts per participant.
