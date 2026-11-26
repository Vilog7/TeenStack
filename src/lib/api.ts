import type {
  FeedPost,
  UserAccount,
  UserInteraction,
  ChatMessage,
  ChatThread,
  PeerStudent,
  OpportunityItem,
  CourseItem,
  StudentVerificationOverview,
  ParentPortalState,
} from '../types';
import {
  PEER_STUDENTS,
  OPPORTUNITIES,
  COURSES,
  CHAT_THREADS,
  INITIAL_NOTIFICATIONS,
} from '../data/catalog';

const TOKEN_KEY = 'teenstack_auth_token';
const PARENT_SESSION_KEY = 'teenstack_parent_portal_token';
const STATIC_USERS_KEY = 'teenstack_static_users_v2';
const STATIC_CURRENT_USER_ID_KEY = 'teenstack_static_uid_v2';
const STATIC_POSTS_KEY = 'teenstack_static_posts_v2';
const STATIC_MESSAGES_KEY = 'teenstack_static_messages_v2';
const STATIC_INTERACTIONS_KEY = 'teenstack_static_interactions_v2';
const STATIC_PARENT_INVITES_KEY = 'teenstack_static_parent_invites_v1';

const DEFAULT_DEMO_USER: UserAccount & { passwordPlain?: string } = {
  id: 'usr-demo-arav',
  fullName: 'Arav Sharma',
  username: 'arav_dev',
  email: 'arav@teenstack.edu',
  phone: '••••••4312',
  rawPhone: '+91 98201 44312',
  dob: '2009-05-14',
  declaredDob: '2009-05-14',
  verifiedAgeBand: 'VERIFIED_13_17',
  accountStatus: 'ACTIVE',
  age: 17,
  marketingOptIn: false,
  onboardingStep: 5,
  onboardingCompleted: true,
  passwordPlain: 'TeenStack@2026',
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  profile: {
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
    ],
    privacy: {
      profileVisibility: 'students_only',
      dmPermission: 'verified_students',
      hideContactInfo: true,
      guardianEmail: 'parent.sharma@example.com',
      contentSafetyFilter: true,
    },
  },
};

export const INITIAL_SEED_POSTS: FeedPost[] = [
  {
    id: 'post-solaris-1',
    authorId: 'peer-maya',
    authorName: 'Maya Lin',
    authorHandle: '@mayalin_gfx',
    authorSchool: 'Bayview Arts & Tech · 17',
    authorAvatar: 'cyan-creator',
    category: 'project',
    title: 'Solaris Horizon — Real-Time 3D Terrain & Atmospheric Shader v2.0',
    content:
      'Finally shipped v2 of our interactive physics & terrain renderer! Students can tweak sun elevation, atmospheric scattering, and ridge erosion live at 60fps. Looking for 2 UI/audio collaborators before Winter Youth Demo Day.',
    mediaType: 'image',
    mediaMeta: { imageUrl: 'images/posts/shader-desk.jpg' },
    skillTags: ['WebGL', 'Shaders', 'PhysicsSim', 'TypeScript'],
    likesCount: 284,
    comments: [
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
    ],
    sharesCount: 34,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'post-rohan-2',
    authorId: 'peer-rohan',
    authorName: 'Rohan Mehta',
    authorHandle: '@rohan_builds',
    authorSchool: 'Delhi Public STEM · 16',
    authorAvatar: 'blue-builder',
    category: 'achievement',
    title: 'Won 1st Place Hardware Track @ Youth Climate Hack!',
    content:
      '48 hours, 3 burned-out sensors, and 1 working autonomous water-quality rover! Our team built an under-$65 solar sensor pod that maps lake turbidity and streams live telemetry to a student dashboard.',
    mediaType: 'image',
    mediaMeta: { imageUrl: 'images/posts/hackathon-win.jpg' },
    skillTags: ['Robotics', 'EmbeddedCPP', 'ClimateTech', 'Hardware'],
    likesCount: 412,
    comments: [
      {
        id: 'c3',
        author: 'Kai Nakamura',
        avatar: 'emerald-scholar',
        text: 'Under $65 BOM is wild—congrats on taking 1st place!',
        time: '1h ago',
      },
    ],
    sharesCount: 58,
    createdAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
  },
  {
    id: 'post-rover-field',
    authorId: 'peer-rohan',
    authorName: 'Rohan Mehta',
    authorHandle: '@rohan_builds',
    authorSchool: 'Delhi Public STEM · 16',
    authorAvatar: 'blue-builder',
    category: 'project',
    title: 'Field Test #4 — AquaPulse Autonomous Solar Rover on the Lake',
    content:
      'Early morning lake test before first period! Live dissolved-oxygen and turbidity packets held a steady link at 180 meters from the dock.',
    mediaType: 'image',
    mediaMeta: { imageUrl: 'images/posts/rover-lake.jpg' },
    skillTags: ['IoT', 'SolarHardware', 'Python', 'FieldRobotics'],
    likesCount: 319,
    comments: [],
    sharesCount: 27,
    createdAt: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
  },
  {
    id: 'post-zara-3',
    authorId: 'peer-zara',
    authorName: 'Zara Al-Mansoor',
    authorHandle: '@zara_ml',
    authorSchool: 'Oakridge International · 18',
    authorAvatar: 'amber-innovator',
    category: 'tutorial',
    title: 'Microfluidic Assay + Neural Cellular Automata Lab Notes',
    content:
      'Paired our wet-lab microfluidic fluorescence imaging with a 300-line PyTorch cellular automata model to predict pattern regeneration. Open-sourced the full notebook for AP Bio & ISEF students!',
    mediaType: 'image',
    mediaMeta: { imageUrl: 'images/teens/biotech-scientist.jpg' },
    skillTags: ['BioInformatics', 'PyTorch', 'WetLab', 'OpenScience'],
    likesCount: 246,
    comments: [],
    sharesCount: 51,
    createdAt: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
  },
  {
    id: 'post-ananya-4',
    authorId: 'peer-ananya',
    authorName: 'Ananya Iyer',
    authorHandle: '@ananya_ux',
    authorSchool: 'Meridian Design High · 16',
    authorAvatar: 'visual-creator',
    category: 'project',
    title: 'Spatial Pen-Display UI Kit & Tactile Vector Brushes',
    content:
      'Prototyping custom pressure-sensitive vector ribbon brushes and accessible high-contrast UI tokens in our studio tonight. Open to design-system collabs!',
    mediaType: 'image',
    mediaMeta: { imageUrl: 'images/posts/braille-app.jpg' },
    skillTags: ['DesignSystems', 'UIUX', '3DArt', 'Accessibility'],
    likesCount: 198,
    comments: [],
    sharesCount: 24,
    createdAt: new Date(Date.now() - 1000 * 60 * 520).toISOString(),
  },
];

const INITIAL_SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    threadId: 'thread-maya',
    senderId: 'peer-maya',
    senderName: 'Maya Lin',
    text: 'Hey! Saw your Solaris shader notes—want to team up for the Winter Youth Demo Day?',
    createdAt: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  },
  {
    id: 'm2',
    threadId: 'thread-maya',
    senderId: 'usr-demo-arav',
    senderName: 'Arav Sharma',
    text: '100% down! I can bring the interactive camera rig and spring inspector panel.',
    createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
  },
  {
    id: 'm3',
    threadId: 'thread-maya',
    senderId: 'peer-maya',
    senderName: 'Maya Lin',
    text: 'Awesome—dropping the repo branch tonight so we can test mobile touch controls.',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'm4',
    threadId: 'thread-rohan',
    senderId: 'peer-rohan',
    senderName: 'Rohan Mehta',
    text: 'Yo! Do you have 10 mins tomorrow to review the telemetry dashboard layout for our lake rover?',
    createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
  },
  {
    id: 'm5',
    threadId: 'thread-study',
    senderId: 'peer-zara',
    senderName: 'Zara Al-Mansoor',
    text: 'Uploaded the AP Calc + Linear Algebra intuition visualizers to the group folder!',
    createdAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
  },
  {
    id: 'm6',
    threadId: 'thread-kai',
    senderId: 'peer-kai',
    senderName: 'Kai Nakamura',
    text: 'Are you applying to the Nebula Summer Research Fellowship? Application closes Friday!',
    createdAt: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
  },
];

function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// Helpers for persistent static fallback DB (used automatically on GitHub Pages!)
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getStaticUsers(): (UserAccount & { passwordPlain?: string })[] {
  const list = loadJson<(UserAccount & { passwordPlain?: string })[]>(STATIC_USERS_KEY, []);
  if (list.length === 0) {
    saveJson(STATIC_USERS_KEY, [DEFAULT_DEMO_USER]);
    return [DEFAULT_DEMO_USER];
  }
  return list;
}

function getStaticPosts(): FeedPost[] {
  const list = loadJson<FeedPost[]>(STATIC_POSTS_KEY, []);
  if (list.length === 0) {
    saveJson(STATIC_POSTS_KEY, INITIAL_SEED_POSTS);
    return INITIAL_SEED_POSTS;
  }
  return list;
}

function getStaticMessages(): ChatMessage[] {
  const list = loadJson<ChatMessage[]>(STATIC_MESSAGES_KEY, []);
  if (list.length === 0) {
    saveJson(STATIC_MESSAGES_KEY, INITIAL_SEED_MESSAGES);
    return INITIAL_SEED_MESSAGES;
  }
  return list;
}

const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (isGitHubPages) {
    throw new Error('STATIC_HOST');
  }
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('STATIC_HOST');
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    (err as any).isApiError = true;
    throw err;
  }
  return data as T;
}

export const api = {
  async me(): Promise<{ authenticated: boolean; user?: UserAccount; interactions?: UserInteraction[] }> {
    try {
      return await request('/api/auth/me');
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY);
      if (!uid) return { authenticated: false };
      const users = getStaticUsers();
      const found = users.find((u) => u.id === uid);
      if (!found) return { authenticated: false };
      const interactions = loadJson<UserInteraction[]>(`${STATIC_INTERACTIONS_KEY}_${uid}`, []);
      return { authenticated: true, user: found, interactions };
    }
  },

  async login(payload: { identifier: string; password: string; rememberMe: boolean }) {
    try {
      const res = await request<{ user: UserAccount; token: string; interactions: UserInteraction[] }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setStoredToken(res.token);
      localStorage.setItem(STATIC_CURRENT_USER_ID_KEY, res.user.id);
      return res;
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const clean = payload.identifier.trim().toLowerCase().replace(/^@/, '');
      const users = getStaticUsers();
      const found = users.find(
        (u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
      );
      if (!found || (found.passwordPlain && found.passwordPlain !== payload.password)) {
        throw new Error('Invalid credentials. Try demo account arav@teenstack.edu / TeenStack@2026.');
      }
      const token = `static-tok-${Date.now()}`;
      setStoredToken(token);
      localStorage.setItem(STATIC_CURRENT_USER_ID_KEY, found.id);
      const interactions = loadJson<UserInteraction[]>(`${STATIC_INTERACTIONS_KEY}_${found.id}`, []);
      return { user: found, token, interactions };
    }
  },

  async signup(payload: {
    fullName: string;
    username: string;
    email: string;
    phone: string;
    dob: string;
    age: number;
    password: string;
    marketingOptIn: boolean;
    acceptedTerms: boolean;
  }) {
    try {
      const res = await request<{ user: UserAccount; token: string }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStoredToken(res.token);
      localStorage.setItem(STATIC_CURRENT_USER_ID_KEY, res.user.id);
      return res;
    } catch (err: any) {
      if (err?.isApiError) throw err;
      if (payload.password.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }
      const cleanUsername = payload.username.trim().replace(/^@+/, '').toLowerCase();
      if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
        throw new Error('Username must be 3–24 characters using letters, numbers, underscores, or dots.');
      }
      const users = getStaticUsers();
      const cleanEmail = payload.email.trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        throw new Error('An account with this email already exists. Switch to Log In instead.');
      }
      if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
        throw new Error('That username is already taken. Please choose another.');
      }
      const newUser: UserAccount & { passwordPlain?: string } = {
        id: `usr-${Date.now()}`,
        fullName: payload.fullName.trim(),
        username: cleanUsername,
        email: cleanEmail,
        phone: payload.phone ? `••••••${payload.phone.replace(/\D+/g, '').slice(-4)}` : '',
        rawPhone: payload.phone,
        dob: payload.dob,
        declaredDob: payload.dob,
        verifiedAgeBand: 'UNVERIFIED',
        accountStatus: 'PENDING_VERIFICATION',
        verificationOverview: {
          accountStatus: 'PENDING_VERIFICATION',
          verifiedAgeBand: 'UNVERIFIED',
          environmentMode: 'sandbox_mock',
          productionActivationDisabled: true,
          ageVerification: null,
          parentVerification: null,
          parentalConsent: null,
        },
        age: payload.age || 16,
        marketingOptIn: false,
        onboardingStep: 1,
        onboardingCompleted: false,
        passwordPlain: payload.password,
        createdAt: new Date().toISOString(),
        profile: {
          subjects: [],
          educationLevel: 'High School Student',
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
            dmPermission: 'connections_only',
            hideContactInfo: true,
            guardianEmail: '',
            contentSafetyFilter: true,
          },
        },
      };
      users.push(newUser);
      saveJson(STATIC_USERS_KEY, users);
      const token = `static-tok-${Date.now()}`;
      setStoredToken(token);
      localStorage.setItem(STATIC_CURRENT_USER_ID_KEY, newUser.id);
      return { user: newUser, token };
    }
  },

  async logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken('');
    localStorage.removeItem(STATIC_CURRENT_USER_ID_KEY);
  },

  async saveOnboarding(payload: {
    step?: number;
    completed?: boolean;
    fullName?: string;
    profilePatch?: Partial<UserAccount['profile']>;
  }) {
    try {
      return await request<{ user: UserAccount }>('/api/onboarding', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const users = getStaticUsers();
      const idx = users.findIndex((u) => u.id === uid);
      const target = idx >= 0 ? users[idx] : DEFAULT_DEMO_USER;
      const updated: UserAccount & { passwordPlain?: string } = {
        ...target,
        fullName: payload.fullName ? payload.fullName.trim() : target.fullName,
        onboardingStep: payload.step ?? target.onboardingStep,
        onboardingCompleted:
          payload.completed !== undefined ? payload.completed : target.onboardingCompleted,
        profile: {
          ...target.profile,
          ...(payload.profilePatch || {}),
          privacy: {
            ...target.profile.privacy,
            ...(payload.profilePatch?.privacy || {}),
          },
        },
      };
      if (idx >= 0) users[idx] = updated;
      else users.push(updated);
      saveJson(STATIC_USERS_KEY, users);
      return { user: updated };
    }
  },

  async getPosts(): Promise<{ posts: FeedPost[] }> {
    try {
      return await request('/api/posts');
    } catch {
      return { posts: getStaticPosts() };
    }
  },

  async createPost(payload: {
    category: FeedPost['category'];
    title: string;
    content: string;
    mediaType: FeedPost['mediaType'];
    mediaMeta?: Record<string, any>;
    skillTags: string[];
  }): Promise<{ post: FeedPost }> {
    try {
      return await request('/api/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const users = getStaticUsers();
      const author = users.find((u) => u.id === uid) || DEFAULT_DEMO_USER;
      const newPost: FeedPost = {
        id: `post-${Date.now()}`,
        authorId: author.id,
        authorName: author.fullName,
        authorHandle: `@${author.username}`,
        authorSchool: `${author.profile.school || author.profile.educationLevel} · ${author.age}`,
        authorAvatar: author.profile.avatarUrl || author.profile.avatarPreset || 'violet-coder',
        category: payload.category,
        title: payload.title,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaMeta: payload.mediaMeta || {},
        skillTags: payload.skillTags,
        likesCount: 1,
        comments: [],
        sharesCount: 0,
        createdAt: new Date().toISOString(),
      };
      const posts = [newPost, ...getStaticPosts()];
      saveJson(STATIC_POSTS_KEY, posts);
      return { post: newPost };
    }
  },

  async commentPost(postId: string, text: string) {
    try {
      return await request<{ comments: FeedPost['comments'] }>(`/api/posts/${postId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const author = getStaticUsers().find((u) => u.id === uid) || DEFAULT_DEMO_USER;
      const posts = getStaticPosts();
      const target = posts.find((p) => p.id === postId);
      const nextComment = {
        id: `c-${Date.now()}`,
        author: author.fullName,
        avatar: author.profile.avatarUrl || author.profile.avatarPreset || 'violet-coder',
        text,
        time: 'Just now',
      };
      const nextComments = target ? [...target.comments, nextComment] : [nextComment];
      if (target) {
        target.comments = nextComments;
        saveJson(STATIC_POSTS_KEY, posts);
      }
      return { comments: nextComments };
    }
  },

  async toggleInteraction(targetType: string, targetId: string, meta?: Record<string, any>) {
    try {
      return await request<{ active: boolean; interactions: UserInteraction[] }>(
        '/api/interactions/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ targetType, targetId, meta }),
        }
      );
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const key = `${STATIC_INTERACTIONS_KEY}_${uid}`;
      const list = loadJson<UserInteraction[]>(key, []);
      const idx = list.findIndex(
        (x) => x.target_type === targetType && x.target_id === targetId
      );
      let active = false;
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push({ target_type: targetType, target_id: targetId, meta_json: JSON.stringify(meta || {}) });
        active = true;
      }
      saveJson(key, list);
      if (targetType === 'like') {
        const posts = getStaticPosts();
        const p = posts.find((x) => x.id === targetId);
        if (p) {
          p.likesCount = Math.max(0, p.likesCount + (active ? 1 : -1));
          saveJson(STATIC_POSTS_KEY, posts);
        }
      }
      return { active, interactions: list };
    }
  },

  async getMessages(): Promise<{ messages: ChatMessage[] }> {
    try {
      return await request('/api/messages');
    } catch {
      return { messages: getStaticMessages() };
    }
  },

  async sendMessage(threadId: string, text: string): Promise<{ message: ChatMessage }> {
    try {
      return await request('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ threadId, text }),
      });
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const sender = getStaticUsers().find((u) => u.id === uid) || DEFAULT_DEMO_USER;
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        threadId,
        senderId: sender.id,
        senderName: sender.fullName,
        text,
        createdAt: new Date().toISOString(),
      };
      const all = [...getStaticMessages(), msg];
      saveJson(STATIC_MESSAGES_KEY, all);
      return { message: msg };
    }
  },

  // ===========================================================================
  // SIGNZY AGE VERIFICATION & PARENTAL CONSENT CLIENT API
  // ===========================================================================
  getStoredParentSessionToken(): string {
    try {
      return sessionStorage.getItem(PARENT_SESSION_KEY) || '';
    } catch {
      return '';
    }
  },

  setStoredParentSessionToken(token: string) {
    try {
      if (token) sessionStorage.setItem(PARENT_SESSION_KEY, token);
      else sessionStorage.removeItem(PARENT_SESSION_KEY);
    } catch {
      // ignore
    }
  },

  async getVerificationStatus(): Promise<{
    user: UserAccount;
    overview: StudentVerificationOverview;
  }> {
    try {
      return await request('/api/verification/status');
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const found = getStaticUsers().find((u) => u.id === uid) || DEFAULT_DEMO_USER;
      const overview: StudentVerificationOverview = found.verificationOverview || {
        accountStatus: found.accountStatus || 'ACTIVE',
        verifiedAgeBand: found.verifiedAgeBand || 'VERIFIED_13_17',
        environmentMode: 'sandbox_mock',
        productionActivationDisabled: true,
        ageVerification: null,
        parentVerification: null,
        parentalConsent: null,
      };
      return { user: { ...found, verificationOverview: overview }, overview };
    }
  },

  async initiateAgeVerification(idempotencyKey: string): Promise<{
    verificationSessionId: string;
    status: string;
    hostedUrl: string;
    expiresAt: string;
    isSandboxMock: boolean;
  }> {
    try {
      return await request('/api/verification/age/initiate', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const users = getStaticUsers();
      const idx = users.findIndex((u) => u.id === uid);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      if (idx >= 0) {
        const prev = users[idx];
        const ov: StudentVerificationOverview = prev.verificationOverview || {
          accountStatus: prev.accountStatus || 'PENDING_VERIFICATION',
          verifiedAgeBand: prev.verifiedAgeBand || 'UNVERIFIED',
          environmentMode: 'sandbox_mock',
          productionActivationDisabled: true,
          ageVerification: null,
          parentVerification: null,
          parentalConsent: null,
        };
        ov.ageVerification = {
          status: 'PENDING',
          verifiedAgeBand: 'UNVERIFIED',
          hostedUrl: '',
          expiresAt,
          isSandboxMock: true,
        };
        users[idx] = { ...prev, verificationOverview: ov };
        saveJson(STATIC_USERS_KEY, users);
      }
      return {
        verificationSessionId: `agv-static-${Date.now()}`,
        status: 'PENDING',
        hostedUrl: '',
        expiresAt,
        isSandboxMock: true,
      };
    }
  },

  async pollAgeVerification(): Promise<{ user: UserAccount }> {
    return request('/api/verification/age/poll', { method: 'POST', body: '{}' });
  },

  async simulateSandboxAgeVerification(scenario: string): Promise<{
    user: UserAccount;
    overview: StudentVerificationOverview;
  }> {
    try {
      return await request('/api/verification/age/sandbox-simulate', {
        method: 'POST',
        body: JSON.stringify({ scenario }),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const users = getStaticUsers();
      const idx = users.findIndex((u) => u.id === uid);
      const target = idx >= 0 ? users[idx] : DEFAULT_DEMO_USER;

      let nextStatus: UserAccount['accountStatus'] = 'VERIFICATION_FAILED';
      let nextBand: UserAccount['verifiedAgeBand'] = 'UNVERIFIED';
      let ageVerifStatus: NonNullable<StudentVerificationOverview['ageVerification']>['status'] =
        'VERIFICATION_FAILED';

      if (scenario === 'VERIFIED_13_17') {
        nextStatus = 'AGE_VERIFIED_AWAITING_PARENT';
        nextBand = 'VERIFIED_13_17';
        ageVerifStatus = 'VERIFIED_13_17';
      } else if (scenario === 'VERIFIED_18_PLUS') {
        nextStatus = 'ACTIVE';
        nextBand = 'VERIFIED_18_PLUS';
        ageVerifStatus = 'VERIFIED_18_PLUS';
      } else if (scenario === 'UNDER_13') {
        nextStatus = 'REJECTED_UNDER_13';
        nextBand = 'UNDER_13';
        ageVerifStatus = 'UNDER_13';
      } else if (scenario === 'NAME_MISMATCH' || scenario === 'MANUAL_REVIEW') {
        nextStatus = 'MANUAL_REVIEW';
        nextBand = 'UNVERIFIED';
        ageVerifStatus = 'MANUAL_REVIEW';
      }

      const ov: StudentVerificationOverview = {
        accountStatus: nextStatus,
        verifiedAgeBand: nextBand,
        environmentMode: 'sandbox_mock',
        productionActivationDisabled: true,
        ageVerification: {
          status: ageVerifStatus,
          verifiedAgeBand: nextBand,
          hostedUrl: '',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          completedAt: new Date().toISOString(),
          isSandboxMock: true,
        },
        parentVerification: target.verificationOverview?.parentVerification || null,
        parentalConsent: target.verificationOverview?.parentalConsent || null,
      };

      const updated = {
        ...target,
        accountStatus: nextStatus,
        verifiedAgeBand: nextBand,
        verificationOverview: ov,
      };
      if (idx >= 0) {
        users[idx] = updated;
        saveJson(STATIC_USERS_KEY, users);
      }
      return { user: updated, overview: ov };
    }
  },

  async inviteParentVerification(payload: {
    parentEmail: string;
    parentMobile: string;
  }): Promise<{
    parentVerificationId: string;
    inviteExpiresAt: string;
    maskedParentMobile: string;
    sandboxPortalInviteToken?: string;
    user: UserAccount;
  }> {
    try {
      return await request('/api/verification/parent/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const users = getStaticUsers();
      const idx = users.findIndex((u) => u.id === uid);
      const student = idx >= 0 ? users[idx] : DEFAULT_DEMO_USER;
      const normMobile = (s: string) => s.replace(/\D+/g, '').replace(/^91(?=\d{10}$)/, '');

      if (
        payload.parentEmail.trim().toLowerCase() === student.email.trim().toLowerCase() ||
        normMobile(payload.parentMobile) === normMobile(student.rawPhone || '')
      ) {
        throw new Error(
          "Parent's mobile number and email address must belong to your parent or legal guardian and cannot match the student's contact details."
        );
      }

      const token = `sbx_inv_${Date.now()}`;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      invites[token] = {
        id: `prv-${Date.now()}`,
        studentId: student.id,
        parentName: '',
        parentEmail: payload.parentEmail.trim(),
        parentMobile: payload.parentMobile.trim(),
        relationshipType: 'UNSPECIFIED',
        adultVerificationStatus: 'PENDING',
        authorityVerificationStatus: 'PENDING',
        consumed: false,
        expiresAt: Date.now() + 30 * 60 * 1000,
        consent: null,
      };
      saveJson(STATIC_PARENT_INVITES_KEY, invites);

      const masked = `••••••${payload.parentMobile.replace(/\D+/g, '').slice(-4)}`;
      const ov: StudentVerificationOverview = {
        ...(student.verificationOverview || {
          accountStatus: 'AGE_VERIFIED_AWAITING_PARENT',
          verifiedAgeBand: 'VERIFIED_13_17',
          environmentMode: 'sandbox_mock',
          productionActivationDisabled: true,
          ageVerification: null,
          parentalConsent: null,
        }),
        parentVerification: {
          initiated: true,
          maskedParentMobile: masked,
          relationshipType: 'UNSPECIFIED',
          inviteConsumed: false,
          inviteExpired: false,
          adultVerificationStatus: 'PENDING',
          authorityVerificationStatus: 'PENDING',
        },
      };
      const updated = { ...student, verificationOverview: ov };
      if (idx >= 0) {
        users[idx] = updated;
        saveJson(STATIC_USERS_KEY, users);
      }

      return {
        parentVerificationId: invites[token].id,
        inviteExpiresAt: new Date(invites[token].expiresAt).toISOString(),
        maskedParentMobile: masked,
        sandboxPortalInviteToken: token,
        user: updated,
      };
    }
  },

  async exchangeParentInviteToken(inviteToken: string): Promise<{
    parentSessionToken: string;
    parentVerificationId: string;
  }> {
    try {
      const res = await request<{ parentSessionToken: string; parentVerificationId: string }>(
        '/api/parent-portal/session/exchange',
        {
          method: 'POST',
          body: JSON.stringify({ inviteToken }),
        }
      );
      this.setStoredParentSessionToken(res.parentSessionToken);
      return res;
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const entry = invites[inviteToken];
      if (!entry) throw new Error('Parent verification link is invalid or was not found.');
      if (entry.consumed) {
        throw new Error('This single-use parent verification link has already been used.');
      }
      if (entry.expiresAt <= Date.now()) {
        throw new Error('This parent verification link has expired.');
      }
      entry.consumed = true;
      const pSession = `psess_${Date.now()}`;
      entry.sessionToken = pSession;
      saveJson(STATIC_PARENT_INVITES_KEY, invites);
      this.setStoredParentSessionToken(pSession);
      return { parentSessionToken: pSession, parentVerificationId: entry.id };
    }
  },

  async getParentPortalState(parentSessionToken: string): Promise<ParentPortalState> {
    try {
      return await request('/api/parent-portal/state', {
        headers: { 'X-Parent-Session': parentSessionToken },
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const entry = Object.values(invites).find((x: any) => x.sessionToken === parentSessionToken);
      if (!entry) throw new Error('Valid parent verification session required.');
      const student =
        getStaticUsers().find((u) => u.id === entry.studentId) || DEFAULT_DEMO_USER;
      return {
        consentVersion: 'DPDP-TEENSTACK-CONSENT-v2026.1',
        environmentMode: 'sandbox_mock',
        productionActivationDisabled: true,
        student: {
          fullName: student.fullName,
          username: student.username,
          verifiedAgeBand: student.verifiedAgeBand || 'VERIFIED_13_17',
          accountStatus: student.accountStatus || 'AGE_VERIFIED_AWAITING_PARENT',
        },
        parentVerification: {
          id: entry.id,
          parentName: entry.parentName,
          parentEmail: entry.parentEmail,
          parentMobile: entry.parentMobile,
          relationshipType: entry.relationshipType,
          adultVerificationStatus: entry.adultVerificationStatus,
          authorityVerificationStatus: entry.authorityVerificationStatus,
        },
        consent: entry.consent,
      };
    }
  },

  async submitParentDetails(
    parentSessionToken: string,
    payload: {
      parentName: string;
      parentMobile: string;
      parentEmail: string;
      relationshipType: 'MOTHER' | 'FATHER' | 'COURT_APPOINTED_GUARDIAN';
    }
  ) {
    try {
      return await request('/api/parent-portal/details', {
        method: 'POST',
        headers: { 'X-Parent-Session': parentSessionToken },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const key = Object.keys(invites).find((k) => invites[k].sessionToken === parentSessionToken);
      if (!key) throw new Error('Parent session expired.');
      const entry = invites[key];
      const student = getStaticUsers().find((u) => u.id === entry.studentId);
      if (
        student &&
        (payload.parentEmail.toLowerCase() === student.email.toLowerCase() ||
          payload.parentName.trim().toLowerCase() === student.fullName.trim().toLowerCase())
      ) {
        throw new Error('Parent details cannot match the student name or contact details.');
      }
      entry.parentName = payload.parentName;
      entry.parentMobile = payload.parentMobile;
      entry.parentEmail = payload.parentEmail;
      entry.relationshipType = payload.relationshipType;
      saveJson(STATIC_PARENT_INVITES_KEY, invites);
      return { parentVerification: entry };
    }
  },

  async verifyParentIdentity(
    parentSessionToken: string,
    payload: { scenario: string; sandboxAuthorityVerified: boolean }
  ): Promise<{
    adultVerificationStatus: string;
    authorityVerificationStatus: string;
    hostedUrl?: string;
  }> {
    try {
      return await request('/api/parent-portal/verify-identity', {
        method: 'POST',
        headers: { 'X-Parent-Session': parentSessionToken },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const key = Object.keys(invites).find((k) => invites[k].sessionToken === parentSessionToken);
      if (!key) throw new Error('Parent session expired.');
      const entry = invites[key];
      entry.adultVerificationStatus =
        payload.scenario === 'ADULT_18_PLUS' ? 'VERIFIED_18_PLUS' : 'VERIFICATION_FAILED';
      entry.authorityVerificationStatus =
        entry.adultVerificationStatus === 'VERIFIED_18_PLUS' && payload.sandboxAuthorityVerified
          ? 'SANDBOX_VERIFIED'
          : 'AWAITING_LEGAL_AUTHORITY_CHECK';
      saveJson(STATIC_PARENT_INVITES_KEY, invites);
      return {
        adultVerificationStatus: entry.adultVerificationStatus,
        authorityVerificationStatus: entry.authorityVerificationStatus,
      };
    }
  },

  async submitParentalConsent(
    parentSessionToken: string,
    payload: {
      decision: 'APPROVED' | 'REJECTED';
      consentVersion: string;
      acknowledgements: {
        purposeAndDataCollection: boolean;
        privacyAndSafetyPolicy: boolean;
        retentionAndWithdrawalRights: boolean;
      };
    }
  ): Promise<{
    consentTransactionId: string;
    consentStatus: 'APPROVED' | 'REJECTED';
    consentVersion: string;
    consentTimestamp: string;
    studentAccountStatus: string;
    withdrawalToken?: string | null;
  }> {
    try {
      return await request('/api/parent-portal/consent', {
        method: 'POST',
        headers: { 'X-Parent-Session': parentSessionToken },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      if (
        payload.decision === 'APPROVED' &&
        (!payload.acknowledgements.purposeAndDataCollection ||
          !payload.acknowledgements.privacyAndSafetyPolicy ||
          !payload.acknowledgements.retentionAndWithdrawalRights)
      ) {
        throw new Error(
          'Explicit informed consent requires acknowledging all three TeenStack DPDP disclosures.'
        );
      }
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const key = Object.keys(invites).find((k) => invites[k].sessionToken === parentSessionToken);
      if (!key) throw new Error('Parent session expired.');
      const entry = invites[key];
      const txId = `csnt_${Date.now()}`;
      const wTok = payload.decision === 'APPROVED' ? `wdr_${Date.now()}` : null;
      const nowIso = new Date().toISOString();
      entry.consent = {
        consentTransactionId: txId,
        consentStatus: payload.decision,
        consentVersion: payload.consentVersion,
        consentTimestamp: nowIso,
        withdrawalToken: wTok,
      };
      saveJson(STATIC_PARENT_INVITES_KEY, invites);

      const users = getStaticUsers();
      const sIdx = users.findIndex((u) => u.id === entry.studentId);
      const nextStatus = payload.decision === 'APPROVED' ? 'ACTIVE' : 'PARENT_REJECTED';
      if (sIdx >= 0) {
        users[sIdx] = {
          ...users[sIdx],
          accountStatus: nextStatus,
          verificationOverview: {
            ...(users[sIdx].verificationOverview as StudentVerificationOverview),
            accountStatus: nextStatus,
            parentalConsent: {
              consentTransactionId: txId,
              status: payload.decision,
              consentVersion: payload.consentVersion,
              consentTimestamp: nowIso,
            },
          },
        };
        saveJson(STATIC_USERS_KEY, users);
      }
      return {
        consentTransactionId: txId,
        consentStatus: payload.decision,
        consentVersion: payload.consentVersion,
        consentTimestamp: nowIso,
        studentAccountStatus: nextStatus,
        withdrawalToken: wTok,
      };
    }
  },

  async withdrawParentalConsent(payload: {
    parentSessionToken?: string;
    withdrawalToken?: string;
  }): Promise<{
    consentTransactionId: string;
    consentStatus: string;
    withdrawalTimestamp: string;
    studentAccountStatus: string;
  }> {
    try {
      return await request('/api/parent-portal/consent/withdraw', {
        method: 'POST',
        headers: payload.parentSessionToken
          ? { 'X-Parent-Session': payload.parentSessionToken }
          : {},
        body: JSON.stringify({ withdrawalToken: payload.withdrawalToken }),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const invites = loadJson<Record<string, any>>(STATIC_PARENT_INVITES_KEY, {});
      const key = Object.keys(invites).find(
        (k) =>
          (payload.parentSessionToken && invites[k].sessionToken === payload.parentSessionToken) ||
          (payload.withdrawalToken &&
            invites[k].consent?.withdrawalToken === payload.withdrawalToken)
      );
      if (!key || !invites[key].consent) {
        throw new Error('Active parental consent record not found.');
      }
      const nowIso = new Date().toISOString();
      invites[key].consent.consentStatus = 'WITHDRAWN';
      invites[key].consent.withdrawalTimestamp = nowIso;
      saveJson(STATIC_PARENT_INVITES_KEY, invites);

      const users = getStaticUsers();
      const sIdx = users.findIndex((u) => u.id === invites[key].studentId);
      if (sIdx >= 0) {
        users[sIdx].accountStatus = 'CONSENT_WITHDRAWN_RESTRICTED';
        saveJson(STATIC_USERS_KEY, users);
      }
      return {
        consentTransactionId: invites[key].consent.consentTransactionId,
        consentStatus: 'WITHDRAWN',
        withdrawalTimestamp: nowIso,
        studentAccountStatus: 'CONSENT_WITHDRAWN_RESTRICTED',
      };
    }
  },

  async requestAccountDeletion() {
    try {
      return await request('/api/privacy/delete-account', { method: 'POST', body: '{}' });
    } catch {
      return { ok: true };
    }
  },

  // ===========================================================================
  // FULL PLATFORM DOMAIN ENDPOINTS (Bootstrap, Network, Chats, Opps, Courses, Search)
  // ===========================================================================
  async checkUsername(username: string): Promise<{
    available: boolean;
    username: string;
    reason: string;
  }> {
    try {
      return await request(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
    } catch {
      const clean = username.trim().replace(/^@+/, '').toLowerCase();
      const taken = getStaticUsers().some((u) => u.username.toLowerCase() === clean);
      return {
        available: !taken && /^[a-z0-9_.]{3,24}$/.test(clean),
        username: clean,
        reason: taken ? 'Username is already taken.' : 'Available',
      };
    }
  },

  async requestPasswordReset(email: string): Promise<{ queued: boolean; devResetToken?: string }> {
    try {
      return await request('/api/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      return { queued: true };
    }
  },

  async confirmPasswordReset(payload: { resetToken: string; newPassword: string }) {
    return request<{ ok: boolean }>('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getBootstrap(): Promise<{
    posts: FeedPost[];
    threads: ChatThread[];
    unreadChatsCount: number;
    messages: ChatMessage[];
    peers: PeerStudent[];
    friendIds: string[];
    opportunities: OpportunityItem[];
    courses: CourseItem[];
    completedModuleKeys: string[];
    notifications: any[];
    interactions: UserInteraction[];
  }> {
    try {
      return await request('/api/bootstrap');
    } catch {
      const uid = localStorage.getItem(STATIC_CURRENT_USER_ID_KEY) || DEFAULT_DEMO_USER.id;
      const interactions = loadJson<UserInteraction[]>(`${STATIC_INTERACTIONS_KEY}_${uid}`, []);
      const friendIds = [
        'peer-maya',
        ...interactions.filter((i) => i.target_type === 'connect').map((i) => i.target_id),
      ];
      return {
        posts: getStaticPosts(),
        threads: CHAT_THREADS,
        unreadChatsCount: CHAT_THREADS.reduce((s, t) => s + t.unread, 0),
        messages: getStaticMessages(),
        peers: PEER_STUDENTS,
        friendIds: Array.from(new Set(friendIds)),
        opportunities: OPPORTUNITIES,
        courses: COURSES,
        completedModuleKeys: [
          'course-1:m1',
          'course-1:m2',
          'course-2:m1',
          ...interactions
            .filter((i) => i.target_type === 'course_module')
            .map((i) => i.target_id),
        ],
        notifications: INITIAL_NOTIFICATIONS,
        interactions,
      };
    }
  },

  async addProject(payload: {
    title: string;
    summary: string;
    link: string;
    tag: string;
  }): Promise<{ user: UserAccount }> {
    try {
      return await request('/api/profile/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      const me = await this.me();
      const prev = me.user?.profile.portfolioProjects || [];
      return this.saveOnboarding({
        profilePatch: {
          portfolioProjects: [
            { id: `proj-${Date.now()}`, ...payload },
            ...prev,
          ],
          projectsCompleted: prev.length + 1,
        },
      });
    }
  },

  async deleteProject(projectId: string): Promise<{ user: UserAccount }> {
    try {
      return await request(`/api/profile/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
    } catch {
      const me = await this.me();
      const next = (me.user?.profile.portfolioProjects || []).filter((p) => p.id !== projectId);
      return this.saveOnboarding({
        profilePatch: { portfolioProjects: next, projectsCompleted: next.length },
      });
    }
  },

  async addAchievement(payload: { title: string; issuer?: string }): Promise<{ user: UserAccount }> {
    try {
      return await request('/api/profile/achievements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      const me = await this.me();
      const prev = me.user?.profile.achievements || [];
      return this.saveOnboarding({
        profilePatch: { achievements: [payload.title, ...prev] },
      });
    }
  },

  async sharePost(postId: string): Promise<{ sharesCount?: number }> {
    try {
      return await request(`/api/posts/${encodeURIComponent(postId)}/share`, {
        method: 'POST',
        body: '{}',
      });
    } catch {
      return {};
    }
  },

  async recordStoryView(storyId: string) {
    try {
      return await request(`/api/stories/${encodeURIComponent(storyId)}/view`, {
        method: 'POST',
        body: '{}',
      });
    } catch {
      return { ok: true };
    }
  },

  async openDirectThread(peerId: string): Promise<{
    threadId: string;
    threads: ChatThread[];
    totalUnread: number;
  }> {
    try {
      return await request('/api/chats/threads/direct', {
        method: 'POST',
        body: JSON.stringify({ peerId }),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      const firstName = peerId.replace(/^peer-/, '').toLowerCase();
      const matched = CHAT_THREADS.find((t) => t.id.includes(firstName)) || CHAT_THREADS[0];
      return { threadId: matched.id, threads: CHAT_THREADS, totalUnread: 0 };
    }
  },

  async markThreadRead(threadId: string): Promise<{
    threads: ChatThread[];
    totalUnread: number;
  }> {
    try {
      return await request(`/api/chats/threads/${encodeURIComponent(threadId)}/read`, {
        method: 'POST',
        body: '{}',
      });
    } catch {
      return { threads: CHAT_THREADS, totalUnread: 0 };
    }
  },

  async applyToOpportunity(
    opportunityId: string,
    pitchNote: string
  ): Promise<{ applicationId: string }> {
    try {
      return await request(`/api/opportunities/${encodeURIComponent(opportunityId)}/apply`, {
        method: 'POST',
        body: JSON.stringify({ pitchNote }),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      await this.toggleInteraction('opportunity_apply', opportunityId, { pitchNote });
      return { applicationId: `app-static-${Date.now()}` };
    }
  },

  async createOpportunity(payload: {
    title: string;
    organization?: string;
    type: OpportunityItem['type'];
    deadline: string;
    mode: OpportunityItem['Mode'];
    reward: string;
    skills: string[];
    description: string;
  }): Promise<{ opportunity: OpportunityItem }> {
    try {
      return await request('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err?.isApiError) throw err;
      return {
        opportunity: {
          id: `opp-${Date.now()}`,
          title: payload.title,
          organization: payload.organization || 'Student Initiative',
          type: payload.type,
          deadline: payload.deadline,
          Mode: payload.mode,
          reward: payload.reward,
          ageRange: 'Ages 13–19',
          skills: payload.skills,
          description: payload.description,
        },
      };
    }
  },

  async toggleCourseModule(
    courseId: string,
    moduleCode: string
  ): Promise<{
    completed: boolean;
    certificateAwarded: boolean;
    courses: CourseItem[];
    completedModuleKeys: string[];
    user?: UserAccount;
  }> {
    try {
      return await request(
        `/api/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleCode)}/toggle`,
        {
          method: 'POST',
          body: '{}',
        }
      );
    } catch {
      const key = `${courseId}:${moduleCode}`;
      const res = await this.toggleInteraction('course_module', key);
      return {
        completed: res.active,
        certificateAwarded: false,
        courses: COURSES,
        completedModuleKeys: res.interactions
          .filter((i) => i.target_type === 'course_module')
          .map((i) => i.target_id),
      };
    }
  },

  async searchAll(query: string): Promise<{
    students: PeerStudent[];
    posts: FeedPost[];
    opportunities: OpportunityItem[];
    courses: CourseItem[];
  }> {
    try {
      return await request(`/api/search?q=${encodeURIComponent(query)}`);
    } catch {
      const q = query.trim().toLowerCase();
      return {
        students: PEER_STUDENTS.filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.skills.some((sk) => sk.toLowerCase().includes(q))
        ).slice(0, 4),
        posts: getStaticPosts()
          .filter((p) => !q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
          .slice(0, 4),
        opportunities: OPPORTUNITIES.filter(
          (o) => !q || o.title.toLowerCase().includes(q) || o.type.toLowerCase().includes(q)
        ).slice(0, 3),
        courses: COURSES.filter((c) => !q || c.title.toLowerCase().includes(q)).slice(0, 3),
      };
    }
  },
};
