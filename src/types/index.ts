export type AppRoute =
  | 'landing'
  | 'login'
  | 'signup'
  | 'verification'
  | 'parent-portal'
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

export type VerifiedAgeBand =
  | 'UNVERIFIED'
  | 'UNDER_13'
  | 'VERIFIED_13_17'
  | 'VERIFIED_18_PLUS';

export type AccountStatus =
  | 'PENDING_VERIFICATION'
  | 'AGE_VERIFIED_AWAITING_PARENT'
  | 'ACTIVE'
  | 'REJECTED_UNDER_13'
  | 'PARENT_REJECTED'
  | 'VERIFICATION_FAILED'
  | 'MANUAL_REVIEW'
  | 'CONSENT_WITHDRAWN_RESTRICTED';

export interface StudentVerificationOverview {
  accountStatus: AccountStatus;
  verifiedAgeBand: VerifiedAgeBand;
  environmentMode: 'live' | 'sandbox_mock';
  productionActivationDisabled: boolean;
  ageVerification: {
    status:
      | 'PENDING'
      | 'VERIFIED_13_17'
      | 'VERIFIED_18_PLUS'
      | 'UNDER_13'
      | 'VERIFICATION_FAILED'
      | 'MANUAL_REVIEW';
    verifiedAgeBand: VerifiedAgeBand;
    hostedUrl: string;
    expiresAt: string;
    completedAt?: string | null;
    isSandboxMock: boolean;
  } | null;
  parentVerification: {
    initiated: boolean;
    maskedParentMobile: string;
    relationshipType: string;
    inviteConsumed: boolean;
    inviteExpired: boolean;
    adultVerificationStatus: string;
    authorityVerificationStatus: string;
  } | null;
  parentalConsent: {
    consentTransactionId: string;
    status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
    consentVersion: string;
    consentTimestamp: string;
    withdrawalTimestamp?: string | null;
  } | null;
}

export interface ParentPortalState {
  consentVersion: string;
  environmentMode: 'live' | 'sandbox_mock';
  productionActivationDisabled: boolean;
  student: {
    fullName: string;
    username: string;
    verifiedAgeBand: VerifiedAgeBand;
    accountStatus: AccountStatus;
  };
  parentVerification: {
    id: string;
    parentName: string;
    parentEmail: string;
    parentMobile: string;
    relationshipType: string;
    adultVerificationStatus: string;
    authorityVerificationStatus: string;
  };
  consent: {
    consentTransactionId: string;
    consentStatus: 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
    consentVersion: string;
    consentTimestamp: string;
    withdrawalTimestamp?: string | null;
  } | null;
}

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
  declaredDob?: string;
  verifiedAgeBand?: VerifiedAgeBand;
  accountStatus?: AccountStatus;
  role?: 'student' | 'parent' | 'compliance_admin';
  verificationOverview?: StudentVerificationOverview;
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
  category:
    | 'story'
    | 'post'
    | 'reel'
    | 'project'
    | 'achievement'
    | 'tutorial'
    | 'video'
    | 'certificate';
  title: string;
  content: string;
  mediaType:
    | 'none'
    | 'landscape_illustration'
    | 'code_preview'
    | 'certificate_card'
    | 'video_showcase'
    | 'image';
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
