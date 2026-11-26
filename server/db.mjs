import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, normalizeEmail, normalizeMobile } from './security.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_PATH = path.join(__dirname, 'migrations', '001_signzy_verification_schema.sql');

function ensureColumn(db, tableName, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

export function initializeDatabase({ dbPath, cryptoCtx, seedDemo = true }) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = DELETE;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Execute core verification & parental-consent schema migration
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  db.exec(migrationSql);

  // Backfill columns safely if upgrading an older pre-verification teenstack.sqlite file
  ensureColumn(db, 'users', 'email_lookup_hash', 'TEXT');
  ensureColumn(db, 'users', 'mobile', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'users', 'mobile_lookup_hash', 'TEXT');
  ensureColumn(db, 'users', 'declared_dob', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'users', 'verified_age_band', "TEXT NOT NULL DEFAULT 'UNVERIFIED'");
  ensureColumn(db, 'users', 'account_status', "TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'");
  ensureColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'student'");
  ensureColumn(db, 'users', 'phone', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'dob', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'age', 'INTEGER DEFAULT 16');
  ensureColumn(db, 'users', 'marketing_opt_in', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'onboarding_step', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'users', 'onboarding_completed', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'profile_json', "TEXT DEFAULT '{}'");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lookup_unique
    ON users(email_lookup_hash) WHERE email_lookup_hash IS NOT NULL;
  `);

  // Existing TeenStack social/session tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_handle TEXT NOT NULL,
      author_school TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT DEFAULT '',
      content TEXT NOT NULL,
      media_type TEXT DEFAULT 'none',
      media_meta TEXT DEFAULT '{}',
      skill_tags TEXT DEFAULT '[]',
      likes_count INTEGER DEFAULT 0,
      comments_json TEXT DEFAULT '[]',
      shares_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_interactions (
      user_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      meta_json TEXT DEFAULT '{}',
      PRIMARY KEY (user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      attachment_json TEXT DEFAULT 'null',
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, 'sessions', 'role', "TEXT NOT NULL DEFAULT 'student'");

  // Upgrade any pre-existing legacy rows so PII is encrypted at rest and lookup hashes are populated
  const legacyUsers = db.prepare('SELECT * FROM users').all();
  for (const row of legacyUsers) {
    const rawEmail = cryptoCtx.decryptPII(row.email);
    const rawMobile = cryptoCtx.decryptPII(row.mobile || row.phone || '');
    const rawDob = cryptoCtx.decryptPII(row.declared_dob || row.dob || '');
    const emailHash = cryptoCtx.blindIndex('email', normalizeEmail(rawEmail));
    const mobileHash = cryptoCtx.blindIndex('mobile', normalizeMobile(rawMobile));
    const encEmail = cryptoCtx.encryptPII(normalizeEmail(rawEmail));
    const encMobile = rawMobile ? cryptoCtx.encryptPII(rawMobile) : '';
    const encDob = rawDob ? cryptoCtx.encryptPII(rawDob) : '';
    const nextStatus =
      row.id === 'usr-demo-arav' && !cryptoCtx.isProd
        ? 'ACTIVE'
        : row.account_status || 'PENDING_VERIFICATION';
    const nextBand =
      row.id === 'usr-demo-arav' && !cryptoCtx.isProd
        ? 'VERIFIED_13_17'
        : row.verified_age_band || 'UNVERIFIED';

    db.prepare(`
      UPDATE users
      SET email = ?, email_lookup_hash = ?, mobile = ?, mobile_lookup_hash = ?,
          declared_dob = ?, phone = '', dob = '', account_status = ?, verified_age_band = ?
      WHERE id = ?
    `).run(
      encEmail,
      emailHash,
      encMobile,
      mobileHash,
      encDob,
      nextStatus,
      nextBand,
      row.id
    );
  }

  // Seed initial demo feed & demo account (non-production only for pre-activated demo user)
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (existingCount === 0 && seedDemo) {
    if (!cryptoCtx.isProd) {
      const demoProfile = {
        subjects: ['Computer Science', 'Physics', 'Applied Mathematics', 'Product Design'],
        educationLevel: 'High School Junior (Grade 11)',
        school: 'Westlake STEM Academy',
        careerInterests: ['AI Systems Engineering', 'Interactive Web Interfaces', 'EdTech Founders'],
        skills: ['TypeScript', 'React', 'Python', 'UI Systems', 'Shader Art', 'Figma'],
        generatedTags: ['#FullStackTeen', '#CreativeCoder', '#AISystems', '#UIArchitect'],
        experienceYears: 2,
        projectsCompleted: 9,
        ratePerProject: '₹12,000 / milestone',
        targetClients: '4 student labs & indie teams',
        achievements: [
          '1st Place — National Teen AI Buildathon 2026',
          'Open Source Contributor (1.4k GitHub Stars)',
        ],
        competitions: ['Global Youth Robotics Cup', 'MIT Blueprint High School Hackathon'],
        careerAim: 'Build collaborative learning tools that turn curiosity into shipped software.',
        desiredField: 'Human-Centered AI & Design Engineering',
        skillsToLearn: ['Rust', 'WebGPU', 'Distributed Systems'],
        avatarUrl: '',
        avatarPreset: 'violet-coder',
        bio: '17yo design engineer & CS lead. Building interactive study tools, WebGL simulations, and student dev communities.',
        portfolioUrl: 'https://arav.teenstack.dev',
        portfolioProjects: [
          {
            id: 'proj-1',
            title: 'Solaris Terrain Lab',
            summary: 'Interactive procedural mountain & atmospheric light simulator for Physics classes.',
            link: 'https://solaris.teenstack.dev',
            tag: 'WebGL · TypeScript',
          },
        ],
        privacy: {
          profileVisibility: 'students_only',
          dmPermission: 'verified_students',
          hideContactInfo: true,
          guardianEmail: '',
          contentSafetyFilter: true,
        },
      };

      const demoEmail = 'arav@teenstack.edu';
      const demoMobile = '+91 98201 44312';
      db.prepare(`
        INSERT INTO users (
          id, full_name, username, email, email_lookup_hash, mobile, mobile_lookup_hash,
          password_hash, declared_dob, verified_age_band, account_status, role,
          age, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'usr-demo-arav',
        'Arav Sharma',
        'arav_dev',
        cryptoCtx.encryptPII(demoEmail),
        cryptoCtx.blindIndex('email', normalizeEmail(demoEmail)),
        cryptoCtx.encryptPII(demoMobile),
        cryptoCtx.blindIndex('mobile', normalizeMobile(demoMobile)),
        hashPassword('TeenStack@2026'),
        cryptoCtx.encryptPII('2009-05-14'),
        'VERIFIED_13_17',
        'ACTIVE',
        'student',
        17,
        0,
        5,
        1,
        JSON.stringify(demoProfile),
        new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
      );
    }

    const postCount = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
    if (postCount === 0) {
      const seedPosts = [
        {
          id: 'post-solaris-1',
          author_id: 'peer-maya',
          author_name: 'Maya Lin',
          author_handle: '@mayalin_gfx',
          author_school: 'Bayview Arts & Tech · 17',
          author_avatar: 'cyan-creator',
          category: 'project',
          title: 'Solaris Horizon — Real-Time 3D Terrain & Atmospheric Shader v2.0',
          content:
            'Shipped v2 of our interactive physics & terrain renderer! Students can tweak sun elevation, atmospheric scattering, and ridge erosion live at 60fps.',
          media_type: 'image',
          media_meta: JSON.stringify({ imageUrl: 'images/posts/shader-desk.jpg' }),
          skill_tags: JSON.stringify(['WebGL', 'Shaders', 'PhysicsSim', 'TypeScript']),
          likes_count: 284,
          comments_json: JSON.stringify([]),
          shares_count: 34,
          created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        },
        {
          id: 'post-rohan-2',
          author_id: 'peer-rohan',
          author_name: 'Rohan Mehta',
          author_handle: '@rohan_builds',
          author_school: 'Delhi Public STEM · 16',
          author_avatar: 'blue-builder',
          category: 'achievement',
          title: 'Won 1st Place Hardware Track @ Youth Climate Hack!',
          content:
            '48 hours and 1 working autonomous water-quality rover! Built an under-₹5,500 solar sensor pod that maps lake turbidity.',
          media_type: 'image',
          media_meta: JSON.stringify({ imageUrl: 'images/posts/hackathon-win.jpg' }),
          skill_tags: JSON.stringify(['Robotics', 'EmbeddedCPP', 'ClimateTech']),
          likes_count: 412,
          comments_json: JSON.stringify([]),
          shares_count: 58,
          created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
        },
      ];
      const insertPost = db.prepare(`
        INSERT INTO posts (id, author_id, author_name, author_handle, author_school, author_avatar, category, title, content, media_type, media_meta, skill_tags, likes_count, comments_json, shares_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of seedPosts) {
        insertPost.run(
          p.id,
          p.author_id,
          p.author_name,
          p.author_handle,
          p.author_school,
          p.author_avatar,
          p.category,
          p.title,
          p.content,
          p.media_type,
          p.media_meta,
          p.skill_tags,
          p.likes_count,
          p.comments_json,
          p.shares_count,
          p.created_at
        );
      }
    }
  }

  return db;
}
