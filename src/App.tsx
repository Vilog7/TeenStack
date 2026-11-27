import { useState, useEffect, useCallback } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'motion/react';
import { AmbientBackground } from './components/motion/AmbientBackground';
import { LandingView } from './components/landing/LandingView';
import { AuthView } from './components/auth/AuthView';
import { VerificationFlowView } from './components/verification/VerificationFlowView';
import { ParentPortalView } from './components/verification/ParentPortalView';
import { OnboardingView } from './components/onboarding/OnboardingView';
import { AppShell } from './components/shell/AppShell';
import { HomeView } from './components/pages/HomeView';
import { PostsView } from './components/pages/PostsView';
import { OpportunitiesView } from './components/pages/OpportunitiesView';
import { ChatsView } from './components/pages/ChatsView';
import { CreateView, QuickCreateModal } from './components/pages/CreateView';
import { LearnView } from './components/pages/LearnView';
import { ProfileView } from './components/pages/ProfileView';
import { ExpandedPostModal } from './components/feed/ExpandedPostModal';
import { SearchModal } from './components/overlays/SearchModal';
import { PEER_STUDENTS, OPPORTUNITIES, COURSES, CHAT_THREADS } from './data/catalog';
import { SPRINGS } from './lib/tokens';
import { api } from './lib/api';
import type {
  AppRoute,
  NavSection,
  UserAccount,
  FeedPost,
  ChatMessage,
  ChatThread,
  PeerStudent,
  OpportunityItem,
  UserInteraction,
  CourseItem,
} from './types';

const VALID_ROUTES: AppRoute[] = [
  'landing',
  'login',
  'signup',
  'verification',
  'parent-portal',
  'onboarding',
  'home',
  'posts',
  'opportunities',
  'chats',
  'create',
  'learn',
  'profile',
];

function parseHashLocation(): { route: AppRoute | null; inviteToken: string } {
  const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
  const [pathPart, queryPart = ''] = rawHash.split('?');
  const params = new URLSearchParams(queryPart);
  const inviteToken = params.get('invite') || params.get('token') || '';
  const route = VALID_ROUTES.includes(pathPart as AppRoute) ? (pathPart as AppRoute) : null;
  return { route, inviteToken };
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHashLocation().route || 'landing');
  const [parentInviteToken, setParentInviteToken] = useState<string>(
    () => parseHashLocation().inviteToken
  );
  const [user, setUser] = useState<UserAccount | null>(null);
  const [booting, setBooting] = useState(true);
  const [ambientPaused, setAmbientPaused] = useState(false);

  // Domain state backed by SQLite
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>(CHAT_THREADS);
  const [unreadChatsCount, setUnreadChatsCount] = useState<number>(3);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peers, setPeers] = useState<PeerStudent[]>(PEER_STUDENTS);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>(OPPORTUNITIES);
  const [courses, setCourses] = useState<CourseItem[]>(COURSES);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set(['peer-maya']));
  const [appliedOppIds, setAppliedOppIds] = useState<Set<string>>(new Set());
  const [savedOppIds, setSavedOppIds] = useState<Set<string>>(new Set());
  const [completedModules, setCompletedModules] = useState<Set<string>>(
    new Set(['course-1:m1', 'course-1:m2', 'course-2:m1'])
  );

  // Interactive UI morph states
  const [expandedPost, setExpandedPost] = useState<FeedPost | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [openStorySignal, setOpenStorySignal] = useState(0);
  const [activeSkillFilter, setActiveSkillFilter] = useState('');
  const [inspectingPeer, setInspectingPeer] = useState<PeerStudent | null>(null);
  const [activeThreadId, setActiveThreadId] = useState('thread-maya');
  const [mobileShowConversation, setMobileShowConversation] = useState(false);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    window.history.pushState(null, '', `#/${next}`);
    window.scrollTo(0, 0);
  }, []);

  const hydrateInteractions = useCallback((list: UserInteraction[]) => {
    const likes = new Set<string>();
    const saves = new Set<string>();
    const connects = new Set<string>(['peer-maya']);
    const appOpps = new Set<string>();
    const svOpps = new Set<string>();
    const mods = new Set<string>(['course-1:m1', 'course-1:m2', 'course-2:m1']);

    for (const item of list) {
      if (item.target_type === 'like') likes.add(item.target_id);
      if (item.target_type === 'save') saves.add(item.target_id);
      if (item.target_type === 'connect') connects.add(item.target_id);
      if (item.target_type === 'opportunity_apply') appOpps.add(item.target_id);
      if (item.target_type === 'opportunity_save') svOpps.add(item.target_id);
      if (item.target_type === 'course_module') mods.add(item.target_id);
    }

    setLikedPostIds(likes);
    setSavedPostIds(saves);
    setConnectedIds(connects);
    setAppliedOppIds(appOpps);
    setSavedOppIds(svOpps);
    setCompletedModules(mods);
  }, []);

  const refreshContent = useCallback(async () => {
    try {
      const boot = await api.getBootstrap();
      setPosts(boot.posts);
      setThreads(boot.threads);
      setUnreadChatsCount(boot.unreadChatsCount);
      setMessages(boot.messages);
      setPeers(boot.peers);
      setOpportunities(boot.opportunities);
      setCourses(boot.courses);
      if (boot.completedModuleKeys) {
        setCompletedModules(new Set(boot.completedModuleKeys));
      }
      if (boot.interactions) {
        hydrateInteractions(boot.interactions);
      }
      if (boot.friendIds && boot.friendIds.length > 0) {
        setConnectedIds(new Set(boot.friendIds));
      }
    } catch {
      try {
        const pRes = await api.getPosts();
        setPosts(pRes.posts);
      } catch {
        // ignore if offline
      }
    }
  }, [hydrateInteractions]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseHashLocation();
      if (parsed.inviteToken) setParentInviteToken(parsed.inviteToken);
      if (parsed.route) setRoute(parsed.route);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    (async () => {
      const initialLoc = parseHashLocation();
      if (initialLoc.route === 'parent-portal') {
        if (initialLoc.inviteToken) setParentInviteToken(initialLoc.inviteToken);
        setBooting(false);
        return;
      }
      await refreshContent();
      const session = await api.me();
      if (session.authenticated && session.user) {
        setUser(session.user);
        hydrateInteractions(session.interactions || []);
        const acctStatus = session.user.accountStatus || 'ACTIVE';
        if (acctStatus !== 'ACTIVE') {
          navigate('verification');
        } else if (
          !initialLoc.route ||
          initialLoc.route === 'landing' ||
          initialLoc.route === 'login' ||
          initialLoc.route === 'signup'
        ) {
          navigate(session.user.onboardingCompleted ? 'home' : 'onboarding');
        }
      }
      setBooting(false);
    })();
  }, [hydrateInteractions, navigate, refreshContent]);

  const handleAuthenticated = async (
    authedUser: UserAccount,
    interactions: UserInteraction[],
    isNewSignup: boolean
  ) => {
    hydrateInteractions(interactions);
    await refreshContent();

    const acctStatus = authedUser.accountStatus || 'ACTIVE';
    if (acctStatus !== 'ACTIVE') {
      // Strictly gate PENDING_VERIFICATION / unverified accounts at the Verification Flow
      setUser(authedUser);
      navigate('verification');
      return;
    }

    if (isNewSignup) {
      setUser(authedUser);
      navigate('onboarding');
    } else {
      let readyUser = authedUser;
      if (!authedUser.onboardingCompleted) {
        try {
          const saved = await api.saveOnboarding({ completed: true });
          readyUser = saved.user;
        } catch {
          readyUser = { ...authedUser, onboardingCompleted: true };
        }
      }
      setUser(readyUser);
      navigate('home');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setInspectingPeer(null);
    navigate('landing');
  };

  const handleToggleLike = async (postId: string) => {
    const wasLiked = likedPostIds.has(postId);
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likesCount: Math.max(0, p.likesCount + (wasLiked ? -1 : 1)) } : p
      )
    );
    setExpandedPost((curr) =>
      curr && curr.id === postId
        ? { ...curr, likesCount: Math.max(0, curr.likesCount + (wasLiked ? -1 : 1)) }
        : curr
    );
    await api.toggleInteraction('like', postId).catch(() => {});
  };

  const handleToggleSave = async (postId: string) => {
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
    await api.toggleInteraction('save', postId).catch(() => {});
  };

  const handleAddComment = async (postId: string, text: string) => {
    const res = await api.commentPost(postId, text);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: res.comments } : p)));
    setExpandedPost((curr) => (curr && curr.id === postId ? { ...curr, comments: res.comments } : curr));
  };

  const handleDeletePost = async (postId: string) => {
    await api.deletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    const res = await api.deleteComment(postId, commentId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: res.comments } : p)));
    setExpandedPost((curr) => (curr && curr.id === postId ? { ...curr, comments: res.comments } : curr));
  };

  const handleBlockPeer = async (peerId: string) => {
    const res = await api.toggleBlockUser(peerId, 'Blocked from profile');
    if (res.blocked) {
      setPeers((prev) => prev.filter((p) => p.id !== peerId));
      setPosts((prev) => prev.filter((p) => p.authorId !== peerId));
      setConnectedIds((prev) => {
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }
  };

  const handlePublishPost = async (payload: {
    category: FeedPost['category'];
    title: string;
    content: string;
    mediaType: FeedPost['mediaType'];
    mediaMeta?: Record<string, any>;
    skillTags: string[];
  }) => {
    const res = await api.createPost(payload);
    setPosts((prev) => [res.post, ...prev]);
    if (payload.category === 'story') {
      setOpenStorySignal((n) => n + 1);
      navigate('home');
    } else if (route === 'create') {
      navigate('home');
    }
  };

  const handleToggleConnect = async (peerId: string) => {
    setConnectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
    await api.toggleInteraction('connect', peerId).catch(() => {});
  };

  const handleInspectAuthor = (authorId: string, authorName: string, avatar: string) => {
    if (user && authorId === user.id) {
      setInspectingPeer(null);
      navigate('profile');
      return;
    }
    const found =
      peers.find((p) => p.id === authorId) ||
      peers.find((p) => p.name === authorName) ||
      PEER_STUDENTS.find((p) => p.id === authorId) ||
      PEER_STUDENTS.find((p) => p.name === authorName) || {
        id: authorId,
        name: authorName,
        handle: `@${authorName.toLowerCase().replace(/\s+/g, '_')}`,
        age: 17,
        school: 'TeenStack Verified School',
        avatarPreset: avatar,
        headline: 'Student Builder on TeenStack',
        bio: 'Building projects and learning alongside peers.',
        skills: ['TypeScript', 'Design'],
        tags: ['#TeenBuilder'],
        mutualConnections: 6,
        projects: [],
        achievements: ['Active TeenStack Contributor'],
        online: true,
      };
    setInspectingPeer(found);
    navigate('profile');
  };

  const handleSendMessage = async (threadId: string, text: string) => {
    const res = await api.sendMessage(threadId, text);
    setMessages((prev) => [...prev, res.message]);
  };

  const handleShareCourseCertificate = async (course: CourseItem) => {
    await handlePublishPost({
      category: 'certificate',
      title: `Earned Credential: ${course.title}`,
      content: `Completed interactive modules in ${course.track} mentored by ${course.mentor}!`,
      mediaType: 'certificate_card',
      mediaMeta: {
        award: course.title,
        issuer: `TeenStack Learn · ${course.level}`,
        verified: true,
      },
      skillTags: course.skills.slice(0, 3),
    });
  };

  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080910] text-white">
        <div className="h-8 w-8 rounded-full border-2 border-[#743BFF] border-t-[#27D9D0] ts-spin" />
      </div>
    );
  }

  const isAccountVerifiedActive = Boolean(
    user && (user.accountStatus || 'ACTIVE') === 'ACTIVE'
  );
  const mustVerifyAccount = Boolean(user && !isAccountVerifiedActive);
  const mustCompleteSetup = Boolean(
    user && isAccountVerifiedActive && !user.onboardingCompleted && route !== 'verification'
  );

  const isAuthAppSection =
    user &&
    isAccountVerifiedActive &&
    !mustCompleteSetup &&
    route !== 'parent-portal' &&
    route !== 'verification' &&
    ['home', 'posts', 'opportunities', 'chats', 'create', 'learn', 'profile'].includes(route);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh bg-[#080910] text-white">
        {/* Continuous Morphing Background Orbs & Grid */}
        <AmbientBackground route={mustCompleteSetup ? 'onboarding' : route} paused={ambientPaused} />

        {/* Pre-Auth, Parent Portal, Verification Gate & Setup Views */}
        {!isAuthAppSection ? (
          route === 'parent-portal' ? (
            <ParentPortalView
              initialInviteToken={parentInviteToken}
              onExitPortal={() => {
                setParentInviteToken('');
                if (user) {
                  navigate(isAccountVerifiedActive ? 'home' : 'verification');
                } else {
                  navigate('login');
                }
              }}
            />
          ) : (mustVerifyAccount || route === 'verification') && user ? (
            <VerificationFlowView
              user={user}
              onUpdateUser={setUser}
              onProceedAfterApproval={() => {
                navigate(user.onboardingCompleted ? 'home' : 'onboarding');
              }}
              onOpenParentPortalWithToken={(invTok) => {
                setParentInviteToken(invTok);
                window.history.pushState(null, '', `#/parent-portal?invite=${invTok}`);
                setRoute('parent-portal');
              }}
              onLogout={handleLogout}
            />
          ) : route === 'login' || route === 'signup' ? (
            <AuthView
              mode={route}
              onSwitchMode={(next) => navigate(next)}
              onBackToLanding={() => navigate('landing')}
              onOpenParentPortal={() => {
                setParentInviteToken('');
                navigate('parent-portal');
              }}
              onAuthenticated={handleAuthenticated}
            />
          ) : (route === 'onboarding' || mustCompleteSetup) && user ? (
            <OnboardingView
              user={user}
              onUpdateUser={setUser}
              onFinishToHome={(updated) => {
                setUser(updated);
                setInspectingPeer(null);
                navigate('home');
              }}
            />
          ) : (
            <LandingView onNavigateAuth={(mode) => navigate(mode)} />
          )
        ) : (
          /* Main Authenticated Application Shell (Desktop 3-Column <-> Mobile Bottom Pill Morph) */
          <AppShell
            activeSection={route as NavSection}
            user={user}
            unreadChatsCount={unreadChatsCount}
            ambientPaused={ambientPaused}
            onToggleAmbient={() => setAmbientPaused((v) => !v)}
            onNavigate={(sec) => {
              if (sec === 'profile') setInspectingPeer(null);
              if (sec === 'chats') {
                setMobileShowConversation(false);
                api
                  .markThreadRead(activeThreadId)
                  .then((r) => {
                    setThreads(r.threads);
                    setUnreadChatsCount(r.totalUnread);
                  })
                  .catch(() => {});
              }
              navigate(sec);
            }}
            onOpenQuickCreate={() => setQuickCreateOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onQuickSelectThread={(threadId) => {
              setActiveThreadId(threadId);
              setMobileShowConversation(true);
              api
                .markThreadRead(threadId)
                .then((r) => {
                  setThreads(r.threads);
                  setUnreadChatsCount(r.totalUnread);
                })
                .catch(() => {});
              navigate('chats');
            }}
            onLogout={handleLogout}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={route}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRINGS.morph}
              >
                {route === 'home' && (
                  <HomeView
                    user={user}
                    posts={posts}
                    peers={peers}
                    opportunities={opportunities}
                    messages={messages}
                    likedPostIds={likedPostIds}
                    savedPostIds={savedPostIds}
                    connectedIds={connectedIds}
                    openStorySignal={openStorySignal}
                    onOpenSearch={() => setSearchOpen(true)}
                    onToggleLike={handleToggleLike}
                    onToggleSave={handleToggleSave}
                    onToggleConnect={handleToggleConnect}
                    onSelectPeer={(peer) => {
                      setInspectingPeer(peer);
                      navigate('profile');
                    }}
                    onOpenPost={setExpandedPost}
                    onInspectAuthor={handleInspectAuthor}
                    onAddComment={handleAddComment}
                    onNavigate={(sec) => navigate(sec)}
                    onOpenChatThread={(threadId) => {
                      setActiveThreadId(threadId);
                      setMobileShowConversation(true);
                      navigate('chats');
                    }}
                  />
                )}

                {route === 'posts' && (
                  <PostsView
                    user={user}
                    posts={posts}
                    opportunities={opportunities}
                    likedPostIds={likedPostIds}
                    savedPostIds={savedPostIds}
                    appliedOppIds={appliedOppIds}
                    savedOppIds={savedOppIds}
                    activeSkillFilter={activeSkillFilter}
                    onClearSkillFilter={() => setActiveSkillFilter('')}
                    onToggleLike={handleToggleLike}
                    onToggleSave={handleToggleSave}
                    onToggleApplyOpp={async (oppId, pitchNote) => {
                      setAppliedOppIds((prev) => new Set(prev).add(oppId));
                      await api.applyToOpportunity(oppId, pitchNote || '').catch(() => {});
                    }}
                    onToggleSaveOpp={(oppId) => {
                      setSavedOppIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(oppId)) next.delete(oppId);
                        else next.add(oppId);
                        return next;
                      });
                      api.toggleInteraction('opportunity_save', oppId).catch(() => {});
                    }}
                    onCreateOpportunity={async (payload) => {
                      const res = await api.createOpportunity(payload);
                      setOpportunities((prev) => [res.opportunity, ...prev]);
                    }}
                    onOpenPost={setExpandedPost}
                    onInspectAuthor={handleInspectAuthor}
                    onAddComment={handleAddComment}
                  />
                )}

                {route === 'opportunities' && (
                  <OpportunitiesView
                    user={user}
                    opportunities={opportunities}
                    appliedIds={appliedOppIds}
                    savedOppIds={savedOppIds}
                    onToggleApply={async (oppId, pitchNote) => {
                      setAppliedOppIds((prev) => new Set(prev).add(oppId));
                      await api.applyToOpportunity(oppId, pitchNote || '').catch(() => {});
                    }}
                    onToggleSaveOpp={(oppId) => {
                      setSavedOppIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(oppId)) next.delete(oppId);
                        else next.add(oppId);
                        return next;
                      });
                      api.toggleInteraction('opportunity_save', oppId).catch(() => {});
                    }}
                    onCreateOpportunity={async (payload) => {
                      const res = await api.createOpportunity(payload);
                      setOpportunities((prev) => [res.opportunity, ...prev]);
                    }}
                  />
                )}

                {route === 'chats' && (
                  <ChatsView
                    user={user}
                    threads={threads}
                    messages={messages}
                    activeThreadId={activeThreadId}
                    mobileShowConversation={mobileShowConversation}
                    onSelectThread={(tId, openMobile) => {
                      setActiveThreadId(tId);
                      setMobileShowConversation(openMobile);
                      api
                        .markThreadRead(tId)
                        .then((r) => {
                          setThreads(r.threads);
                          setUnreadChatsCount(r.totalUnread);
                        })
                        .catch(() => {});
                    }}
                    onBackToListMobile={() => setMobileShowConversation(false)}
                    onSendMessage={handleSendMessage}
                  />
                )}

                {route === 'create' && (
                  <CreateView user={user} onPublish={handlePublishPost} />
                )}

                {route === 'learn' && (
                  <LearnView
                    user={user}
                    courses={courses}
                    completedModuleKeys={completedModules}
                    onToggleModule={(modKey) => {
                      setCompletedModules((prev) => {
                        const next = new Set(prev);
                        if (next.has(modKey)) next.delete(modKey);
                        else next.add(modKey);
                        return next;
                      });
                      const [cId, mCode] = modKey.split(':');
                      if (cId && mCode) {
                        api
                          .toggleCourseModule(cId, mCode)
                          .then((res) => {
                            setCourses(res.courses);
                            setCompletedModules(new Set(res.completedModuleKeys));
                            if (res.user) setUser(res.user);
                          })
                          .catch(() => {});
                      }
                    }}
                    onShareCourseCertificate={handleShareCourseCertificate}
                  />
                )}

                {route === 'profile' && (
                  <ProfileView
                    user={user}
                    posts={posts}
                    peers={peers}
                    savedPostIds={savedPostIds}
                    inspectingPeer={inspectingPeer}
                    connectedIds={connectedIds}
                    onClearInspectingPeer={() => setInspectingPeer(null)}
                    onSelectPeer={(peer) => setInspectingPeer(peer)}
                    onToggleConnect={handleToggleConnect}
                    onMessagePeer={async (threadId, peerId) => {
                      if (peerId) {
                        try {
                          const opened = await api.openDirectThread(peerId);
                          setThreads(opened.threads);
                          setUnreadChatsCount(opened.totalUnread);
                          setActiveThreadId(opened.threadId);
                        } catch {
                          if (threadId) setActiveThreadId(threadId);
                        }
                      } else if (threadId) {
                        setActiveThreadId(threadId);
                      }
                      setMobileShowConversation(true);
                      navigate('chats');
                    }}
                    onOpenPost={setExpandedPost}
                    onNavigate={(sec) => navigate(sec)}
                    onSaveProfilePatch={async (patch, nextName) => {
                      const res = await api.saveOnboarding({
                        profilePatch: patch,
                        fullName: nextName,
                      });
                      setUser(res.user);
                    }}
                    onAddProject={async (payload) => {
                      const res = await api.addProject(payload);
                      setUser(res.user);
                    }}
                    onAddAchievement={async (title) => {
                      const res = await api.addAchievement({ title });
                      setUser(res.user);
                    }}
                    onBlockPeer={handleBlockPeer}
                    onOpenOnboardingWizard={() => navigate('onboarding')}
                    onLogout={handleLogout}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </AppShell>
        )}

        {/* Shared-Layout Morphing Overlays */}
        <ExpandedPostModal
          post={expandedPost}
          currentUserId={user?.id}
          liked={expandedPost ? likedPostIds.has(expandedPost.id) : false}
          saved={expandedPost ? savedPostIds.has(expandedPost.id) : false}
          onClose={() => setExpandedPost(null)}
          onToggleLike={handleToggleLike}
          onToggleSave={handleToggleSave}
          onAddComment={handleAddComment}
          onDeletePost={handleDeletePost}
          onDeleteComment={handleDeleteComment}
          onReportPost={async (postId) => {
            await api.reportContent({
              targetType: 'post',
              targetId: postId,
              reasonCategory: 'Unsafe or Inappropriate Content',
            });
          }}
        />

        {user && (
          <>
            <SearchModal
              open={searchOpen}
              posts={posts}
              peers={peers}
              opportunities={opportunities}
              courses={courses}
              onClose={() => setSearchOpen(false)}
              onNavigate={(sec) => navigate(sec)}
              onSelectPeer={(peer) => {
                setInspectingPeer(peer);
                navigate('profile');
              }}
              onOpenPost={setExpandedPost}
            />

            <QuickCreateModal
              open={quickCreateOpen}
              user={user}
              onClose={() => setQuickCreateOpen(false)}
              onPublish={handlePublishPost}
            />
          </>
        )}
      </div>
    </MotionConfig>
  );
}

export default App;
