import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Heart, Bookmark, Link2, ExternalLink, AtSign, Clapperboard } from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { SolarisArtwork } from '../ui/SolarisArtwork';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import type { FeedPost } from '../../types';

interface ExpandedPostModalProps {
  post: FeedPost | null;
  liked: boolean;
  saved: boolean;
  onClose: () => void;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onAddComment: (postId: string, text: string) => Promise<void>;
}

export function ExpandedPostModal({
  post,
  liked,
  saved,
  onClose,
  onToggleLike,
  onToggleSave,
  onAddComment,
}: ExpandedPostModalProps) {
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!post) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [post, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!post || !commentText.trim()) return;
    setSending(true);
    try {
      await onAddComment(post.id, commentText.trim());
      setCommentText('');
    } finally {
      setSending(false);
    }
  };

  const topicLabel: string = post?.mediaMeta?.topic || '';
  const isReel = post?.category === 'reel' || post?.mediaMeta?.createType === 'reel';
  const taggedPeople: string[] = Array.isArray(post?.mediaMeta?.taggedPeople)
    ? post!.mediaMeta.taggedPeople.slice(0, 10)
    : [];
  const rawLink: string = post?.mediaMeta?.attachedLink || post?.mediaMeta?.liveUrl || '';
  const attachedLink = rawLink
    ? /^https?:\/\//i.test(rawLink)
      ? rawLink
      : `https://${rawLink}`
    : '';

  return (
    <AnimatePresence>
      {post && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#080910]/85 backdrop-blur-sm"
          />

          {/* Expanded Morphing Card (Bottom sheet on mobile, centered modal on desktop) */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="expanded-post-heading"
            layoutId={`post-card-${post.id}`}
            transition={SPRINGS.modal}
            className="ts-surface-elevated relative z-10 max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-7"
            style={{ overscrollBehavior: 'contain' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <StudentAvatar presetOrUrl={post.authorAvatar} name={post.authorName} size="md" online />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-base font-bold text-white">{post.authorName}</span>
                    {isReel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#743BFF]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#27D9D0]">
                        <Clapperboard className="h-3 w-3" />
                        Reel
                      </span>
                    )}
                    {topicLabel && (
                      <span className="rounded-full border border-[#743BFF]/40 bg-[#743BFF]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#27D9D0]">
                        {topicLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#A5A9BC]">
                    {post.authorHandle} · {post.authorSchool}
                  </div>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close expanded post"
                onClick={onClose}
                className="rounded-xl border border-white/12 bg-[#080910]/80 p-2 text-[#A5A9BC] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h1 id="expanded-post-heading" className="mt-4 font-heading text-xl font-bold text-white sm:text-2xl">
              {post.title || topicLabel || `${post.authorName}'s ${isReel ? 'Reel' : 'Post'}`}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#D4D7E5] sm:text-base">{post.content}</p>

            {post.mediaType === 'landscape_illustration' && (
              <div className="mt-4">
                <SolarisArtwork />
              </div>
            )}

            {post.mediaMeta?.videoUrl && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
                <video
                  src={post.mediaMeta.videoUrl}
                  controls
                  playsInline
                  className="max-h-96 w-full object-contain"
                />
              </div>
            )}

            {!post.mediaMeta?.videoUrl && post.mediaMeta?.imageUrl && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <img
                  src={assetUrl(post.mediaMeta.imageUrl)}
                  alt={post.title || post.authorName}
                  className="max-h-96 w-full object-cover"
                />
              </div>
            )}

            {/* Tagged People */}
            {taggedPeople.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A5A9BC]">
                  <AtSign className="h-3.5 w-3.5 text-[#27D9D0]" />
                  Tagged:
                </span>
                {taggedPeople.map((handle) => (
                  <span
                    key={handle}
                    className="rounded-full border border-[#258BFF]/35 bg-[#258BFF]/15 px-2.5 py-0.5 text-xs font-semibold text-[#27D9D0]"
                  >
                    {handle}
                  </span>
                ))}
              </div>
            )}

            {/* Attached Link */}
            {attachedLink && (
              <div className="mt-3">
                <a
                  href={attachedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#258BFF]/40 bg-[#111426] px-3.5 py-2 text-xs font-semibold text-[#27D9D0] hover:border-[#27D9D0] hover:text-white"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-[#258BFF]" />
                  <span className="truncate">{attachedLink}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-1.5">
              {post.skillTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-lg border border-[#743BFF]/30 bg-[#743BFF]/12 px-2.5 py-1 text-xs font-medium text-[#27D9D0]"
                >
                  #{tag.replace(/^#/, '')}
                </span>
              ))}
            </div>

            {/* Quick reactions */}
            <div className="mt-5 flex items-center gap-3 border-y border-white/10 py-3">
              <button
                type="button"
                onClick={() => onToggleLike(post.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  liked ? 'bg-[#743BFF] text-white' : 'bg-white/6 text-[#A5A9BC] hover:text-white'
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-white' : ''}`} />
                <span>{post.likesCount} Likes</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleSave(post.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  saved ? 'bg-[#27D9D0]/20 text-[#27D9D0]' : 'bg-white/6 text-[#A5A9BC] hover:text-white'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${saved ? 'fill-[#27D9D0]' : ''}`} />
                <span>{saved ? 'Bookmarked' : 'Bookmark'}</span>
              </button>
            </div>

            {/* Peer Comments */}
            <div className="mt-4 space-y-3">
              <h2 className="font-heading text-sm font-semibold text-white">
                Peer Discussion ({post.comments.length})
              </h2>

              {post.comments.length === 0 ? (
                <p className="rounded-2xl border border-white/8 bg-[#080910]/60 p-3.5 text-xs text-[#A5A9BC]">
                  No comments yet—start the feedback loop!
                </p>
              ) : (
                <div className="space-y-2.5">
                  {post.comments.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-[#080910]/65 p-3"
                    >
                      <StudentAvatar presetOrUrl={c.avatar} name={c.author} size="xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{c.author}</span>
                          <span className="text-[10px] text-[#A5A9BC]">{c.time}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#A5A9BC]">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share constructive feedback or ask a question…"
                  className="flex-1 rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/50 focus:border-[#743BFF] sm:text-xs"
                />
                <button
                  type="submit"
                  disabled={sending || !commentText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#743BFF] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Reply</span>
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
