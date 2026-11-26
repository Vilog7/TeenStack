import type { FeedPost, UserAccount, UserInteraction, ChatMessage } from '../types';

const TOKEN_KEY = 'teenstack_auth_token';
const STATIC_USERS_KEY = 'teenstack_static_users_v2';
const STATIC_CURRENT_USER_ID_KEY = 'teenstack_static_uid_v2';
const STATIC_POSTS_KEY = 'teenstack_static_posts_v2';
const STATIC_MESSAGES_KEY = 'teenstack_static_messages_v2';
const STATIC_INTERACTIONS_KEY = 'teenstack_static_interactions_v2';

const DEFAULT_DEMO_USER: UserAccount & { passwordPlain?: string } = {
  id: 'usr-demo-arav',
  fullName: 'Arav Sharma',
  username: 'arav_dev',
  email: 'arav@teenstack.edu',
  phone: '••••••••••••4312',
  rawPhone: '+1 (415) 890-4312',
  dob: '2009-05-14',
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
        phone: payload.phone ? payload.phone.replace(/.(?=.{4})/g, '•') : '',
        rawPhone: payload.phone,
        dob: payload.dob,
        age: payload.age || 16,
        marketingOptIn: payload.marketingOptIn,
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
};
