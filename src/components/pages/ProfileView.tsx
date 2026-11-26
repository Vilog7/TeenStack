import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ExternalLink,
  Award,
  Sparkles,
  ShieldCheck,
  Edit3,
  Plus,
  Users,
  ArrowLeft,
  MessageSquare,
  UserCheck,
  UserPlus,
  Sliders,
  LogOut,
  X,
  Grid3X3,
  CircleFadingPlus,
  Rocket,
  Bookmark,
  Heart,
  MessageCircle,
  Clapperboard,
  Link2,
  Briefcase,
  AtSign,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { PEER_STUDENTS, CHAT_THREADS } from '../../data/catalog';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import type { FeedPost, NavSection, PeerStudent, UserAccount } from '../../types';

type ProfileTabId =
  | 'posts'
  | 'stories'
  | 'projects'
  | 'achievements'
  | 'friends'
  | 'mutuals'
  | 'saved';

interface ProfileViewProps {
  user: UserAccount;
  posts: FeedPost[];
  peers?: PeerStudent[];
  savedPostIds: Set<string>;
  inspectingPeer: PeerStudent | null;
  connectedIds: Set<string>;
  onClearInspectingPeer: () => void;
  onSelectPeer: (peer: PeerStudent) => void;
  onToggleConnect: (peerId: string) => void;
  onMessagePeer: (threadId?: string, peerId?: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onNavigate: (section: NavSection) => void;
  onSaveProfilePatch: (
    patch: Partial<UserAccount['profile']>,
    nextName?: string
  ) => Promise<void>;
  onAddProject?: (payload: {
    title: string;
    summary: string;
    link: string;
    tag: string;
  }) => Promise<void>;
  onAddAchievement?: (title: string) => Promise<void>;
  onOpenOnboardingWizard: () => void;
  onLogout?: () => void;
}

const PEER_STORY_COVERS: Record<string, string> = {
  'peer-maya': 'images/posts/shader-desk.jpg',
  'peer-rohan': 'images/posts/rover-lake.jpg',
  'peer-zara': 'images/teens/biotech-scientist.jpg',
  'peer-kai': 'images/teens/ai-coder.jpg',
  'peer-ananya': 'images/posts/braille-app.jpg',
};

const FALLBACK_COVERS = [
  'images/posts/shader-desk.jpg',
  'images/posts/hackathon-win.jpg',
  'images/posts/rover-lake.jpg',
  'images/teens/ai-coder.jpg',
];

function resolveThreadIdForPeer(peerId: string): string | undefined {
  const firstName = peerId.replace(/^peer-/, '').toLowerCase();
  return CHAT_THREADS.find((t) => t.id.includes(firstName))?.id;
}

export function ProfileView({
  user,
  posts,
  peers = PEER_STUDENTS,
  savedPostIds,
  inspectingPeer,
  connectedIds,
  onClearInspectingPeer,
  onSelectPeer,
  onToggleConnect,
  onMessagePeer,
  onOpenPost,
  onNavigate,
  onSaveProfilePatch,
  onAddProject,
  onAddAchievement,
  onOpenOnboardingWizard,
  onLogout,
}: ProfileViewProps) {
  const [activeTab, setActiveTab] = useState<ProfileTabId>('posts');
  const [viewingStory, setViewingStory] = useState<{
    title: string;
    caption: string;
    imageUrl: string;
    videoUrl?: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    attachedLink?: string;
    taggedPeople?: string[];
  } | null>(null);

  // Edit Profile Modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(user.fullName);
  const [editBio, setEditBio] = useState(user.profile.bio);
  const [editSchool, setEditSchool] = useState(user.profile.school);
  const [editPortfolioUrl, setEditPortfolioUrl] = useState(user.profile.portfolioUrl);
  const [hideContact, setHideContact] = useState(user.profile.privacy.hideContactInfo);
  const [dmPerm, setDmPerm] = useState(user.profile.privacy.dmPermission);

  // Quick Add Project & Add Achievement drawers (Own Profile)
  const [addingProj, setAddingProj] = useState(false);
  const [projTitle, setProjTitle] = useState('');
  const [projSummary, setProjSummary] = useState('');
  const [projLink, setProjLink] = useState('');
  const [projTag, setProjTag] = useState('TypeScript · Web');

  const [addingAch, setAddingAch] = useState(false);
  const [achTitle, setAchTitle] = useState('');

  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Reset to posts tab when switching between own profile and a peer profile
  useEffect(() => {
    setActiveTab('posts');
  }, [inspectingPeer?.id]);

  // IntersectionObserver fallback for scroll-driven tablist edge fades (modern-web-guidance: tabs)
  useEffect(() => {
    const scroller = tablistRef.current;
    if (!scroller || typeof IntersectionObserver === 'undefined') return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'scroll()')) return;

    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, intersectionRatio } of entries) {
          scroller.classList.toggle(
            target === first ? 'more-start' : 'more-end',
            intersectionRatio < 1
          );
        }
      },
      { root: scroller, threshold: 1, rootMargin: '1px' }
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [inspectingPeer?.id]);

  const selectTab = (next: ProfileTabId, focusEl = false) => {
    setActiveTab(next);
    const btn = tabRefs.current[next];
    if (btn) {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focusEl) btn.focus();
    }
  };

  // Determine whether rendering Own Profile vs Inspecting Peer Profile
  const isPeer = Boolean(inspectingPeer);
  const targetId = inspectingPeer ? inspectingPeer.id : user.id;
  const targetHandleClean = inspectingPeer
    ? inspectingPeer.handle.replace(/^@/, '').toLowerCase()
    : user.username.replace(/^@/, '').toLowerCase();
  const displayName = inspectingPeer ? inspectingPeer.name : user.fullName;
  const displayHandle = `@${targetHandleClean}`;
  const displayAvatar = inspectingPeer
    ? inspectingPeer.avatarPreset
    : user.profile.avatarUrl || user.profile.avatarPreset;
  const displaySchool = inspectingPeer
    ? inspectingPeer.school
    : user.profile.school || user.profile.educationLevel;
  const displayAge = inspectingPeer ? inspectingPeer.age : user.age;
  const displayBio = inspectingPeer
    ? inspectingPeer.bio
    : user.profile.bio || 'Add a biography to tell peers and mentors what you are building.';
  const displaySkills = inspectingPeer ? inspectingPeer.skills : user.profile.skills;
  const displayTags = inspectingPeer ? inspectingPeer.tags : user.profile.generatedTags;
  const displayProjects = inspectingPeer
    ? inspectingPeer.projects
    : user.profile.portfolioProjects;
  const displayAchievements = inspectingPeer
    ? inspectingPeer.achievements
    : [...user.profile.achievements, ...user.profile.competitions];

  // Filter Posts, Reels, Tagged Posts & Stories for this profile
  const authoredFeedPosts = posts.filter(
    (p) =>
      p.category !== 'story' &&
      (p.authorId === targetId ||
        p.authorHandle.replace(/^@/, '').toLowerCase() === targetHandleClean)
  );

  const taggedInPosts = posts.filter(
    (p) =>
      p.category !== 'story' &&
      p.authorId !== targetId &&
      Array.isArray(p.mediaMeta?.taggedPeople) &&
      p.mediaMeta.taggedPeople.some(
        (h: string) => h.replace(/^@/, '').toLowerCase() === targetHandleClean
      )
  );

  const authoredStoryPosts = posts.filter(
    (p) =>
      p.category === 'story' &&
      (p.authorId === targetId ||
        p.authorHandle.replace(/^@/, '').toLowerCase() === targetHandleClean)
  );

  // Build Story Highlights (combines published user stories + project/build story highlights)
  const storyHighlights = [
    ...authoredStoryPosts.map((st, i) => ({
      id: st.id,
      label: st.mediaMeta?.topic || st.title || `Story #${i + 1}`,
      caption: st.content,
      imageUrl: st.mediaMeta?.imageUrl || FALLBACK_COVERS[i % FALLBACK_COVERS.length],
      videoUrl: st.mediaMeta?.videoUrl as string | undefined,
      attachedLink: st.mediaMeta?.attachedLink as string | undefined,
      taggedPeople: st.mediaMeta?.taggedPeople as string[] | undefined,
      badge: '24h Story',
    })),
    ...(displayProjects.slice(0, 2).map((pr, idx) => ({
      id: `hl-proj-${pr.id}`,
      label: pr.title.split(' ').slice(0, 2).join(' '),
      caption: `${pr.title} — ${pr.summary}`,
      imageUrl: isPeer
        ? PEER_STORY_COVERS[targetId] || FALLBACK_COVERS[idx % FALLBACK_COVERS.length]
        : FALLBACK_COVERS[idx % FALLBACK_COVERS.length],
      videoUrl: undefined,
      attachedLink: pr.link,
      taggedPeople: [] as string[],
      badge: pr.tag,
    }))),
  ];

  // Friends & Mutuals calculations
  const peerPool = peers.length > 0 ? peers : PEER_STUDENTS;
  const connectedFriends = peerPool.filter((peer) => connectedIds.has(peer.id));
  const userSkillSet = new Set(user.profile.skills.map((s) => s.toLowerCase()));

  const mutualsList = peerPool.filter((peer) => peer.id !== targetId).map((peer) => {
    const sharedSkills = peer.skills.filter((s) => userSkillSet.has(s.toLowerCase()));
    return {
      peer,
      sharedSkills,
      mutualCount: peer.mutualConnections + (connectedIds.has(peer.id) ? 2 : 0),
    };
  }).sort((a, b) => b.mutualCount - a.mutualCount);

  const totalMutualsCount = inspectingPeer
    ? inspectingPeer.mutualConnections
    : mutualsList.reduce((acc, item) => acc + item.mutualCount, 0);

  const savedPostsList = posts.filter(
    (p) => p.category !== 'story' && savedPostIds.has(p.id)
  );

  const tabs: {
    id: ProfileTabId;
    label: string;
    count: number;
    icon: typeof Grid3X3;
  }[] = [
    {
      id: 'posts',
      label: 'Posts',
      count: authoredFeedPosts.length + taggedInPosts.length,
      icon: Grid3X3,
    },
    {
      id: 'stories',
      label: 'Stories',
      count: storyHighlights.length,
      icon: CircleFadingPlus,
    },
    {
      id: 'projects',
      label: 'Projects',
      count: displayProjects.length,
      icon: Rocket,
    },
    {
      id: 'achievements',
      label: 'Achievements',
      count: displayAchievements.length,
      icon: Award,
    },
    {
      id: 'friends',
      label: 'Friends',
      count: isPeer ? connectedFriends.length + 12 : connectedFriends.length,
      icon: UserCheck,
    },
    {
      id: 'mutuals',
      label: 'Mutuals',
      count: isPeer ? inspectingPeer!.mutualConnections : mutualsList.length,
      icon: Users,
    },
    ...(!isPeer
      ? [
          {
            id: 'saved' as const,
            label: 'Saved',
            count: savedPostsList.length,
            icon: Bookmark,
          },
        ]
      : []),
  ];

  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (idx < 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      selectTab(next.id, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      selectTab(prev.id, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectTab(tabs[0].id, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectTab(tabs[tabs.length - 1].id, true);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveProfilePatch(
      {
        bio: editBio,
        school: editSchool,
        portfolioUrl: editPortfolioUrl,
        privacy: {
          ...user.profile.privacy,
          hideContactInfo: hideContact,
          dmPermission: dmPerm,
        },
      },
      editName
    );
    setEditOpen(false);
  };

  const handleAddProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;
    const rawLink = projLink.trim();
    const normalizedLink = rawLink
      ? /^https?:\/\//i.test(rawLink)
        ? rawLink
        : `https://${rawLink}`
      : user.profile.portfolioUrl || 'https://teenstack.dev';

    if (onAddProject) {
      await onAddProject({
        title: projTitle.trim(),
        summary: projSummary.trim() || 'Student build showcased on TeenStack.',
        link: normalizedLink,
        tag: projTag.trim() || 'Student Build',
      });
    } else {
      const nextProjects = [
        {
          id: `proj-${Date.now()}`,
          title: projTitle.trim(),
          summary: projSummary.trim() || 'Student build showcased on TeenStack.',
          link: normalizedLink,
          tag: projTag.trim() || 'Student Build',
        },
        ...user.profile.portfolioProjects,
      ];
      await onSaveProfilePatch({
        portfolioProjects: nextProjects,
        projectsCompleted: (user.profile.projectsCompleted || 0) + 1,
      });
    }
    setProjTitle('');
    setProjSummary('');
    setProjLink('');
    setAddingProj(false);
  };

  const handleAddAchievement = async (e: FormEvent) => {
    e.preventDefault();
    if (!achTitle.trim()) return;
    if (onAddAchievement) {
      await onAddAchievement(achTitle.trim());
    } else {
      const nextAchievements = [achTitle.trim(), ...user.profile.achievements];
      await onSaveProfilePatch({ achievements: nextAchievements });
    }
    setAchTitle('');
    setAddingAch(false);
  };

  const openHighlightModal = (hl: (typeof storyHighlights)[number]) => {
    setViewingStory({
      title: hl.label,
      caption: hl.caption,
      imageUrl: hl.imageUrl,
      videoUrl: hl.videoUrl,
      authorName: displayName,
      authorHandle: displayHandle,
      authorAvatar: displayAvatar,
      attachedLink: hl.attachedLink,
      taggedPeople: hl.taggedPeople,
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Back Button when Inspecting a Peer Profile */}
      {inspectingPeer && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClearInspectingPeer}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-2xl border border-white/12 bg-[#111426] px-4 py-2 text-xs font-semibold text-white hover:border-[#27D9D0]"
          >
            <ArrowLeft className="h-4 w-4 text-[#27D9D0]" />
            <span>Back to My Profile</span>
          </button>
        </div>
      )}

      {/* =======================================================================
          1. PROFILE HERO CARD (Avatar, Posts/Projects/Friends/Mutuals Stats, Bio)
         ======================================================================= */}
      <section className="ts-surface-elevated relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          {/* Avatar with Interactive Story Ring */}
          <div className="flex items-center gap-4 sm:block">
            <button
              type="button"
              onClick={() => {
                if (storyHighlights.length > 0) {
                  openHighlightModal(storyHighlights[0]);
                } else if (!isPeer) {
                  onNavigate('create');
                }
              }}
              aria-label="Open profile story highlight"
              className="group relative shrink-0 rounded-full bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[2.5px]"
            >
              <div className="rounded-full bg-[#080910] p-[2.5px]">
                <StudentAvatar
                  layoutId={isPeer ? undefined : 'current-user-avatar-hero'}
                  presetOrUrl={displayAvatar}
                  name={displayName}
                  size="xl"
                  online={inspectingPeer ? inspectingPeer.online : true}
                  className="!h-20 !w-20 !rounded-full transition-transform group-hover:scale-[1.02] sm:!h-24 sm:!w-24"
                />
              </div>
            </button>

            {/* Mobile Name Preview beside avatar */}
            <div className="min-w-0 sm:hidden">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="truncate font-heading text-base font-bold text-white">
                  {displayName}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#27D9D0]/12 px-2 py-0.5 text-[10px] font-semibold text-[#27D9D0]">
                  <ShieldCheck className="h-3 w-3" />
                  {displayHandle}
                </span>
              </div>
              <p className="truncate text-xs text-[#A5A9BC]">
                {displaySchool} · {displayAge} yrs
              </p>
            </div>
          </div>

          {/* 4 Interactive Counters: Posts | Projects | Friends | Mutuals */}
          <div className="grid flex-1 grid-cols-4 gap-2 rounded-2xl border border-white/8 bg-[#080910]/55 p-3 text-center sm:border-0 sm:bg-transparent sm:p-0">
            <button
              type="button"
              onClick={() => selectTab('posts')}
              className="rounded-xl py-1 transition-colors hover:bg-white/5"
            >
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {authoredFeedPosts.length}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">posts</div>
            </button>

            <button
              type="button"
              onClick={() => selectTab('projects')}
              className="rounded-xl py-1 transition-colors hover:bg-white/5"
            >
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {displayProjects.length}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">projects</div>
            </button>

            <button
              type="button"
              onClick={() => selectTab('friends')}
              className="rounded-xl py-1 transition-colors hover:bg-white/5"
            >
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {isPeer ? connectedFriends.length + 18 : connectedFriends.length}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">friends</div>
            </button>

            <button
              type="button"
              onClick={() => selectTab('mutuals')}
              className="rounded-xl py-1 transition-colors hover:bg-white/5"
            >
              <div className="font-heading text-base font-bold text-[#27D9D0] sm:text-xl">
                {totalMutualsCount}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">mutuals</div>
            </button>
          </div>
        </div>

        {/* Desktop Name, Bio, Portfolio Link, Experience & Rate */}
        <div className="mt-4 space-y-2">
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <h1 className="font-heading text-xl font-bold text-white">{displayName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#27D9D0]/12 px-2.5 py-0.5 text-xs font-semibold text-[#27D9D0]">
              <ShieldCheck className="h-3.5 w-3.5" />
              {displayHandle}
            </span>
            <span className="text-xs text-[#A5A9BC]">
              · {displaySchool} · Age {displayAge}
            </span>
          </div>

          {inspectingPeer?.headline && (
            <p className="text-xs font-semibold text-white/95">{inspectingPeer.headline}</p>
          )}

          <p className="max-w-2xl text-xs leading-relaxed text-white/90 sm:text-sm">
            {displayBio}
          </p>

          {/* Experience, Rate & Portfolio Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isPeer && user.profile.experienceYears > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#080910]/80 px-2.5 py-1 text-[11px] text-[#A5A9BC]">
                <Briefcase className="h-3 w-3 text-[#743BFF]" />
                {user.profile.experienceYears} yr{user.profile.experienceYears > 1 ? 's' : ''} exp
                {user.profile.ratePerProject ? ` · ${user.profile.ratePerProject}` : ''}
              </span>
            )}

            {!isPeer && user.profile.portfolioUrl && (
              <a
                href={
                  /^https?:\/\//i.test(user.profile.portfolioUrl)
                    ? user.profile.portfolioUrl
                    : `https://${user.profile.portfolioUrl}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#258BFF]/35 bg-[#258BFF]/12 px-3 py-1 text-xs font-semibold text-[#27D9D0] hover:border-[#27D9D0]"
              >
                <Link2 className="h-3 w-3" />
                <span>{user.profile.portfolioUrl.replace(/^https?:\/\//i, '')}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Skill Chips & #SkillTags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#27D9D0]/30 bg-[#27D9D0]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#27D9D0]"
              >
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
            {displaySkills.slice(0, 8).map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-white/10 bg-[#080910]/75 px-2.5 py-0.5 text-[11px] text-white/90"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {inspectingPeer ? (
            <>
              <button
                type="button"
                onClick={() => onToggleConnect(inspectingPeer.id)}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold ${
                  connectedIds.has(inspectingPeer.id)
                    ? 'border border-[#27D9D0]/45 bg-[#27D9D0]/15 text-[#27D9D0]'
                    : 'bg-gradient-to-r from-[#743BFF] to-[#258BFF] text-white'
                }`}
              >
                {connectedIds.has(inspectingPeer.id) ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Friends</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Add Friend</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  onMessagePeer(resolveThreadIdForPeer(inspectingPeer.id), inspectingPeer.id)
                }
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#258BFF]/45 bg-[#258BFF]/15 px-5 py-2 text-xs font-semibold text-white hover:bg-[#258BFF]/30"
              >
                <MessageSquare className="h-3.5 w-3.5 text-[#27D9D0]" />
                <span>Message</span>
              </button>
            </>
          ) : (
            <>
              <motion.button
                type="button"
                layoutId="edit-profile-modal-surface"
                onClick={() => setEditOpen(true)}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                <Edit3 className="h-3.5 w-3.5 text-[#27D9D0]" />
                <span>Edit profile</span>
              </motion.button>

              <button
                type="button"
                onClick={() => onNavigate('create')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#743BFF]/80 to-[#258BFF]/80 px-4 py-2 text-xs font-semibold text-white hover:from-[#743BFF] hover:to-[#258BFF]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Post / Story</span>
              </button>

              <button
                type="button"
                onClick={onOpenOnboardingWizard}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                <Sliders className="h-3.5 w-3.5 text-[#743BFF]" />
                <span>Setup skills</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Log out</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* =====================================================================
            2. INSTAGRAM STORY HIGHLIGHTS ROW ON PROFILE
           ===================================================================== */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A5A9BC]">
              Stories &amp; Highlights
            </span>
            <button
              type="button"
              onClick={() => selectTab('stories')}
              className="text-[11px] font-semibold text-[#27D9D0] hover:underline"
            >
              View all ({storyHighlights.length})
            </button>
          </div>

          <div className="ts-snap-scroller pb-1">
            {!isPeer && (
              <button
                type="button"
                onClick={() => onNavigate('create')}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-white/25 bg-[#080910]/80 text-[#27D9D0] hover:border-[#27D9D0]">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="w-full truncate text-[11px] text-[#A5A9BC]">New</span>
              </button>
            )}

            {storyHighlights.map((hl) => (
              <button
                key={hl.id}
                type="button"
                onClick={() => openHighlightModal(hl)}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <div className="rounded-full bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[2px]">
                  <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-[#080910] bg-[#111426]">
                    <img
                      src={assetUrl(hl.imageUrl)}
                      alt={hl.label}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
                <span className="w-full truncate text-[11px] text-white/90">{hl.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =======================================================================
          3. ACCESSIBLE SINGLE-ROW SCROLLABLE TABS:
             Posts | Stories | Projects | Achievements | Friends | Mutuals | Saved
         ======================================================================= */}
      <div>
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={handleTabKeyDown}
          className="ts-profile-tablist border-b border-white/10 bg-[#0B0E1A]/90 px-2 sm:rounded-t-2xl"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`profile-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className="ts-profile-tab inline-flex min-h-[46px] items-center gap-2 px-4 py-3 text-xs font-semibold transition-colors hover:text-white sm:text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-[#A5A9BC]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            TAB PANELS (Styles placed on inner wrapper per modern-web-guidance: tabs)
           ===================================================================== */}

        {/* PANEL 1: POSTS (Authored Posts/Reels + @Tagged Posts) */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-posts"
          hidden={activeTab !== 'posts'}
        >
          <div className="space-y-5 pt-4">
            {authoredFeedPosts.length === 0 ? (
              <div className="ts-surface rounded-3xl p-8 text-center">
                <Grid3X3 className="mx-auto h-8 w-8 text-[#743BFF]" />
                <h2 className="mt-2 font-heading text-base font-bold text-white">
                  {isPeer ? 'No posts shared yet' : 'Share your first Post or Reel'}
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs text-[#A5A9BC]">
                  {isPeer
                    ? `${displayName} hasn't published feed posts yet—check out their Projects and Achievements tabs!`
                    : 'Publish build updates, study notes, or vertical demo Reels with @tags and project links.'}
                </p>
                {!isPeer && (
                  <button
                    type="button"
                    onClick={() => onNavigate('create')}
                    className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-2 text-xs font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Post or Reel</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
                {authoredFeedPosts.map((post, idx) => {
                  const thumb = assetUrl(
                    post.mediaMeta?.imageUrl || FALLBACK_COVERS[idx % FALLBACK_COVERS.length]
                  );
                  const isReel =
                    post.category === 'reel' || post.mediaMeta?.createType === 'reel';
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onOpenPost(post)}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#111426] text-left"
                    >
                      <img
                        src={thumb}
                        alt={post.title || post.content}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                      {isReel && (
                        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-[#27D9D0] backdrop-blur-sm">
                          <Clapperboard className="h-3 w-3" />
                          Reel
                        </span>
                      )}

                      <div className="absolute inset-x-3 bottom-2.5 space-y-1">
                        {(post.mediaMeta?.topic || post.title) && (
                          <div className="truncate text-xs font-bold text-white">
                            {post.mediaMeta?.topic || post.title}
                          </div>
                        )}
                        <p className="line-clamp-1 text-[11px] text-white/80">{post.content}</p>
                        <div className="flex items-center gap-3 pt-0.5 text-[11px] font-semibold text-white/90">
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3 w-3 fill-[#743BFF] text-[#743BFF]" />
                            {post.likesCount}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="h-3 w-3 text-[#27D9D0]" />
                            {post.comments.length}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Posts Where This Student Is @Tagged */}
            {taggedInPosts.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#27D9D0]">
                  <AtSign className="h-3.5 w-3.5" />
                  <span>Tagged in Posts ({taggedInPosts.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
                  {taggedInPosts.map((post, idx) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onOpenPost(post)}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-[#27D9D0]/30 bg-[#111426] text-left"
                    >
                      <img
                        src={assetUrl(
                          post.mediaMeta?.imageUrl ||
                            FALLBACK_COVERS[idx % FALLBACK_COVERS.length]
                        )}
                        alt={post.title || post.content}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                      <div className="absolute inset-x-3 bottom-2.5">
                        <div className="text-[10px] font-semibold text-[#27D9D0]">
                          by {post.authorHandle}
                        </div>
                        <div className="truncate text-xs font-bold text-white">
                          {post.title || post.content}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: STORIES */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-stories"
          hidden={activeTab !== 'stories'}
        >
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-bold text-white">
                Stories &amp; Build Highlights
              </h2>
              {!isPeer && (
                <button
                  type="button"
                  onClick={() => onNavigate('create')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#743BFF]/20 px-3.5 py-1.5 text-xs font-semibold text-[#27D9D0] hover:bg-[#743BFF]/35"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Story</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {storyHighlights.map((hl) => (
                <button
                  key={hl.id}
                  type="button"
                  onClick={() => openHighlightModal(hl)}
                  className="group relative aspect-[9/14] overflow-hidden rounded-2xl border border-white/12 bg-[#111426] text-left"
                >
                  <img
                    src={assetUrl(hl.imageUrl)}
                    alt={hl.label}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />
                  <span className="absolute top-2.5 left-2.5 rounded-full bg-[#743BFF]/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    {hl.badge}
                  </span>
                  <div className="absolute inset-x-3 bottom-3">
                    <div className="truncate font-heading text-xs font-bold text-white sm:text-sm">
                      {hl.label}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-white/75">{hl.caption}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 3: PROJECTS */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-projects"
          hidden={activeTab !== 'projects'}
        >
          <div className="ts-surface mt-4 space-y-4 rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-bold text-white">
                  Shipped Portfolio Projects
                </h2>
                <p className="text-xs text-[#A5A9BC]">
                  Live demos, repositories, and engineering builds
                </p>
              </div>

              {!isPeer && (
                <button
                  type="button"
                  onClick={() => setAddingProj((v) => !v)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#743BFF]/45 bg-[#743BFF]/20 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#743BFF]/35"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Project</span>
                </button>
              )}
            </div>

            <AnimatePresence>
              {addingProj && !isPeer && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleAddProject}
                  className="space-y-3 overflow-hidden rounded-2xl border border-[#743BFF]/35 bg-[#080910]/85 p-4"
                >
                  <input
                    type="text"
                    required
                    value={projTitle}
                    onChange={(e) => setProjTitle(e.target.value)}
                    placeholder="Project title (e.g. Autonomous Lake Rover)"
                    className="w-full rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2.5 text-base text-white sm:text-xs"
                  />
                  <input
                    type="text"
                    value={projSummary}
                    onChange={(e) => setProjSummary(e.target.value)}
                    placeholder="Short summary of what problem it solves…"
                    className="w-full rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2.5 text-base text-white sm:text-xs"
                  />
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      value={projLink}
                      onChange={(e) => setProjLink(e.target.value)}
                      placeholder="Project URL (https://github.com/...)"
                      className="rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2 text-base text-white sm:text-xs"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={projTag}
                        onChange={(e) => setProjTag(e.target.value)}
                        placeholder="Stack tag (e.g. React · Python)"
                        className="flex-1 rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2 text-base text-white sm:text-xs"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-xl bg-[#743BFF] px-4 py-2 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {displayProjects.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-[#080910]/60 p-4 text-xs text-[#A5A9BC]">
                No projects listed yet—click &ldquo;Add Project&rdquo; to showcase your builds!
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {displayProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#080910]/75 p-4 hover:border-[#258BFF]/45"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-heading text-sm font-bold text-white sm:text-base">
                          {proj.title}
                        </h3>
                        <span className="shrink-0 rounded-lg bg-[#258BFF]/18 px-2.5 py-0.5 text-[10px] font-semibold text-[#27D9D0]">
                          {proj.tag}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#A5A9BC]">
                        {proj.summary}
                      </p>
                    </div>

                    {proj.link && (
                      <a
                        href={
                          /^https?:\/\//i.test(proj.link) ? proj.link : `https://${proj.link}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:text-[#27D9D0]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="truncate">{proj.link.replace(/^https?:\/\//i, '')}</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL 4: ACHIEVEMENTS */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-achievements"
          hidden={activeTab !== 'achievements'}
        >
          <div className="ts-surface mt-4 space-y-4 rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-[#27D9D0]" />
                <div>
                  <h2 className="font-heading text-lg font-bold text-white">
                    Achievements, Hackathons &amp; Credentials
                  </h2>
                  <p className="text-xs text-[#A5A9BC]">
                    Milestones, awards, and verified competition honors
                  </p>
                </div>
              </div>

              {!isPeer && (
                <button
                  type="button"
                  onClick={() => setAddingAch((v) => !v)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#27D9D0]/40 bg-[#27D9D0]/12 px-3.5 py-1.5 text-xs font-semibold text-[#27D9D0] hover:bg-[#27D9D0]/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Achievement</span>
                </button>
              )}
            </div>

            {addingAch && !isPeer && (
              <form
                onSubmit={handleAddAchievement}
                className="flex flex-col gap-2 rounded-2xl border border-[#27D9D0]/30 bg-[#080910]/85 p-3.5 sm:flex-row"
              >
                <input
                  type="text"
                  required
                  value={achTitle}
                  onChange={(e) => setAchTitle(e.target.value)}
                  placeholder="e.g. 1st Place — National Robotics Olympiad 2026"
                  className="flex-1 rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2 text-base text-white sm:text-xs"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#258BFF] px-4 py-2 text-xs font-semibold text-white"
                >
                  Save Milestone
                </button>
              </form>
            )}

            {displayAchievements.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-[#080910]/60 p-4 text-xs text-[#A5A9BC]">
                No achievements added yet—record hackathons, competitions, or course credentials!
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {displayAchievements.map((item, idx) => (
                  <div
                    key={`${item}-${idx}`}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#080910]/75 p-4"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#27D9D0]/35 bg-[#27D9D0]/12 text-[#27D9D0]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white sm:text-sm">{item}</div>
                      <div className="mt-0.5 text-[11px] text-[#A5A9BC]">
                        Verified Student Milestone
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL 5: FRIENDS */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-friends"
          hidden={activeTab !== 'friends'}
        >
          <div className="ts-surface mt-4 space-y-4 rounded-3xl p-5 sm:p-6">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">Connected Friends</h2>
              <p className="text-xs text-[#A5A9BC]">
                Verified student peers in {isPeer ? `${displayName}'s` : 'your'} circle
              </p>
            </div>

            {connectedFriends.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-[#080910]/60 p-4 text-xs text-[#A5A9BC]">
                No friends connected yet—open the Mutuals tab to connect with fellow student builders!
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {connectedFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#080910]/75 p-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPeer(friend)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <StudentAvatar
                        presetOrUrl={friend.avatarPreset}
                        name={friend.name}
                        size="md"
                        online={friend.online}
                        className="!h-11 !w-11 !rounded-full"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white hover:text-[#27D9D0] sm:text-sm">
                          {friend.name}
                        </div>
                        <div className="truncate text-[11px] text-[#A5A9BC]">
                          {friend.handle} · {friend.school}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Message ${friend.name}`}
                        onClick={() => onMessagePeer(resolveThreadIdForPeer(friend.id), friend.id)}
                        className="rounded-xl border border-[#258BFF]/35 bg-[#258BFF]/15 p-2 text-[#27D9D0] hover:bg-[#258BFF]/30"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleConnect(friend.id)}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                      >
                        Friends
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL 6: MUTUALS */}
        <div
          role="tabpanel"
          aria-labelledby="profile-tab-mutuals"
          hidden={activeTab !== 'mutuals'}
        >
          <div className="ts-surface mt-4 space-y-4 rounded-3xl p-5 sm:p-6">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">
                Mutual Connections &amp; Skill Matches
              </h2>
              <p className="text-xs text-[#A5A9BC]">
                Peers sharing mutual friends, hackathons, and overlapping tech stacks
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mutualsList.map(({ peer, sharedSkills, mutualCount }) => {
                const isFriend = connectedIds.has(peer.id);
                return (
                  <div
                    key={peer.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-[#080910]/75 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectPeer(peer)}
                        className="flex min-w-0 items-center gap-3 text-left"
                      >
                        <StudentAvatar
                          presetOrUrl={peer.avatarPreset}
                          name={peer.name}
                          size="md"
                          online={peer.online}
                          className="!h-11 !w-11 !rounded-full"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-white hover:text-[#27D9D0] sm:text-sm">
                            {peer.name}
                          </div>
                          <div className="truncate text-[11px] text-[#A5A9BC]">
                            {peer.handle} · {peer.school}
                          </div>
                        </div>
                      </button>

                      <span className="shrink-0 rounded-full bg-[#27D9D0]/12 px-2.5 py-0.5 text-[10px] font-bold text-[#27D9D0]">
                        {mutualCount} mutuals
                      </span>
                    </div>

                    <div className="text-[11px] text-[#A5A9BC]">
                      {sharedSkills.length > 0 ? (
                        <span>
                          Shared skills:{' '}
                          <strong className="text-white">{sharedSkills.join(', ')}</strong>
                        </span>
                      ) : (
                        <span>Stack: {peer.skills.slice(0, 3).join(' · ')}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleConnect(peer.id)}
                        className={`flex-1 rounded-xl py-2 text-xs font-semibold ${
                          isFriend
                            ? 'border border-white/15 bg-white/8 text-white'
                            : 'bg-[#743BFF] text-white hover:bg-[#6328eb]'
                        }`}
                      >
                        {isFriend ? 'Friends ✓' : 'Connect'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectPeer(peer)}
                        className="rounded-xl border border-white/12 bg-[#111426] px-3.5 py-2 text-xs font-semibold text-[#A5A9BC] hover:text-white"
                      >
                        Profile
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* PANEL 7: SAVED BOOKMARKS (Own Profile Only) */}
        {!isPeer && (
          <div
            role="tabpanel"
            aria-labelledby="profile-tab-saved"
            hidden={activeTab !== 'saved'}
          >
            <div className="space-y-4 pt-4">
              {savedPostsList.length === 0 ? (
                <div className="ts-surface rounded-3xl p-7 text-center">
                  <Bookmark className="mx-auto h-7 w-7 text-[#27D9D0]" />
                  <h2 className="mt-2 font-heading text-base font-bold text-white">
                    No saved posts yet
                  </h2>
                  <p className="mt-1 text-xs text-[#A5A9BC]">
                    Bookmark inspiring projects, Reels, and study guides from the Home feed to revisit them here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
                  {savedPostsList.map((post, idx) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onOpenPost(post)}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#111426] text-left"
                    >
                      <img
                        src={assetUrl(
                          post.mediaMeta?.imageUrl ||
                            FALLBACK_COVERS[idx % FALLBACK_COVERS.length]
                        )}
                        alt={post.title || post.content}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                      <div className="absolute inset-x-3 bottom-2.5">
                        <div className="text-[10px] font-semibold text-[#27D9D0]">
                          {post.authorHandle}
                        </div>
                        <div className="truncate text-xs font-bold text-white">
                          {post.title || post.content}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =======================================================================
          FULL-SCREEN STORY HIGHLIGHT PLAYER MODAL
         ======================================================================= */}
      <AnimatePresence>
        {viewingStory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={SPRINGS.modal}
              className="relative flex h-[82dvh] w-full max-w-[390px] flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-[#111426]"
            >
              {viewingStory.videoUrl ? (
                <video
                  src={viewingStory.videoUrl}
                  autoPlay
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <img
                  src={assetUrl(viewingStory.imageUrl)}
                  alt={viewingStory.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90" />

              <div className="relative z-10 space-y-3 p-4">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 6, ease: 'linear' }}
                    onAnimationComplete={() => setViewingStory(null)}
                    className="h-full bg-white"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <StudentAvatar
                      presetOrUrl={viewingStory.authorAvatar}
                      name={viewingStory.authorName}
                      size="sm"
                      className="!h-8 !w-8 !rounded-full"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {viewingStory.authorHandle}
                      </div>
                      <div className="text-[10px] text-white/75">{viewingStory.title}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close story highlight"
                    onClick={() => setViewingStory(null)}
                    className="rounded-full bg-black/45 p-1.5 text-white hover:bg-black/75"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative z-10 space-y-2.5 p-5">
                <div className="rounded-2xl border border-white/15 bg-black/60 p-3.5 backdrop-blur-md">
                  <span className="inline-block rounded-full bg-[#743BFF]/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#27D9D0]">
                    {viewingStory.title}
                  </span>
                  <p className="mt-1.5 text-xs leading-relaxed text-white">
                    {viewingStory.caption}
                  </p>
                  {viewingStory.taggedPeople && viewingStory.taggedPeople.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {viewingStory.taggedPeople.map((h) => (
                        <span
                          key={h}
                          className="rounded-full bg-[#258BFF]/25 px-2 py-0.5 text-[11px] font-semibold text-[#27D9D0]"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                  {viewingStory.attachedLink && (
                    <a
                      href={
                        /^https?:\/\//i.test(viewingStory.attachedLink)
                          ? viewingStory.attachedLink
                          : `https://${viewingStory.attachedLink}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[#27D9D0]/40 bg-[#111426]/90 px-3 py-1.5 text-xs font-semibold text-[#27D9D0] hover:text-white"
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {viewingStory.attachedLink.replace(/^https?:\/\//i, '')}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================================
          EDIT PROFILE & TEEN SAFETY PRIVACY MODAL
         ======================================================================= */}
      <AnimatePresence>
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditOpen(false)}
              className="absolute inset-0 bg-[#080910]/80 backdrop-blur-md"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Edit Student Profile and Privacy"
              layoutId="edit-profile-modal-surface"
              transition={SPRINGS.modal}
              className="ts-surface-elevated relative z-10 w-full max-w-lg rounded-3xl p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold text-white">
                  Edit Profile &amp; Teen Safety Controls
                </h2>
                <button
                  type="button"
                  aria-label="Close edit modal"
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border border-white/10 p-1.5 text-[#A5A9BC] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="ep-name" className="mb-1 block text-xs font-medium text-white">
                    Display Name
                  </label>
                  <input
                    id="ep-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ep-school" className="mb-1 block text-xs font-medium text-white">
                    School / Institution
                  </label>
                  <input
                    id="ep-school"
                    type="text"
                    value={editSchool}
                    onChange={(e) => setEditSchool(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ep-bio" className="mb-1 block text-xs font-medium text-white">
                    Biography
                  </label>
                  <textarea
                    id="ep-bio"
                    rows={3}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] p-3 text-base text-white sm:text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="ep-url" className="mb-1 block text-xs font-medium text-white">
                    Portfolio URL
                  </label>
                  <input
                    id="ep-url"
                    type="text"
                    value={editPortfolioUrl}
                    onChange={(e) => setEditPortfolioUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-xs"
                  />
                </div>

                <div className="space-y-2.5 rounded-2xl border border-[#27D9D0]/30 bg-[#080910]/80 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Teen Privacy Shield</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#A5A9BC]">
                    <label htmlFor="ep-hide-contact">
                      Mask phone ({user.phone || 'private'}) &amp; personal email
                    </label>
                    <input
                      id="ep-hide-contact"
                      type="checkbox"
                      checked={hideContact}
                      onChange={(e) => setHideContact(e.target.checked)}
                      className="h-4 w-4 accent-[#27D9D0]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-[#A5A9BC]">
                    <label htmlFor="ep-dm-perm">Who can message me</label>
                    <select
                      id="ep-dm-perm"
                      value={dmPerm}
                      onChange={(e) =>
                        setDmPerm(e.target.value as 'connections_only' | 'verified_students')
                      }
                      className="rounded-lg border border-white/12 bg-[#111426] px-2.5 py-1 text-xs text-white"
                    >
                      <option value="connections_only">Connections Only</option>
                      <option value="verified_students">Verified Students</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-xl border border-white/12 px-4 py-2 text-xs text-[#A5A9BC] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#743BFF] px-5 py-2 text-xs font-semibold text-white"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
