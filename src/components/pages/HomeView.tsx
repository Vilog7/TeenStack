import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, MessageSquare, ArrowRight } from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { PostCard } from '../feed/PostCard';
import { PEER_STUDENTS, OPPORTUNITIES } from '../../data/catalog';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import type { ChatMessage, FeedPost, NavSection, PeerStudent, UserAccount } from '../../types';

interface HomeViewProps {
  user: UserAccount;
  posts: FeedPost[];
  messages?: ChatMessage[];
  likedPostIds: Set<string>;
  savedPostIds: Set<string>;
  connectedIds: Set<string>;
  onOpenSearch: () => void;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onToggleConnect: (peerId: string) => void;
  onSelectPeer: (peer: PeerStudent) => void;
  onOpenPost: (post: FeedPost) => void;
  onInspectAuthor: (authorId: string, authorName: string, avatar: string) => void;
  onAddComment: (postId: string, text: string) => Promise<void>;
  onNavigate: (section: NavSection) => void;
  onOpenChatThread: (threadId: string) => void;
}

const STORY_IMAGES: Record<string, string> = {
  'peer-maya': 'images/posts/shader-desk.jpg',
  'peer-rohan': 'images/posts/rover-lake.jpg',
  'peer-zara': 'images/teens/biotech-scientist.jpg',
  'peer-kai': 'images/teens/ai-coder.jpg',
  'peer-ananya': 'images/posts/braille-app.jpg',
};

/**
 * Authentic Instagram Layout adapted for TeenStack:
 * - Centered Feed Column (~470–500px):
 *   1. Horizontal Circular Student Build Stories Bar at the top (tap any story to view!)
 *   2. Thin For You / Projects / Achievements / Study Notes filter tabs
 *   3. Edge-to-edge Instagram PostCards with double-tap like & inline commenting
 * - Right Desktop Column (~300px, lg+):
 *   1. Current Student Switcher / Profile Row
 *   2. "Suggested for you" student builders with Connect/Following buttons
 *   3. Upcoming Hackathons quick links
 */
export function HomeView({
  user,
  posts,
  likedPostIds,
  savedPostIds,
  connectedIds,
  onToggleLike,
  onToggleSave,
  onToggleConnect,
  onSelectPeer,
  onOpenPost,
  onInspectAuthor,
  onAddComment,
  onNavigate,
}: HomeViewProps) {
  const [feedFilter, setFeedFilter] = useState<'all' | 'project' | 'achievement' | 'tutorial'>('all');
  const [activeStoryPeer, setActiveStoryPeer] = useState<PeerStudent | null>(null);
  const [seenStories, setSeenStories] = useState<Set<string>>(new Set());

  const visiblePosts = posts.filter((p) => (feedFilter === 'all' ? true : p.category === feedFilter));

  const openStory = (peer: PeerStudent) => {
    setSeenStories((prev) => new Set(prev).add(peer.id));
    setActiveStoryPeer(peer);
  };

  return (
    <div className="mx-auto flex max-w-[850px] justify-center gap-12">
      {/* CENTER INSTAGRAM FEED COLUMN */}
      <div className="w-full max-w-[470px] sm:max-w-[490px]">
        {/* 1. INSTAGRAM STORIES ROW (Your Build + Peer Student Highlights) */}
        <section
          aria-label="Student build stories"
          className="ts-snap-scroller border-b border-white/10 px-3 py-3 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-[#0B0E1A] sm:px-4"
        >
          {/* Current User "Your story / Add Build" */}
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className="flex w-[66px] shrink-0 flex-col items-center gap-1.5 text-center"
          >
            <div className="relative rounded-full p-[2px] ring-1 ring-white/20">
              <StudentAvatar
                presetOrUrl={user.profile.avatarUrl || user.profile.avatarPreset}
                name={user.fullName}
                size="lg"
                className="!h-14 !w-14 !rounded-full"
              />
              <span className="absolute right-0 bottom-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#080910] bg-[#258BFF] text-white">
                <Plus className="h-3 w-3 stroke-[3]" />
              </span>
            </div>
            <span className="w-full truncate text-[11px] text-[#A5A9BC]">Your build</span>
          </button>

          {/* Peer Builder Stories */}
          {PEER_STUDENTS.map((peer) => {
            const seen = seenStories.has(peer.id);
            return (
              <button
                key={peer.id}
                type="button"
                onClick={() => openStory(peer)}
                className="flex w-[66px] shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <div
                  className={`rounded-full p-[2.5px] ${
                    seen
                      ? 'bg-white/20'
                      : 'bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0]'
                  }`}
                >
                  <div className="rounded-full bg-[#080910] p-[2px]">
                    <StudentAvatar
                      presetOrUrl={peer.avatarPreset}
                      name={peer.name}
                      size="lg"
                      className="!h-14 !w-14 !rounded-full"
                    />
                  </div>
                </div>
                <span className="w-full truncate text-[11px] text-white/90">
                  {peer.handle.replace(/^@/, '')}
                </span>
              </button>
            );
          })}
        </section>

        {/* 2. THIN INSTAGRAM-STYLE FEED TABS */}
        <div className="flex items-center gap-5 border-b border-white/8 px-3.5 py-2.5 text-xs sm:px-1">
          {(
            [
              { id: 'all', label: 'For you' },
              { id: 'project', label: 'Projects' },
              { id: 'achievement', label: 'Wins' },
              { id: 'tutorial', label: 'Notes' },
            ] as const
          ).map((t) => {
            const active = feedFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFeedFilter(t.id)}
                className={`relative pb-1 font-semibold transition-colors ${
                  active ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="ig-feed-subtab"
                    transition={SPRINGS.pill}
                    className="absolute inset-x-0 -bottom-[11px] h-[1.5px] bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 3. POST CARDS STREAM (+ Instagram Mobile "Suggested for you" Carousel after 1st post) */}
        <div className="mt-0 space-y-0 sm:mt-4 sm:space-y-5">
          {visiblePosts.map((post, idx) => (
            <div key={post.id}>
              <PostCard
                post={post}
                liked={likedPostIds.has(post.id)}
                saved={savedPostIds.has(post.id)}
                onToggleLike={onToggleLike}
                onToggleSave={onToggleSave}
                onOpenPost={onOpenPost}
                onInspectAuthor={onInspectAuthor}
                onAddComment={onAddComment}
              />

              {/* Mobile Instagram Inline "Suggested for you" Horizontal Carousel */}
              {idx === 0 && (
                <div className="border-b border-white/10 bg-[#080910] px-3.5 py-4 lg:hidden">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Suggested for you</span>
                    <button
                      type="button"
                      onClick={() => onNavigate('posts')}
                      className="text-xs font-bold text-[#258BFF]"
                    >
                      See all
                    </button>
                  </div>

                  <div className="ts-snap-scroller pb-1">
                    {PEER_STUDENTS.map((peer) => {
                      const isConnected = connectedIds.has(peer.id);
                      return (
                        <div
                          key={peer.id}
                          className="flex w-36 shrink-0 flex-col items-center rounded-2xl border border-white/10 bg-[#111426]/80 p-3.5 text-center"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectPeer(peer)}
                            className="flex flex-col items-center"
                          >
                            <StudentAvatar
                              presetOrUrl={peer.avatarPreset}
                              name={peer.name}
                              size="md"
                              className="!h-14 !w-14 !rounded-full"
                            />
                            <span className="mt-2 max-w-[120px] truncate text-xs font-bold text-white">
                              {peer.handle.replace(/^@/, '')}
                            </span>
                            <span className="max-w-[120px] truncate text-[10px] text-[#A5A9BC]">
                              {peer.school}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleConnect(peer.id)}
                            className={`mt-3 w-full rounded-lg py-1.5 text-xs font-bold ${
                              isConnected
                                ? 'bg-white/10 text-white'
                                : 'bg-[#258BFF] text-white'
                            }`}
                          >
                            {isConnected ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT INSTAGRAM SUGGESTIONS SIDEBAR (Desktop lg+) */}
      <aside aria-label="Suggested students" className="hidden w-[300px] shrink-0 pt-2 lg:block">
        <div className="sticky top-6 space-y-6">
          {/* Current User Row */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <StudentAvatar
                presetOrUrl={user.profile.avatarUrl || user.profile.avatarPreset}
                name={user.fullName}
                size="md"
                className="!h-11 !w-11 !rounded-full"
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-white">{user.username}</div>
                <div className="truncate text-xs text-[#A5A9BC]">{user.fullName}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs font-bold text-[#258BFF] hover:text-white"
            >
              Profile
            </button>
          </div>

          {/* Suggested For You */}
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-xs font-bold text-[#A5A9BC]">Suggested for you</span>
              <button
                type="button"
                onClick={() => onNavigate('posts')}
                className="text-xs font-bold text-white hover:text-[#A5A9BC]"
              >
                See All
              </button>
            </div>

            <div className="space-y-3">
              {PEER_STUDENTS.map((peer) => {
                const isConnected = connectedIds.has(peer.id);
                return (
                  <div key={peer.id} className="flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectPeer(peer)}
                      className="flex min-w-0 items-center gap-2.5 text-left"
                    >
                      <StudentAvatar
                        presetOrUrl={peer.avatarPreset}
                        name={peer.name}
                        size="sm"
                        className="!h-8 !w-8 !rounded-full"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white hover:underline">
                          {peer.handle.replace(/^@/, '')}
                        </div>
                        <div className="truncate text-[11px] text-[#A5A9BC]">
                          {peer.school} · {peer.mutualConnections} mutuals
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleConnect(peer.id)}
                      className={`shrink-0 text-xs font-bold ${
                        isConnected
                          ? 'text-[#A5A9BC] hover:text-white'
                          : 'text-[#258BFF] hover:text-[#27D9D0]'
                      }`}
                    >
                      {isConnected ? 'Following' : 'Follow'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compact Opportunities / Hackathons Strip */}
          <div className="border-t border-white/8 pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-[#A5A9BC]">Active Hackathons & Ads</span>
              <button
                type="button"
                onClick={() => onNavigate('opportunities')}
                className="inline-flex items-center gap-0.5 text-xs font-bold text-[#27D9D0] hover:underline"
              >
                Open <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2">
              {OPPORTUNITIES.slice(0, 2).map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => onNavigate('opportunities')}
                  className="block w-full rounded-xl border border-white/8 bg-[#111426]/65 p-2.5 text-left hover:border-[#743BFF]/45"
                >
                  <div className="truncate text-xs font-semibold text-white">{opp.title}</div>
                  <div className="mt-0.5 text-[11px] text-[#27D9D0]">
                    {opp.reward} · {opp.deadline}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-[#A5A9BC]/55">
            © 2026 TeenStack · Founder Vihaan Bhattacharjee
          </p>
        </div>
      </aside>

      {/* FULL-SCREEN INSTAGRAM STORY MODAL WHEN TAPPING A STUDENT STORY RING */}
      <AnimatePresence>
        {activeStoryPeer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={SPRINGS.modal}
              className="relative flex h-[82dvh] w-full max-w-[390px] flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-[#111426]"
            >
              <img
                src={assetUrl(STORY_IMAGES[activeStoryPeer.id] || 'images/teens/astrophysics-maker.jpg')}
                alt={activeStoryPeer.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90" />

              {/* Story Progress Bar & Author Header */}
              <div className="relative z-10 space-y-3 p-4">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 6, ease: 'linear' }}
                    onAnimationComplete={() => setActiveStoryPeer(null)}
                    className="h-full bg-white"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const p = activeStoryPeer;
                      setActiveStoryPeer(null);
                      onSelectPeer(p);
                    }}
                    className="flex items-center gap-2.5 text-left"
                  >
                    <StudentAvatar
                      presetOrUrl={activeStoryPeer.avatarPreset}
                      name={activeStoryPeer.name}
                      size="sm"
                      className="!h-8 !w-8 !rounded-full"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {activeStoryPeer.handle.replace(/^@/, '')}
                      </div>
                      <div className="text-[10px] text-white/75">{activeStoryPeer.school}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label="Close story"
                    onClick={() => setActiveStoryPeer(null)}
                    className="rounded-full bg-black/40 p-1.5 text-white hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Story Bottom Build Highlight & Reply Trigger */}
              <div className="relative z-10 space-y-3 p-5">
                <div className="rounded-2xl border border-white/15 bg-black/55 p-3.5 backdrop-blur-md">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#27D9D0]">
                    Current Student Build
                  </span>
                  <div className="mt-0.5 font-heading text-sm font-bold text-white">
                    {activeStoryPeer.projects[0]?.title || activeStoryPeer.headline}
                  </div>
                  <p className="mt-1 text-xs text-white/80">
                    {activeStoryPeer.projects[0]?.summary || activeStoryPeer.bio}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveStoryPeer(null);
                    onNavigate('chats');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 py-2.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/20"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[#27D9D0]" />
                  <span>Reply to {activeStoryPeer.name.split(' ')[0]}…</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
