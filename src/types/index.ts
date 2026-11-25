export type AppRoute =
  | 'landing'
  | 'login'
  | 'signup'
  | 'onboarding'
  | 'home'
  | 'posts'
  | 'opportunities'
  | 'chats'
  | 'create'
  | 'learn'
  | 'profile';

export type NavSection =
  | 'home'
  | 'posts'
  | 'opportunities'
  | 'chats'
  | 'create'
  | 'learn'
  | 'profile';

export interface PortfolioProject {
  id: string;
  title: string;
  summary: string;
  link: string;
  tag: string;
}

export interface PrivacySettings {
  profileVisibility: 'students_only' | 'connections' | 'public_mentors';
  dmPermission: 'connections_only' | 'verified_students';
  hideContactInfo: boolean;
  guardianEmail: string;
  contentSafetyFilter: boolean;
}

export interface StudentProfileData {
  subjects: string[];
  educationLevel: string;
  school: string;
  careerInterests: string[];
  skills: string[];
  generatedTags: string[];
  experienceYears: number;
  projectsCompleted: number;
  ratePerProject: string;
  targetClients: string;
  achievements: string[];
  competitions: string[];
  careerAim: string;
  desiredField: string;
  skillsToLearn: string[];
  avatarUrl: string;
  avatarPreset: string;
  bio: string;
  portfolioUrl: string;
  portfolioProjects: PortfolioProject[];
  privacy: PrivacySettings;
}

export interface UserAccount {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  rawPhone?: string;
  dob: string;
  age: number;
  marketingOptIn: boolean;
  onboardingStep: number;
  onboardingCompleted: boolean;
  profile: StudentProfileData;
  createdAt: string;
}

export interface PostComment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  time: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorSchool: string;
  authorAvatar: string;
  category: 'project' | 'achievement' | 'tutorial' | 'video' | 'certificate' | 'post';
  title: string;
  content: string;
  mediaType: 'none' | 'landscape_illustration' | 'code_preview' | 'certificate_card' | 'video_showcase' | 'image';
  mediaMeta: Record<string, any>;
  skillTags: string[];
  likesCount: number;
  comments: PostComment[];
  sharesCount: number;
  createdAt: string;
}

export interface PeerStudent {
  id: string;
  name: string;
  handle: string;
  age: number;
  school: string;
  avatarPreset: string;
  headline: string;
  bio: string;
  skills: string[];
  tags: string[];
  mutualConnections: number;
  projects: PortfolioProject[];
  achievements: string[];
  online: boolean;
}

export interface OpportunityItem {
  id: string;
  title: string;
  organization: string;
  type: 'Hackathon' | 'Competition' | 'Internship' | 'Workshop' | 'Student Bounty';
  deadline: string;
  Mode: 'Remote' | 'Hybrid' | 'In-Person';
  reward: string;
  ageRange: string;
  skills: string[];
  description: string;
  featured?: boolean;
}

export interface CourseItem {
  id: string;
  title: string;
  track: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  lessonsCount: number;
  completedLessons: number;
  mentor: string;
  skills: string[];
  summary: string;
  modules: { id: string; title: string; duration: string }[];
}

export interface ChatThread {
  id: string;
  name: string;
  handle: string;
  roleBadge: string;
  avatarPreset: string;
  online: boolean;
  unread: number;
  isGroup?: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface UserInteraction {
  target_type: string;
  target_id: string;
  meta_json?: string;
}
