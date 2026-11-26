import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'teenstack.sqlite');
const db = new DatabaseSync(dbPath);

// Initialize schema (DELETE journal mode ensures full compatibility on exFAT & NTFS drives)
db.exec(`
  PRAGMA journal_mode = DELETE;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    age INTEGER DEFAULT 16,
    password_hash TEXT NOT NULL,
    marketing_opt_in INTEGER DEFAULT 0,
    onboarding_step INTEGER DEFAULT 1,
    onboarding_completed INTEGER DEFAULT 0,
    profile_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
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

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = (stored || '').split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}

function sanitizeUser(row) {
  if (!row) return null;
  let profile = {};
  try {
    profile = JSON.parse(row.profile_json || '{}');
  } catch {
    profile = {};
  }
  const privacy = profile.privacy || {
    profileVisibility: 'students_only',
    dmPermission: 'verified_students',
    hideContactInfo: true,
    guardianEmail: '',
    contentSafetyFilter: true,
  };
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    phone: privacy.hideContactInfo ? row.phone.replace(/.(?=.{4})/g, '•') : row.phone,
    rawPhone: row.phone,
    dob: row.dob,
    age: row.age,
    marketingOptIn: Boolean(row.marketing_opt_in),
    onboardingStep: row.onboarding_step,
    onboardingCompleted: Boolean(row.onboarding_completed),
    profile: {
      subjects: profile.subjects || [],
      educationLevel: profile.educationLevel || 'High School (Grade 11)',
      school: profile.school || '',
      careerInterests: profile.careerInterests || [],
      skills: profile.skills || [],
      generatedTags: profile.generatedTags || [],
      experienceYears: profile.experienceYears ?? 1,
      projectsCompleted: profile.projectsCompleted ?? 0,
      ratePerProject: profile.ratePerProject || '$120 / milestone',
      targetClients: profile.targetClients || '3 student startups',
      achievements: profile.achievements || [],
      competitions: profile.competitions || [],
      careerAim: profile.careerAim || '',
      desiredField: profile.desiredField || '',
      skillsToLearn: profile.skillsToLearn || [],
      avatarUrl: profile.avatarUrl || '',
      avatarPreset: profile.avatarPreset || 'violet-coder',
      bio: profile.bio || '',
      portfolioUrl: profile.portfolioUrl || '',
      portfolioProjects: profile.portfolioProjects || [],
      privacy,
    },
    createdAt: row.created_at,
  };
}

// Seed initial demo data if empty
const existingCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (existingCount === 0) {
  const demoProfile = {
    subjects: ['Computer Science', 'Physics', 'Applied Mathematics', 'Product Design'],
    educationLevel: 'High School Junior (Grade 11)',
    school: 'Westlake STEM Academy',
    careerInterests: ['AI Systems Engineering', 'Interactive Web Interfaces', 'EdTech Founders'],
    skills: ['TypeScript', 'React', 'Python', 'UI Systems', 'Shader Art', 'Figma'],
    generatedTags: ['#FullStackTeen', '#CreativeCoder', '#AISystems', '#UIArchitect'],
    experienceYears: 2,
    projectsCompleted: 9,
    ratePerProject: '$180 / project',
    targetClients: '4 student labs & indie teams',
    achievements: [
      '1st Place — National Teen AI Buildathon 2026',
      'Open Source Contributor (1.4k GitHub Stars)',
      'AP CS Principles Perfect Score',
    ],
    competitions: ['Global Youth Robotics Cup', 'MIT Blueprint High School Hackathon', 'ISEF Regional Finalist'],
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
        summary: 'Interactive procedural mountain & atmospheric light simulator built for AP Geography & Physics classes.',
        link: 'https://solaris.teenstack.dev',
        tag: 'WebGL · TypeScript',
      },
      {
        id: 'proj-2',
        title: 'PulseNote Peer Tutor',
        summary: 'Real-time collaborative LaTeX + voice whiteboard used by 420+ high school students during finals week.',
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
      guardianEmail: 'parent.sharma@example.com',
      contentSafetyFilter: true,
    },
  };

  db.prepare(`
    INSERT INTO users (id, full_name, username, email, phone, dob, age, password_hash, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'usr-demo-arav',
    'Arav Sharma',
    'arav_dev',
    'arav@teenstack.edu',
    '+1 (415) 890-4312',
    '2009-05-14',
    17,
    hashPassword('TeenStack@2026'),
    0,
    5,
    1,
    JSON.stringify(demoProfile),
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  );

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
      media_meta: JSON.stringify({ imageUrl: 'images/posts/shader-desk.jpg' }),
      skill_tags: JSON.stringify(['WebGL', 'Shaders', 'PhysicsSim', 'TypeScript']),
      likes_count: 284,
      comments_json: JSON.stringify([
        {
          id: 'c1',
          author: 'Rohan Mehta',
          avatar: 'blue-builder',
          text: 'The dual-monitor shader viewport looks crisp! Down to wire spatial synth audio.',
          time: '18m ago',
        },
        {
          id: 'c2',
          author: 'Zara Al-Mansoor',
          avatar: 'amber-innovator',
          text: 'Tested this in AP Environmental Science today—ran super smoothly.',
          time: '9m ago',
        },
      ]),
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
        '48 hours, 3 burned-out sensors, and 1 working autonomous water-quality rover! Our team built an under-$65 solar sensor pod that maps lake turbidity and streams live telemetry to a student dashboard.',
      media_type: 'image',
      media_meta: JSON.stringify({ imageUrl: 'images/posts/hackathon-win.jpg' }),
      skill_tags: JSON.stringify(['Robotics', 'EmbeddedCPP', 'ClimateTech', 'Hardware']),
      likes_count: 412,
      comments_json: JSON.stringify([
        {
          id: 'c3',
          author: 'Kai Nakamura',
          avatar: 'emerald-scholar',
          text: 'Under $65 BOM is wild—congrats on taking 1st place!',
          time: '1h ago',
        },
      ]),
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
      category: 'project',
      title: 'Field Test #4 — AquaPulse Autonomous Solar Rover on the Lake',
      content:
        'Early morning lake test before first period! Live dissolved-oxygen and turbidity packets held a steady link at 180 meters from the dock.',
      media_type: 'image',
      media_meta: JSON.stringify({ imageUrl: 'images/posts/rover-lake.jpg' }),
      skill_tags: JSON.stringify(['IoT', 'SolarHardware', 'Python', 'FieldRobotics']),
      likes_count: 319,
      comments_json: JSON.stringify([]),
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
      media_meta: JSON.stringify({ imageUrl: 'images/teens/biotech-scientist.jpg' }),
      skill_tags: JSON.stringify(['BioInformatics', 'PyTorch', 'WetLab', 'OpenScience']),
      likes_count: 246,
      comments_json: JSON.stringify([]),
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
      media_meta: JSON.stringify({ imageUrl: 'images/posts/braille-app.jpg' }),
      skill_tags: JSON.stringify(['DesignSystems', 'UIUX', '3DArt', 'Accessibility']),
      likes_count: 198,
      comments_json: JSON.stringify([]),
      shares_count: 24,
      created_at: new Date(Date.now() - 1000 * 60 * 520).toISOString(),
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

  const seedMessages = [
    {
      id: 'm1',
      thread_id: 'thread-maya',
      sender_id: 'peer-maya',
      sender_name: 'Maya Lin',
      text: 'Hey! Saw your Solaris shader notes—want to team up for the Winter Youth Demo Day?',
      created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    },
    {
      id: 'm2',
      thread_id: 'thread-maya',
      sender_id: 'usr-demo-arav',
      sender_name: 'Arav Sharma',
      text: '100% down! I can bring the interactive camera rig and spring inspector panel.',
      created_at: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    },
    {
      id: 'm3',
      thread_id: 'thread-maya',
      sender_id: 'peer-maya',
      sender_name: 'Maya Lin',
      text: 'Awesome—dropping the repo branch tonight so we can test mobile touch controls.',
      created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      id: 'm4',
      thread_id: 'thread-rohan',
      sender_id: 'peer-rohan',
      sender_name: 'Rohan Mehta',
      text: 'Yo! Do you have 10 mins tomorrow to review the telemetry dashboard layout for our lake rover?',
      created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    },
    {
      id: 'm5',
      thread_id: 'thread-study',
      sender_id: 'peer-zara',
      sender_name: 'Zara Al-Mansoor',
      text: 'Uploaded the AP Calc + Linear Algebra intuition visualizers to the group folder!',
      created_at: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    },
    {
      id: 'm6',
      thread_id: 'thread-kai',
      sender_id: 'peer-kai',
      sender_name: 'Kai Nakamura',
      text: 'Are you applying to the Nebula Summer Research Fellowship? Application closes Friday!',
      created_at: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
    },
  ];
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, thread_id, sender_id, sender_name, text, attachment_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'null', ?)
  `);
  for (const m of seedMessages) {
    insertMsg.run(m.id, m.thread_id, m.sender_id, m.sender_name, m.text, m.created_at);
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 6 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function getAuthUser(req) {
  let token = '';
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/teenstack_session=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  if (!session) return null;
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  return userRow ? { row: userRow, user: sanitizeUser(userRow), token } : null;
}

function makeCookieHeader(token, rememberMe = true) {
  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
  return `teenstack_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const distPath = path.join(__dirname, '..', 'dist');

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    const method = req.method || 'GET';

    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, { ok: true, engine: 'node:sqlite', timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 200, { authenticated: false });
      const interactions = db
        .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
        .all(auth.user.id);
      return sendJson(res, 200, { authenticated: true, user: auth.user, interactions });
    }

    if (pathname === '/api/auth/signup' && method === 'POST') {
      const body = await readJsonBody(req);
      const { fullName, username: requestedUsername, email, phone, dob, age, password, marketingOptIn, acceptedTerms } = body;
      if (!fullName || !email || !password) {
        return sendJson(res, 400, { error: 'Full name, email address, and password are required.' });
      }
      if (!acceptedTerms) {
        return sendJson(res, 400, { error: 'Please accept the TeenStack Safety Charter & Privacy Terms.' });
      }
      if (String(password).length < 8) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters long.' });
      }

      const parsedAge =
        Number(age) || (dob ? Math.max(13, new Date().getFullYear() - new Date(dob).getFullYear()) : 16);
      if (parsedAge < 13) {
        return sendJson(res, 400, {
          error: 'TeenStack requires students to be at least 13 years old for COPPA safety compliance.',
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (existing) {
        return sendJson(res, 409, {
          error: 'An account with this email already exists. Switch to Log In instead.',
        });
      }

      const cleanRequested = String(requestedUsername || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase();
      if (cleanRequested && !/^[a-z0-9_.]{3,24}$/.test(cleanRequested)) {
        return sendJson(res, 400, {
          error: 'Username must be 3–24 characters using letters, numbers, underscores, or dots.',
        });
      }

      let username = cleanRequested;
      if (!username) {
        const baseHandle =
          String(fullName)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 18) || 'student';
        username = `${baseHandle}_${Math.floor(100 + Math.random() * 900)}`;
      } else {
        const takenUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
        if (takenUser) {
          return sendJson(res, 409, {
            error: 'That username is already taken. Please choose another.',
          });
        }
      }
      const id = `usr-${randomBytes(8).toString('hex')}`;

      const initialProfile = {
        subjects: [],
        educationLevel:
          parsedAge <= 14
            ? 'Middle / Early High School'
            : parsedAge <= 18
            ? 'High School Student'
            : 'Undergraduate / Gap Year',
        school: '',
        careerInterests: [],
        skills: [],
        generatedTags: ['#NewBuilder', '#TeenStackMember'],
        experienceYears: 0,
        projectsCompleted: 0,
        ratePerProject: '',
        targetClients: '',
        achievements: [],
        competitions: [],
        careerAim: '',
        desiredField: '',
        skillsToLearn: [],
        avatarUrl: '',
        avatarPreset: 'violet-coder',
        bio: '',
        portfolioUrl: '',
        portfolioProjects: [],
        privacy: {
          profileVisibility: 'students_only',
          dmPermission: parsedAge < 18 ? 'connections_only' : 'verified_students',
          hideContactInfo: true,
          guardianEmail: '',
          contentSafetyFilter: true,
        },
      };

      db.prepare(`
        INSERT INTO users (id, full_name, username, email, phone, dob, age, password_hash, marketing_opt_in, onboarding_step, onboarding_completed, profile_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(
        id,
        String(fullName).trim(),
        username,
        normalizedEmail,
        String(phone || '').trim(),
        String(dob || '').trim(),
        parsedAge,
        hashPassword(String(password)),
        marketingOptIn ? 1 : 0,
        JSON.stringify(initialProfile),
        new Date().toISOString()
      );

      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token,
        id,
        Date.now() + 1000 * 60 * 60 * 24 * 30
      );

      const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return sendJson(
        res,
        201,
        { user: sanitizeUser(userRow), token },
        { 'Set-Cookie': makeCookieHeader(token, true) }
      );
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const { identifier, password, rememberMe } = body;
      if (!identifier || !password) {
        return sendJson(res, 400, { error: 'Please enter your username or email and password.' });
      }
      const cleanId = String(identifier).trim().toLowerCase();
      const userRow = db
        .prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?')
        .get(cleanId, cleanId.replace(/^@/, ''));

      if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
        return sendJson(res, 401, {
          error: 'Invalid credentials. Try demo account arav@teenstack.edu / TeenStack@2026.',
        });
      }

      const token = randomBytes(32).toString('hex');
      const ttl = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token,
        userRow.id,
        Date.now() + ttl
      );

      const interactions = db
        .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
        .all(userRow.id);
      return sendJson(
        res,
        200,
        { user: sanitizeUser(userRow), token, interactions },
        { 'Set-Cookie': makeCookieHeader(token, Boolean(rememberMe)) }
      );
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const auth = getAuthUser(req);
      if (auth) db.prepare('DELETE FROM sessions WHERE token = ?').run(auth.token);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'teenstack_session=; HttpOnly; Path=/; Max-Age=0' });
    }

    if (pathname === '/api/onboarding' && method === 'PUT') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
      const body = await readJsonBody(req);
      const { step, completed, profilePatch, fullName } = body;

      let currentProfile = {};
      try {
        currentProfile = JSON.parse(auth.row.profile_json || '{}');
      } catch {
        currentProfile = {};
      }

      const mergedProfile = {
        ...currentProfile,
        ...(profilePatch || {}),
        privacy: {
          ...(currentProfile.privacy || {}),
          ...((profilePatch && profilePatch.privacy) || {}),
        },
      };

      const nextStep = typeof step === 'number' ? Math.max(1, Math.min(5, step)) : auth.row.onboarding_step;
      const nextCompleted = completed !== undefined ? (completed ? 1 : 0) : auth.row.onboarding_completed;
      const nextName = fullName ? String(fullName).trim() : auth.row.full_name;

      db.prepare(`
        UPDATE users
        SET full_name = ?, onboarding_step = ?, onboarding_completed = ?, profile_json = ?
        WHERE id = ?
      `).run(nextName, nextStep, nextCompleted, JSON.stringify(mergedProfile), auth.user.id);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
      return sendJson(res, 200, { user: sanitizeUser(updated) });
    }

    if (pathname === '/api/posts' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM posts ORDER BY datetime(created_at) DESC').all();
      const posts = rows.map((r) => ({
        id: r.id,
        authorId: r.author_id,
        authorName: r.author_name,
        authorHandle: r.author_handle,
        authorSchool: r.author_school,
        authorAvatar: r.author_avatar,
        category: r.category,
        title: r.title,
        content: r.content,
        mediaType: r.media_type,
        mediaMeta: JSON.parse(r.media_meta || '{}'),
        skillTags: JSON.parse(r.skill_tags || '[]'),
        likesCount: r.likes_count,
        comments: JSON.parse(r.comments_json || '[]'),
        sharesCount: r.shares_count,
        createdAt: r.created_at,
      }));
      return sendJson(res, 200, { posts });
    }

    if (pathname === '/api/posts' && method === 'POST') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 401, { error: 'Please sign in to publish.' });
      const body = await readJsonBody(req);
      const { category, title, content, mediaType, mediaMeta, skillTags } = body;
      if (!content || !String(content).trim()) {
        return sendJson(res, 400, { error: 'Content cannot be empty.' });
      }

      const id = `post-${randomBytes(6).toString('hex')}`;
      const schoolBadge = auth.user.profile.school
        ? `${auth.user.profile.school} · ${auth.user.age}`
        : `${auth.user.profile.educationLevel || 'TeenStack Builder'} · ${auth.user.age}`;

      db.prepare(`
        INSERT INTO posts (id, author_id, author_name, author_handle, author_school, author_avatar, category, title, content, media_type, media_meta, skill_tags, likes_count, comments_json, shares_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', 0, ?)
      `).run(
        id,
        auth.user.id,
        auth.user.fullName,
        `@${auth.user.username}`,
        schoolBadge,
        auth.user.profile.avatarUrl || auth.user.profile.avatarPreset || 'violet-coder',
        category || 'post',
        String(title || '').trim(),
        String(content).trim(),
        mediaType || 'none',
        JSON.stringify(mediaMeta || {}),
        JSON.stringify(Array.isArray(skillTags) ? skillTags : []),
        new Date().toISOString()
      );

      const r = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
      return sendJson(res, 201, {
        post: {
          id: r.id,
          authorId: r.author_id,
          authorName: r.author_name,
          authorHandle: r.author_handle,
          authorSchool: r.author_school,
          authorAvatar: r.author_avatar,
          category: r.category,
          title: r.title,
          content: r.content,
          mediaType: r.media_type,
          mediaMeta: JSON.parse(r.media_meta || '{}'),
          skillTags: JSON.parse(r.skill_tags || '[]'),
          likesCount: r.likes_count,
          comments: [],
          sharesCount: r.shares_count,
          createdAt: r.created_at,
        },
      });
    }

    const commentMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comment$/);
    if (commentMatch && method === 'POST') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
      const body = await readJsonBody(req);
      const { text } = body;
      if (!text || !String(text).trim()) return sendJson(res, 400, { error: 'Comment text required' });

      const postId = decodeURIComponent(commentMatch[1]);
      const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
      if (!row) return sendJson(res, 404, { error: 'Post not found' });

      const comments = JSON.parse(row.comments_json || '[]');
      comments.push({
        id: `c-${randomBytes(4).toString('hex')}`,
        author: auth.user.fullName,
        avatar: auth.user.profile.avatarUrl || auth.user.profile.avatarPreset || 'violet-coder',
        text: String(text).trim(),
        time: 'Just now',
      });
      db.prepare('UPDATE posts SET comments_json = ? WHERE id = ?').run(JSON.stringify(comments), postId);
      return sendJson(res, 200, { comments });
    }

    if (pathname === '/api/interactions/toggle' && method === 'POST') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
      const body = await readJsonBody(req);
      const { targetType, targetId, meta } = body;
      if (!targetType || !targetId) return sendJson(res, 400, { error: 'Invalid interaction target' });

      const existing = db
        .prepare('SELECT * FROM user_interactions WHERE user_id = ? AND target_type = ? AND target_id = ?')
        .get(auth.user.id, targetType, targetId);

      let active = false;
      if (existing) {
        db.prepare('DELETE FROM user_interactions WHERE user_id = ? AND target_type = ? AND target_id = ?').run(
          auth.user.id,
          targetType,
          targetId
        );
        if (targetType === 'like') {
          db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(targetId);
        }
      } else {
        db.prepare('INSERT INTO user_interactions (user_id, target_type, target_id, meta_json) VALUES (?, ?, ?, ?)').run(
          auth.user.id,
          targetType,
          targetId,
          JSON.stringify(meta || {})
        );
        active = true;
        if (targetType === 'like') {
          db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(targetId);
        }
      }

      const interactions = db
        .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
        .all(auth.user.id);
      return sendJson(res, 200, { active, interactions });
    }

    if (pathname === '/api/messages' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM messages ORDER BY datetime(created_at) ASC').all();
      return sendJson(res, 200, {
        messages: rows.map((m) => ({
          id: m.id,
          threadId: m.thread_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          text: m.text,
          createdAt: m.created_at,
        })),
      });
    }

    if (pathname === '/api/messages' && method === 'POST') {
      const auth = getAuthUser(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
      const body = await readJsonBody(req);
      const { threadId, text } = body;
      if (!threadId || !text || !String(text).trim()) {
        return sendJson(res, 400, { error: 'Message text required' });
      }
      const cleanText = String(text).trim();
      const id = `msg-${randomBytes(6).toString('hex')}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        'INSERT INTO messages (id, thread_id, sender_id, sender_name, text, attachment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, threadId, auth.user.id, auth.user.fullName, cleanText, 'null', createdAt);

      return sendJson(res, 201, {
        message: {
          id,
          threadId,
          senderId: auth.user.id,
          senderName: auth.user.fullName,
          text: cleanText,
          createdAt,
        },
      });
    }

    // Serve static production frontend from dist/
    if (fs.existsSync(distPath)) {
      const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const candidate = path.resolve(distPath, safeRel);
      if (candidate.startsWith(distPath) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const cacheControl = pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : pathname.startsWith('/images/')
          ? 'public, max-age=86400'
          : 'no-cache';
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': cacheControl,
        });
        fs.createReadStream(candidate).pipe(res);
        return;
      }
      // SPA fallback
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexHtml).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[TeenStack Error]', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[TeenStack Server] Running native Node HTTP + SQLite on http://127.0.0.1:${PORT}`);
});
