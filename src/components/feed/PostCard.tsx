import { useState, useRef, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Award,
  Code2,
  Play,
  Pause,
  Subtitles,
  Check,
  Sparkles,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { SolarisArtwork } from '../ui/SolarisArtwork';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import type { FeedPost } from '../../types';

interface PostCardProps {
  post: FeedPost;
  liked: boolean;
  saved: boolean;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onInspectAuthor: (authorId: string, authorName: string, avatar: string) => void;
  onAddComment?: (postId: string, text: string) => Promise<void>;
}

const FALLBACK_POST_IMAGES: Record<string, string> = {
  'peer-maya': 'images/posts/shader-desk.jpg',
  'peer-rohan': 'images/posts/rover-lake.jpg',
  'peer-zara': 'images/teens/biotech-scientist.jpg',
  'peer-ananya': 'images/posts/braille-app.jpg',
  'peer-kai': 'images/teens/ai-coder.jpg',
};

function formatTimeAgo(iso: string): string {
  const diffMin = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 60) return `${diffMin}m`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function PostCard({
  post,
  liked,
  saved,
  onToggleLike,
  onToggleSave,
  onOpenPost,
  onInspectAuthor,
  onAddComment,
}: PostCardProps) {
  const [copied, setCopied] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [heartBurst, setHeartBurst] = useState(false);
  const [quickComment, setQuickComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const lastTapRef = useRef<number>(0);

  const cleanHandle = post.authorHandle.replace(/^@/, '');

  const handleDoubleTapLike = () => {
    if (!liked) onToggleLike(post.id);
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 750);
  };

  const handleTouchTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTapLike();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleShare = () => {
    setCopied(true);
    navigator.clipboard?.writeText(`https://teenstack.dev/posts/${post.id}`).catch(() => {});
    setTimeout(() => setCopied(false), 1600);
  };

  const handleQuickCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickComment.trim() || !onAddComment) return;
    setSubmittingComment(true);
    try {
      await onAddComment(post.id, quickComment.trim());
      setQuickComment('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const fallbackPhoto = assetUrl(
    FALLBACK_POST_IMAGES[post.authorId] || 'images/teens/astrophysics-maker.jpg'
  );

  return (
    <motion.article
      layoutId={`post-card-${post.id}`}
      transition={SPRINGS.morph}
      className="border-b border-white/10 bg-[#080910] pb-4 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-[#0B0E1A]"
    >
      {/* 1. INSTAGRAM HEADER: Story-Ring Avatar + Username + Time + More */}
      <div className="flex items-center justify-between px-3.5 py-3">
        <button
          type="button"
          onClick={() => onInspectAuthor(post.authorId, post.authorName, post.authorAvatar)}
          className="flex items-center gap-2.5 text-left"
        >
          <span className="rounded-full bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[2px]">
            <span className="block rounded-full bg-[#080910] p-[1.5px]">
              <StudentAvatar
                presetOrUrl={post.authorAvatar}
                name={post.authorName}
                size="sm"
                className="!h-8 !w-8 !rounded-full"
              />
            </span>
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white hover:text-[#27D9D0] sm:text-[13px]">
                {cleanHandle}
              </span>
              <span className="text-xs text-[#A5A9BC]">• {formatTimeAgo(post.createdAt)}</span>
            </div>
            <div className="text-[11px] text-[#A5A9BC]">{post.authorSchool}</div>
          </div>
        </button>

        <button
          type="button"
          aria-label="View post details"
          onClick={() => onOpenPost(post)}
          className="rounded-lg p-1.5 text-[#A5A9BC] hover:text-white"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* 2. EDGE-TO-EDGE VISUAL MEDIA FRAME (Double-click / mobile double-tap to Like!) */}
      <div
        onDoubleClick={handleDoubleTapLike}
        onTouchEnd={handleTouchTap}
        className="relative touch-manipulation overflow-hidden border-y border-white/8 bg-[#080910] select-none"
      >
        {post.mediaType === 'landscape_illustration' && (
          <div className="[&>div]:!rounded-none [&>div]:!border-0 [&>div]:!h-72 sm:[&>div]:!h-80">
            <SolarisArtwork compact={false} />
          </div>
        )}

        {post.mediaType === 'certificate_card' && (
          <div className="flex min-h-[290px] flex-col items-center justify-center bg-gradient-to-br from-[#16103A] via-[#0E1834] to-[#0B2932] p-7 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[#27D9D0]/40 bg-[#27D9D0]/15 text-[#27D9D0] shadow-[0_0_30px_rgba(39,217,208,0.28)]">
              <Award className="h-8 w-8" />
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#27D9D0]">
              <Sparkles className="h-3.5 w-3.5" />
              Verified Student Milestone
            </span>
            <h3 className="mt-2 max-w-md font-heading text-lg font-bold text-white sm:text-xl">
              {post.mediaMeta?.award || post.title}
            </h3>
            <p className="mt-1 text-xs text-[#A5A9BC]">
              {post.mediaMeta?.issuer || 'TeenStack Verified Network'}
            </p>
          </div>
        )}

        {post.mediaType === 'code_preview' && (
          <div className="flex min-h-[270px] flex-col justify-between bg-[#070912] p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs text-[#A5A9BC]">
              <span className="inline-flex items-center gap-1.5 font-mono text-white">
                <Code2 className="h-4 w-4 text-[#743BFF]" />
                {post.mediaMeta?.language || 'python'}
              </span>
              <span className="text-[11px] text-[#27D9D0]">{post.mediaMeta?.readTime || 'Study Snippet'}</span>
            </div>
            <pre className="my-auto overflow-x-auto py-4 font-mono text-xs leading-relaxed text-[#27D9D0] sm:text-[13px]">
              <code>{post.mediaMeta?.snippet}</code>
            </pre>
            {post.title && (
              <div className="border-t border-white/8 pt-2.5 font-heading text-xs font-semibold text-white/90">
                {post.title}
              </div>
            )}
          </div>
        )}

        {post.mediaType === 'video_showcase' && (
          <div className="relative h-80 w-full bg-[#080910]">
            <img
              src={fallbackPhoto}
              alt={post.title || 'Video walkthrough preview'}
              className="h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080910] via-transparent to-[#080910]/40" />
            <div className="absolute inset-x-4 bottom-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setVideoPlaying((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#743BFF] px-4 py-2 text-xs font-semibold text-white shadow-lg"
                >
                  {videoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{videoPlaying ? 'Playing Reel' : 'Play Walkthrough'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptionsOn((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md ${
                    captionsOn
                      ? 'border-[#27D9D0] bg-[#080910]/80 text-[#27D9D0]'
                      : 'border-white/20 bg-[#080910]/70 text-white'
                  }`}
                >
                  <Subtitles className="h-3.5 w-3.5" />
                  CC
                </button>
              </div>
              {captionsOn && (
                <p className="rounded-xl bg-[#080910]/85 px-3 py-1.5 text-center text-xs text-white">
                  “[CC] Keyboard-first tactile focus states with zero mouse dependency.”
                </p>
              )}
            </div>
          </div>
        )}

        {post.mediaType === 'image' && post.mediaMeta?.imageUrl && (
          <img
            src={assetUrl(post.mediaMeta.imageUrl)}
            alt={post.title || 'Student project'}
            className="max-h-[470px] w-full object-cover"
          />
        )}

        {post.mediaType === 'none' && (
          <div className="relative h-72 w-full overflow-hidden">
            <img
              src={fallbackPhoto}
              alt={post.title || post.authorName}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080910] via-[#080910]/35 to-transparent" />
            {post.title && (
              <div className="absolute inset-x-4 bottom-4">
                <span className="rounded-full bg-[#743BFF]/85 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {post.category}
                </span>
                <h3 className="mt-1.5 font-heading text-base font-bold text-white drop-shadow sm:text-lg">
                  {post.title}
                </h3>
              </div>
            )}
          </div>
        )}

        {/* Instagram Double-Tap Heart Burst Animation */}
        <AnimatePresence>
          {heartBurst && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Heart className="h-20 w-20 fill-[#743BFF] text-[#743BFF] drop-shadow-[0_0_30px_rgba(116,59,255,0.9)]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. INSTAGRAM ACTION BAR: [ Heart | Comment | Share ] ... [ Save ] */}
      <div className="px-3.5 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.button
              type="button"
              whileTap={{ scale: 0.82 }}
              aria-label={liked ? 'Unlike' : 'Like'}
              aria-pressed={liked}
              onClick={() => onToggleLike(post.id)}
              className="text-white hover:opacity-80"
            >
              <Heart
                className={`h-[23px] w-[23px] transition-colors ${
                  liked ? 'fill-[#743BFF] text-[#743BFF]' : 'text-white'
                }`}
              />
            </motion.button>

            <button
              type="button"
              aria-label="Comments"
              onClick={() => onOpenPost(post)}
              className="text-white hover:opacity-80"
            >
              <MessageCircle className="h-[23px] w-[23px]" />
            </button>

            <button
              type="button"
              aria-label="Share link"
              onClick={handleShare}
              className="inline-flex items-center gap-1 text-white hover:opacity-80"
            >
              {copied ? (
                <Check className="h-[21px] w-[21px] text-[#27D9D0]" />
              ) : (
                <Send className="h-[21px] w-[21px]" />
              )}
            </button>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            aria-label={saved ? 'Remove bookmark' : 'Save post'}
            aria-pressed={saved}
            onClick={() => onToggleSave(post.id)}
            className="text-white hover:opacity-80"
          >
            <Bookmark
              className={`h-[23px] w-[23px] ${
                saved ? 'fill-[#27D9D0] text-[#27D9D0]' : 'text-white'
              }`}
            />
          </motion.button>
        </div>

        {/* Likes Count */}
        <div className="mt-2.5 text-xs font-bold text-white sm:text-[13px]">
          {post.likesCount.toLocaleString()} likes
        </div>

        {/* Inline Username + Caption + Hashtags */}
        <div className="mt-1.5 text-xs leading-relaxed text-white/90 sm:text-[13px]">
          <button
            type="button"
            onClick={() => onInspectAuthor(post.authorId, post.authorName, post.authorAvatar)}
            className="mr-1.5 font-bold text-white hover:underline"
          >
            {cleanHandle}
          </button>
          {post.title && post.mediaType !== 'none' && (
            <span className="mr-1.5 font-semibold text-white">{post.title} —</span>
          )}
          <span className="text-[#D4D7E5]">{post.content}</span>
          {post.skillTags.length > 0 && (
            <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
              {post.skillTags.map((t) => (
                <span key={t} className="font-medium text-[#27D9D0]">
                  #{t.replace(/^#/, '')}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* View Comments Trigger */}
        {post.comments.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenPost(post)}
            className="mt-1.5 block text-xs text-[#A5A9BC] hover:text-white"
          >
            View all {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
          </button>
        )}

        {/* Latest 1 Comment Preview */}
        {post.comments.length > 0 && (
          <div className="mt-1 text-xs text-[#D4D7E5]">
            <span className="mr-1.5 font-bold text-white">
              {post.comments[post.comments.length - 1].author.toLowerCase().replace(/\s+/g, '_')}
            </span>
            <span>{post.comments[post.comments.length - 1].text}</span>
          </div>
        )}

        {/* Inline Instagram "Add a comment..." Input */}
        {onAddComment && (
          <form
            onSubmit={handleQuickCommentSubmit}
            className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/6 pt-2.5"
          >
            <input
              type="text"
              value={quickComment}
              onChange={(e) => setQuickComment(e.target.value)}
              placeholder="Add a comment…"
              className="w-full bg-transparent text-base text-white placeholder:text-[#A5A9BC]/55 focus:outline-none sm:text-xs"
            />
            {quickComment.trim() && (
              <button
                type="submit"
                disabled={submittingComment}
                className="shrink-0 text-xs font-bold text-[#258BFF] hover:text-[#27D9D0]"
              >
                Post
              </button>
            )}
          </form>
        )}
      </div>
    </motion.article>
  );
}
