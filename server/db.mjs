import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, normalizeEmail, normalizeMobile } from './security.mjs';
import {
  SEED_PEER_USERS,
  SEED_OPPORTUNITIES,
  SEED_COURSES,
  SEED_CHAT_THREADS,
  SEED_MESSAGES,
} from './seed_data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_001_PATH = path.join(__dirname, 'migrations', '001_signzy_verification_schema.sql');
const MIGRATION_002_PATH = path.join(__dirname, 'migrations', '002_full_platform_domains.sql');
const MIGRATION_003_PATH = path.join(__dirname, 'migrations', '003_media_safety_and_lifecycle.sql');

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

  // If upgrading an existing legacy users table, add verification columns BEFORE index creation
  const existingUsersTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (existingUsersTable) {
    ensureColumn(db, 'users', 'email_lookup_hash', 'TEXT');
    ensureColumn(db, 'users', 'mobile', "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, 'users', 'mobile_lookup_hash', 'TEXT');
    ensureColumn(db, 'users', 'declared_dob', "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, 'users', 'verified_age_band', "TEXT NOT NULL DEFAULT 'UNVERIFIED'");
    ensureColumn(db, 'users', 'account_status', "TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'");
    ensureColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'student'");
  }

  // Run Migration 001: Signzy Verification & Parental Consent Schema
  db.exec(fs.readFileSync(MIGRATION_001_PATH, 'utf8'));

  // Ensure TeenStack social/profile columns exist on users
  ensureColumn(db, 'users', 'phone', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'dob', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'age', 'INTEGER DEFAULT 16');
  ensureColumn(db, 'users', 'marketing_opt_in', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'onboarding_step', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'users', 'onboarding_completed', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'profile_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'users', 'last_active_at', "TEXT DEFAULT ''");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lookup_unique
    ON users(email_lookup_hash) WHERE email_lookup_hash IS NOT NULL;
  `);

  // Base social tables (must exist before Migration 002 foreign keys reference `posts`)
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
      views_count INTEGER DEFAULT 0,
      expires_at TEXT,
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
  ensureColumn(db, 'sessions', 'created_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'sessions', 'user_agent', "TEXT DEFAULT ''");
  ensureColumn(db, 'posts', 'views_count', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'posts', 'expires_at', 'TEXT');

  // Run Migration 002: Full Platform Relational Domains
  db.exec(fs.readFileSync(MIGRATION_002_PATH, 'utf8'));

  // Run Migration 003: Media Assets, User Blocks & Safety Moderation
  db.exec(fs.readFileSync(MIGRATION_003_PATH, 'utf8'));

  // Upgrade any pre-existing legacy rows so PII is encrypted at rest and lookup hashes are populated
  const allUsers = db.prepare('SELECT * FROM users').all();
  for (const row of allUsers) {
    const rawEmail = cryptoCtx.decryptPII(row.email);
    const rawMobile = cryptoCtx.decryptPII(row.mobile || row.phone || '');
    const rawDob = cryptoCtx.decryptPII(row.declared_dob || row.dob || '');
    const emailHash = cryptoCtx.blindIndex('email', normalizeEmail(rawEmail));
    const mobileHash = cryptoCtx.blindIndex('mobile', normalizeMobile(rawMobile));
    const encEmail = cryptoCtx.encryptPII(normalizeEmail(rawEmail));
    const encMobile = rawMobile ? cryptoCtx.encryptPII(rawMobile) : '';
    const encDob = rawDob ? cryptoCtx.encryptPII(rawDob) : '';
    const isSeededAccount = row.id === 'usr-demo-arav' || row.id.startsWith('peer-');
    const nextStatus =
      isSeededAccount && !cryptoCtx.isProd
        ? 'ACTIVE'
        : row.account_status || 'PENDING_VERIFICATION';
    const nextBand =
      isSeededAccount && !cryptoCtx.isProd
        ? row.age >= 18
          ? 'VERIFIED_18_PLUS'
          : 'VERIFIED_13_17'
        : row.verified_age_band || 'UNVERIFIED';

    db.prepare(`
      UPDATE users
      SET email = ?, email_lookup_hash = ?, mobile = ?, mobile_lookup_hash = ?,
          declared_dob = ?, phone = '', dob = '', account_status = ?, verified_age_band = ?
      WHERE id = ?
    `).run(encEmail, emailHash, encMobile, mobileHash, encDob, nextStatus, nextBand, row.id);
  }

  // Seed relational catalog & demo ecosystem when enabled
  if (seedDemo) {
    seedFullPlatformEcosystem(db, cryptoCtx);
  }

  return db;
}

function seedFullPlatformEcosystem(db, cryptoCtx) {
  const nowIso = new Date().toISOString();

  // 1. Seed Demo Student + 5 Verified Peer Students (in non-prod)
  if (!cryptoCtx.isProd) {
    const aravExists = db.prepare("SELECT id FROM users WHERE id = 'usr-demo-arav'").get();
    if (!aravExists) {
      const demoProfile = {
        subjects: ['Computer Science', 'Physics', 'Applied Mathematics', 'Product Design'],
        educationLevel: 'High School Junior (Grade 11)',
        school: 'Westlake STEM Academy',
        careerInterests: ['AI Systems Engineering', 'Interactive Web Interfaces', 'EdTech Founders'],
        skills: ['TypeScript', 'React', 'Python', 'UI Systems', 'Shader Art', 'Figma'],
        generatedTags: ['#FullStackTeen', '#CreativeCoder', '#AISystems', '#UIArchitect'],
        experienceYears: 2,
        projectsCompleted: 3,
        ratePerProject: '₹12,000 / milestone',
        targetClients: '4 student labs & indie teams',
        achievements: [
          '1st Place — National Teen AI Buildathon 2026',
          'Open Source Contributor (1.4k GitHub Stars)',
          'AP CS Principles Perfect Score',
        ],
        competitions: ['Global Youth Robotics Cup', 'MIT Blueprint High School Hackathon'],
        careerAim: 'Build collaborative learning tools that turn curiosity into shipped software.',
        desiredField: 'Human-Centered AI & Design Engineering',
        skillsToLearn: ['Rust', 'WebGPU', 'Distributed Systems'],
        avatarUrl: '',
        avatarPreset: 'violet-coder',
        bio: '17yo design engineer & CS lead @ Westlake Robotics. Building interactive study tools, WebGL simulations, and student dev communities.',
        portfolioUrl: 'https://arav.teenstack.dev',
        portfolioProjects: [
          {
            id: 'proj-1',
            title: 'Solaris Terrain Lab',
            summary: 'Interactive procedural mountain & atmospheric light simulator for Physics classes.',
            link: 'https://solaris.teenstack.dev',
            tag: 'WebGL · TypeScript',
          },
          {
            id: 'proj-2',
            title: 'PulseNote Peer Tutor',
            summary: 'Real-time collaborative LaTeX + voice whiteboard used by 420+ high school students.',
            link: 'https://pulsenote.teenstack.dev',
            tag: 'React · WebSockets',
          },
          {
            id: 'proj-3',
            title: 'EcoSense Micro-Grid',
            summary: 'ESP32 solar telemetry dashboard tracking school rooftop output with anomaly alerts.',
            link: 'https://ecosense.teenstack.dev',
            tag: 'IoT · Python',
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
          age, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, last_active_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        nowIso,
        new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
      );
    }

    // Seed the 5 Peer Students as real relational rows in `users`, `student_projects`, `student_achievements`
    for (const peer of SEED_PEER_USERS) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(peer.id);
      if (!exists) {
        const peerProfile = {
          subjects: ['Computer Science', 'STEM'],
          educationLevel: 'High School Student',
          school: peer.school,
          headline: peer.headline,
          baseMutuals: peer.baseMutuals,
          online: peer.online,
          careerInterests: [peer.headline],
          skills: peer.skills,
          generatedTags: peer.tags,
          experienceYears: 2,
          projectsCompleted: peer.projects.length,
          ratePerProject: '₹10,000 / project',
          targetClients: 'Student teams',
          achievements: peer.achievements,
          competitions: [],
          careerAim: peer.bio,
          desiredField: peer.headline,
          skillsToLearn: [],
          avatarUrl: '',
          avatarPreset: peer.avatarPreset,
          bio: peer.bio,
          portfolioUrl: peer.projects[0]?.link || 'https://teenstack.dev',
          portfolioProjects: peer.projects,
          privacy: {
            profileVisibility: 'students_only',
            dmPermission: 'verified_students',
            hideContactInfo: true,
            guardianEmail: '',
            contentSafetyFilter: true,
          },
        };

        db.prepare(`
          INSERT INTO users (
            id, full_name, username, email, email_lookup_hash, mobile, mobile_lookup_hash,
            password_hash, declared_dob, verified_age_band, account_status, role,
            age, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, last_active_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'student', ?, 0, 5, 1, ?, ?, ?)
        `).run(
          peer.id,
          peer.fullName,
          peer.username,
          cryptoCtx.encryptPII(peer.email),
          cryptoCtx.blindIndex('email', normalizeEmail(peer.email)),
          cryptoCtx.encryptPII(peer.mobile),
          cryptoCtx.blindIndex('mobile', normalizeMobile(peer.mobile)),
          hashPassword('TeenStackPeer@2026'),
          cryptoCtx.encryptPII(peer.dob),
          peer.age >= 18 ? 'VERIFIED_18_PLUS' : 'VERIFIED_13_17',
          peer.age,
          JSON.stringify(peerProfile),
          peer.online ? nowIso : new Date(Date.now() - 3600_000 * 5).toISOString(),
          nowIso
        );
      }
    }

    // Backfill normalized `student_projects` and `student_achievements` from `users.profile_json` if empty
    const projCount = db.prepare('SELECT COUNT(*) as c FROM student_projects').get().c;
    if (projCount === 0) {
      const insertProj = db.prepare(`
        INSERT OR IGNORE INTO student_projects (id, user_id, title, summary, link, tag, featured, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `);
      const insertAch = db.prepare(`
        INSERT OR IGNORE INTO student_achievements (id, user_id, title, issuer, verified, created_at)
        VALUES (?, ?, ?, 'TeenStack Verified Network', 1, ?)
      `);
      const usersRows = db.prepare("SELECT id, profile_json FROM users WHERE account_status = 'ACTIVE'").all();
      for (const u of usersRows) {
        let prof = {};
        try {
          prof = JSON.parse(u.profile_json || '{}');
        } catch {
          prof = {};
        }
        for (const pr of prof.portfolioProjects || []) {
          insertProj.run(
            `${u.id}-${pr.id}`,
            u.id,
            pr.title,
            pr.summary || '',
            pr.link || '',
            pr.tag || 'Build',
            nowIso
          );
        }
        const allAchs = [...(prof.achievements || []), ...(prof.competitions || [])];
        allAchs.forEach((title, i) => {
          insertAch.run(`ach-${u.id}-${i}`, u.id, title, nowIso);
        });
      }
    }

    // Seed initial mutual friendships graph if empty
    const friendCount = db.prepare('SELECT COUNT(*) as c FROM friendships').get().c;
    if (friendCount === 0) {
      const pairs = [
        ['usr-demo-arav', 'peer-maya'],
        ['peer-maya', 'peer-rohan'],
        ['peer-maya', 'peer-ananya'],
        ['peer-rohan', 'peer-kai'],
        ['peer-zara', 'peer-maya'],
      ];
      const insF = db.prepare(
        "INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'ACCEPTED', ?)"
      );
      for (const [a, b] of pairs) {
        const aExists = db.prepare('SELECT id FROM users WHERE id = ?').get(a);
        const bExists = db.prepare('SELECT id FROM users WHERE id = ?').get(b);
        if (aExists && bExists) {
          insF.run(a, b, nowIso);
          insF.run(b, a, nowIso);
        }
      }
    }
  }

  // 2. Seed Posts & Normalized Comments if empty
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
          'Finally shipped v2 of our interactive physics & terrain renderer! Students can tweak sun elevation, atmospheric scattering, and ridge erosion live at 60fps. Looking for 2 UI/audio collaborators before Winter Youth Demo Day.',
        media_type: 'image',
        media_meta: JSON.stringify({
          imageUrl: 'images/posts/shader-desk.jpg',
          topic: 'WebGL & Shaders',
          attachedLink: 'https://solaris.teenstack.dev',
          taggedPeople: ['@arav_dev', '@ananya_ux'],
        }),
        skill_tags: JSON.stringify(['WebGL', 'Shaders', 'PhysicsSim', 'TypeScript']),
        likes_count: 284,
        comments: [
          {
            id: 'c1',
            authorId: 'peer-rohan',
            author: 'Rohan Mehta',
            avatar: 'blue-builder',
            text: 'The dual-monitor shader viewport looks crisp! Down to wire spatial synth audio.',
            time: '18m ago',
          },
          {
            id: 'c2',
            authorId: 'peer-zara',
            author: 'Zara Al-Mansoor',
            avatar: 'amber-innovator',
            text: 'Tested this in AP Environmental Science today—ran super smoothly.',
            time: '9m ago',
          },
        ],
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
          '48 hours, 3 burned-out sensors, and 1 working autonomous water-quality rover! Built an under-₹5,500 solar sensor pod that maps lake turbidity and streams live telemetry.',
        media_type: 'image',
        media_meta: JSON.stringify({
          imageUrl: 'images/posts/hackathon-win.jpg',
          topic: 'Robotics',
          taggedPeople: ['@kai_systems'],
        }),
        skill_tags: JSON.stringify(['Robotics', 'EmbeddedCPP', 'ClimateTech', 'Hardware']),
        likes_count: 412,
        comments: [
          {
            id: 'c3',
            authorId: 'peer-kai',
            author: 'Kai Nakamura',
            avatar: 'emerald-scholar',
            text: 'Under ₹5,500 BOM is wild—congrats on taking 1st place!',
            time: '1h ago',
          },
        ],
        shares_count: 58,
        created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
      },
      {
        id: 'post-rover-field',
        author_id: 'peer-rohan',
        author_name: 'Rohan Mehta',
        author_handle: '@rohan_builds',
        author_school: 'Delhi Public STEM · 16',
        author_avatar: 'blue-builder',
        category: 'reel',
        title: 'Field Test #4 — AquaPulse Autonomous Solar Rover on the Lake',
        content:
          'Early morning lake test before first period! Live dissolved-oxygen and turbidity packets held a steady link at 180 meters from the dock.',
        media_type: 'video_showcase',
        media_meta: JSON.stringify({
          createType: 'reel',
          topic: 'Field Robotics',
          imageUrl: 'images/posts/rover-lake.jpg',
          attachedLink: 'https://aquapulse.teenstack.dev',
        }),
        skill_tags: JSON.stringify(['IoT', 'SolarHardware', 'Python', 'FieldRobotics']),
        likes_count: 319,
        comments: [],
        shares_count: 27,
        created_at: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
      },
      {
        id: 'post-zara-3',
        author_id: 'peer-zara',
        author_name: 'Zara Al-Mansoor',
        author_handle: '@zara_ml',
        author_school: 'Oakridge International · 18',
        author_avatar: 'amber-innovator',
        category: 'tutorial',
        title: 'Microfluidic Assay + Neural Cellular Automata Lab Notes',
        content:
          'Paired our wet-lab microfluidic fluorescence imaging with a 300-line PyTorch cellular automata model to predict pattern regeneration. Open-sourced the full notebook for AP Bio & ISEF students!',
        media_type: 'image',
        media_meta: JSON.stringify({
          imageUrl: 'images/teens/biotech-scientist.jpg',
          topic: 'AI & BioML',
          attachedLink: 'https://morphocell.teenstack.dev',
        }),
        skill_tags: JSON.stringify(['BioInformatics', 'PyTorch', 'WetLab', 'OpenScience']),
        likes_count: 246,
        comments: [],
        shares_count: 51,
        created_at: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
      },
      {
        id: 'post-ananya-4',
        author_id: 'peer-ananya',
        author_name: 'Ananya Iyer',
        author_handle: '@ananya_ux',
        author_school: 'Meridian Design High · 16',
        author_avatar: 'visual-creator',
        category: 'project',
        title: 'Spatial Pen-Display UI Kit & Tactile Vector Brushes',
        content:
          'Prototyping custom pressure-sensitive vector ribbon brushes and accessible high-contrast UI tokens in our studio tonight. Open to design-system collabs!',
        media_type: 'image',
        media_meta: JSON.stringify({
          imageUrl: 'images/posts/braille-app.jpg',
          topic: 'UI/UX Design',
        }),
        skill_tags: JSON.stringify(['DesignSystems', 'UIUX', '3DArt', 'Accessibility']),
        likes_count: 198,
        comments: [],
        shares_count: 24,
        created_at: new Date(Date.now() - 1000 * 60 * 520).toISOString(),
      },
    ];

    const insertPost = db.prepare(`
      INSERT INTO posts (id, author_id, author_name, author_handle, author_school, author_avatar, category, title, content, media_type, media_meta, skill_tags, likes_count, comments_json, shares_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertComment = db.prepare(`
      INSERT OR IGNORE INTO post_comments (id, post_id, author_id, author_name, author_avatar, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
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
        JSON.stringify(p.comments),
        p.shares_count,
        p.created_at
      );
      for (const c of p.comments) {
        insertComment.run(c.id, p.id, c.authorId, c.author, c.avatar, c.text, p.created_at);
      }
    }
  }

  // 3. Seed Opportunities
  const oppCount = db.prepare('SELECT COUNT(*) as c FROM opportunities').get().c;
  if (oppCount === 0) {
    const insOpp = db.prepare(`
      INSERT INTO opportunities (id, title, organization, type, deadline, mode, reward, age_range, skills_json, description, featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const o of SEED_OPPORTUNITIES) {
      insOpp.run(
        o.id,
        o.title,
        o.organization,
        o.type,
        o.deadline,
        o.mode,
        o.reward,
        o.ageRange,
        JSON.stringify(o.skills),
        o.description,
        o.featured,
        nowIso
      );
    }
  }

  // 4. Seed Courses & Modules
  const courseCount = db.prepare('SELECT COUNT(*) as c FROM courses').get().c;
  if (courseCount === 0) {
    const insCourse = db.prepare(`
      INSERT INTO courses (id, title, track, level, duration, mentor, skills_json, summary, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insMod = db.prepare(`
      INSERT INTO course_modules (id, course_id, module_code, title, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    SEED_COURSES.forEach((c, cIdx) => {
      insCourse.run(
        c.id,
        c.title,
        c.track,
        c.level,
        c.duration,
        c.mentor,
        JSON.stringify(c.skills),
        c.summary,
        cIdx,
        nowIso
      );
      c.modules.forEach((m, mIdx) => {
        insMod.run(`${c.id}:${m.code}`, c.id, m.code, m.title, m.duration, mIdx);
      });
    });

    // Seed initial demo module progress for usr-demo-arav if present
    const arav = db.prepare("SELECT id FROM users WHERE id = 'usr-demo-arav'").get();
    if (arav) {
      const insProg = db.prepare(
        'INSERT OR IGNORE INTO course_module_progress (user_id, course_id, module_code, completed_at) VALUES (?, ?, ?, ?)'
      );
      insProg.run('usr-demo-arav', 'course-1', 'm1', nowIso);
      insProg.run('usr-demo-arav', 'course-1', 'm2', nowIso);
      insProg.run('usr-demo-arav', 'course-2', 'm1', nowIso);
    }
  }

  // 5. Seed Chat Threads, Participants & Messages
  const threadCount = db.prepare('SELECT COUNT(*) as c FROM chat_threads').get().c;
  if (threadCount === 0) {
    const insThread = db.prepare(`
      INSERT INTO chat_threads (id, name, handle, role_badge, avatar_preset, is_group, direct_key, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insPart = db.prepare(`
      INSERT OR IGNORE INTO chat_participants (thread_id, user_id, last_read_at, joined_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const t of SEED_CHAT_THREADS) {
      const directKey =
        t.peerId && !cryptoCtx.isProd
          ? ['usr-demo-arav', t.peerId].sort().join('::')
          : null;
      insThread.run(
        t.id,
        t.name,
        t.handle,
        t.roleBadge,
        t.avatarPreset,
        t.isGroup,
        directKey,
        nowIso,
        nowIso
      );

      if (!cryptoCtx.isProd) {
        const arav = db.prepare("SELECT id FROM users WHERE id = 'usr-demo-arav'").get();
        if (arav) {
          // Leave thread-maya & thread-rohan slightly behind latest message so unread counts work realistically!
          const lastRead =
            t.id === 'thread-maya' || t.id === 'thread-rohan'
              ? new Date(Date.now() - 1000 * 60 * 120).toISOString()
              : nowIso;
          insPart.run(t.id, 'usr-demo-arav', lastRead, nowIso);
        }
        if (t.peerId) {
          const pRow = db.prepare('SELECT id FROM users WHERE id = ?').get(t.peerId);
          if (pRow) insPart.run(t.id, t.peerId, nowIso, nowIso);
        }
      }
    }

    const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
    if (msgCount === 0) {
      const insMsg = db.prepare(`
        INSERT INTO messages (id, thread_id, sender_id, sender_name, text, attachment_json, created_at)
        VALUES (?, ?, ?, ?, ?, 'null', ?)
      `);
      for (const m of SEED_MESSAGES) {
        insMsg.run(
          m.id,
          m.threadId,
          m.senderId,
          m.senderName,
          m.text,
          new Date(Date.now() - 1000 * 60 * m.minutesAgo).toISOString()
        );
      }
    }
  }

  // 6. Seed Initial Notifications for demo user
  if (!cryptoCtx.isProd) {
    const notifCount = db.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    const arav = db.prepare("SELECT id FROM users WHERE id = 'usr-demo-arav'").get();
    if (notifCount === 0 && arav) {
      const insN = db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, detail, target_route, is_read, created_at)
        VALUES (?, 'usr-demo-arav', ?, ?, ?, ?, ?, ?)
      `);
      insN.run(
        'notif-1',
        'collab',
        'Maya Lin tagged you in Solaris Horizon v2.0',
        'Looking for 2 UI/audio collaborators before Winter Youth Demo Day',
        'home',
        0,
        new Date(Date.now() - 1000 * 60 * 12).toISOString()
      );
      insN.run(
        'notif-2',
        'opportunity',
        'Registration Open: Global Teen AI Hackathon',
        '₹10,00,000 prize pool · Remote teams of 1–4 students',
        'opportunities',
        0,
        new Date(Date.now() - 1000 * 60 * 120).toISOString()
      );
    }
  }
}
