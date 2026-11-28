import { useState } from 'react';
import { motion } from 'motion/react';
import { Compass, Briefcase, LayoutGrid, Rows3, X } from 'lucide-react';
import { PostCard } from '../feed/PostCard';
import { OpportunitiesView } from './OpportunitiesView';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import type { FeedPost, OpportunityItem, UserAccount } from '../../types';

interface PostsViewProps {
  user: UserAccount;
  posts: FeedPost[];
  opportunities?: OpportunityItem[];
  likedPostIds: Set<string>;
  savedPostIds: Set<string>;
  appliedOppIds: Set<string>;
  savedOppIds: Set<string>;
  activeSkillFilter: string;
  onClearSkillFilter: () => void;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onToggleApplyOpp: (oppId: string, pitchNote?: string) => Promise<void> | void;
  onToggleSaveOpp: (oppId: string) => void;
  onCreateOpportunity?: (payload: {
    title: string;
    organization?: string;
    type: OpportunityItem['type'];
    deadline: string;
    mode: OpportunityItem['Mode'];
    reward: string;
    skills: string[];
    description: string;
  }) => Promise<void>;
  onOpenPost: (post: FeedPost) => void;
  onInspectAuthor: (authorId: string, authorName: string, avatar: string) => void;
  onAddComment?: (postId: string, text: string) => Promise<void>;
}

const CATEGORIES = [
  { id: 'all', label: 'All Discoveries' },
  { id: 'reel', label: 'Reels & Video' },
  { id: 'project', label: 'Projects' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'tutorial', label: 'Study Guides' },
  { id: 'saved', label: 'Saved Bookmarks' },
] as const;

export function PostsView({
  user,
  posts,
  opportunities,
  likedPostIds,
  savedPostIds,
  appliedOppIds,
  savedOppIds,
  activeSkillFilter,
  onClearSkillFilter,
  onToggleLike,
  onToggleSave,
  onToggleApplyOpp,
  onToggleSaveOpp,
  onCreateOpportunity,
  onOpenPost,
  onInspectAuthor,
  onAddComment,
}: PostsViewProps) {
  const [sectionTab, setSectionTab] = useState<'posts' | 'ads'>('posts');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all');
  const [compactGrid, setCompactGrid] = useState(false);

  const filtered = posts.filter((p) => {
    if (p.category === 'story') return false;
    if (category === 'saved' && !savedPostIds.has(p.id)) return false;
    if (category === 'reel' && p.category !== 'reel' && p.category !== 'video') return false;
    if (
      category !== 'all' &&
      category !== 'saved' &&
      category !== 'reel' &&
      p.category !== category
    ) {
      return false;
    }
    if (activeSkillFilter) {
      const needle = activeSkillFilter.toLowerCase();
      const hay = `${p.title} ${p.content} ${p.skillTags.join(' ')}`.toLowerCase();
      return hay.includes(needle.split(' ')[0]);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Segmented Switcher for "Posts & Ads" Dock Tab */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Posts and Ads switcher"
          className="inline-flex items-center rounded-2xl border border-white/14 bg-[#111426]/95 p-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={sectionTab === 'posts'}
            onClick={() => setSectionTab('posts')}
            className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold sm:text-sm ${
              sectionTab === 'posts' ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
            }`}
          >
            {sectionTab === 'posts' && (
              <motion.span
                layoutId="posts-ads-top-tab"
                transition={SPRINGS.pill}
                className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF]"
              />
            )}
            <Compass className="h-4 w-4" />
            <span>Student Posts</span>
          </button>

          <button
            role="tab"
            type="button"
            aria-selected={sectionTab === 'ads'}
            onClick={() => setSectionTab('ads')}
            className={`relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold sm:text-sm ${
              sectionTab === 'ads' ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
            }`}
          >
            {sectionTab === 'ads' && (
              <motion.span
                layoutId="posts-ads-top-tab"
                transition={SPRINGS.pill}
                className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF]"
              />
            )}
            <Briefcase className="h-4 w-4" />
            <span>Ads & Opportunities</span>
          </button>
        </div>

        {sectionTab === 'posts' && (
          <div className="inline-flex items-center rounded-2xl border border-white/12 bg-[#080910]/80 p-1">
            <button
              type="button"
              aria-label="Stream layout"
              aria-pressed={!compactGrid}
              onClick={() => setCompactGrid(false)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                !compactGrid ? 'bg-[#743BFF] text-white' : 'text-[#A5A9BC] hover:text-white'
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" />
              <span>Stream</span>
            </button>
            <button
              type="button"
              aria-label="Grid layout"
              aria-pressed={compactGrid}
              onClick={() => setCompactGrid(true)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                compactGrid ? 'bg-[#743BFF] text-white' : 'text-[#A5A9BC] hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
          </div>
        )}
      </div>

      {sectionTab === 'ads' ? (
        <OpportunitiesView
          user={user}
          opportunities={opportunities}
          appliedIds={appliedOppIds}
          savedOppIds={savedOppIds}
          onToggleApply={onToggleApplyOpp}
          onToggleSaveOpp={onToggleSaveOpp}
          onCreateOpportunity={onCreateOpportunity}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="ts-snap-scroller pb-1">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`relative shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold transition-colors ${
                      active ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="posts-category-pill"
                        transition={SPRINGS.pill}
                        className="absolute inset-0 -z-10 rounded-2xl border border-[#258BFF]/50 bg-[#161A36]"
                      />
                    )}
                    {c.label}
                  </button>
                );
              })}
            </div>

            {activeSkillFilter && (
              <button
                type="button"
                onClick={onClearSkillFilter}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#27D9D0]/40 bg-[#27D9D0]/12 px-3 py-1 text-xs font-medium text-[#27D9D0]"
              >
                <span>Topic: {activeSkillFilter}</span>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="ts-surface rounded-3xl p-10 text-center">
              <p className="font-heading text-base font-semibold text-white">
                No matching student posts yet
              </p>
              <p className="mt-1 text-xs text-[#A5A9BC]">
                Try switching categories or clearing the active topic filter.
              </p>
            </div>
          ) : compactGrid ? (
            /* Authentic Instagram 3-Column Visual Explore Grid (Mobile & Desktop) */
            <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl sm:gap-1.5 sm:rounded-2xl">
              {filtered.map((post) => {
                const thumbMap: Record<string, string> = {
                  'peer-maya': 'images/posts/shader-desk.jpg',
                  'peer-rohan': 'images/posts/rover-lake.jpg',
                  'peer-zara': 'images/teens/biotech-scientist.jpg',
                  'peer-ananya': 'images/posts/braille-app.jpg',
                  'peer-kai': 'images/teens/ai-coder.jpg',
                };
                const thumb = assetUrl(
                  post.mediaMeta?.imageUrl ||
                    thumbMap[post.authorId] ||
                    'images/teens/astrophysics-maker.jpg'
                );
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpenPost(post)}
                    className="group relative aspect-square w-full overflow-hidden bg-[#111426] text-left"
                  >
                    <img
                      src={thumb}
                      alt={post.title || post.authorName}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <div className="absolute inset-x-1.5 bottom-1.5 truncate text-[10px] font-semibold text-white sm:inset-x-2.5 sm:bottom-2 sm:text-xs">
                      {post.title || post.authorHandle}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  liked={likedPostIds.has(post.id)}
                  saved={savedPostIds.has(post.id)}
                  onToggleLike={onToggleLike}
                  onToggleSave={onToggleSave}
                  onOpenPost={onOpenPost}
                  onInspectAuthor={onInspectAuthor}
                  onAddComment={onAddComment}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
