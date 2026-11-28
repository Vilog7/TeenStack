import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, ArrowUpRight, User, Trophy, GraduationCap, FileText } from 'lucide-react';
import { PEER_STUDENTS, OPPORTUNITIES, COURSES } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import { api } from '../../lib/api';
import type { CourseItem, FeedPost, NavSection, OpportunityItem, PeerStudent } from '../../types';

interface SearchModalProps {
  open: boolean;
  posts: FeedPost[];
  peers?: PeerStudent[];
  opportunities?: OpportunityItem[];
  courses?: CourseItem[];
  onClose: () => void;
  onNavigate: (section: NavSection) => void;
  onSelectPeer: (peer: PeerStudent) => void;
  onOpenPost: (post: FeedPost) => void;
}

export function SearchModal({
  open,
  posts,
  peers = PEER_STUDENTS,
  opportunities = OPPORTUNITIES,
  courses = COURSES,
  onClose,
  onNavigate,
  onSelectPeer,
  onOpenPost,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<{
    students: PeerStudent[];
    posts: FeedPost[];
    opportunities: OpportunityItem[];
    courses: CourseItem[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api
        .searchAll(query)
        .then((res) => setRemoteResults(res))
        .catch(() => setRemoteResults(null));
    }, 140);
    return () => clearTimeout(timer);
  }, [open, query]);

  const q = query.trim().toLowerCase();

  const matchedStudents = (
    remoteResults
      ? remoteResults.students
      : peers.filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.skills.some((sk) => sk.toLowerCase().includes(q)) ||
            s.school.toLowerCase().includes(q)
        )
  ).slice(0, 3);

  const matchedPosts = (
    remoteResults
      ? remoteResults.posts
      : posts.filter(
          (p) =>
            !q ||
            p.title.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q) ||
            p.skillTags.some((t) => t.toLowerCase().includes(q))
        )
  ).slice(0, 3);

  const matchedOpps = (
    remoteResults
      ? remoteResults.opportunities
      : opportunities.filter(
          (o) =>
            !q ||
            o.title.toLowerCase().includes(q) ||
            o.type.toLowerCase().includes(q) ||
            o.skills.some((sk) => sk.toLowerCase().includes(q))
        )
  ).slice(0, 2);

  const matchedCourses = (
    remoteResults
      ? remoteResults.courses
      : courses.filter(
          (c) =>
            !q || c.title.toLowerCase().includes(q) || c.skills.some((s) => s.toLowerCase().includes(q))
        )
  ).slice(0, 2);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4 sm:pt-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#080910]/80 backdrop-blur-md"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search TeenStack"
            layoutId="global-search-surface"
            transition={SPRINGS.modal}
            className="ts-surface-elevated relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl"
          >
            {/* Search Input Header */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
              <Search className="h-5 w-5 text-[#27D9D0]" />
              <input
                type="search"
                autoFocus
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search students, skills, shaders, hackathons…"
                className="flex-1 bg-transparent text-base text-white placeholder:text-[#A5A9BC]/60 focus:outline-none"
              />
              <button
                type="button"
                aria-label="Close search"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-2.5 py-1 text-xs text-[#A5A9BC] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Results */}
            <div className="max-h-[68dvh] space-y-5 overflow-y-auto p-4 sm:p-5">
              {/* Students */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A5A9BC]">
                  <User className="h-3.5 w-3.5 text-[#743BFF]" />
                  <span>Students</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {matchedStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectPeer(s);
                      }}
                      className="rounded-2xl border border-white/8 bg-[#080910]/70 p-3 text-left hover:border-[#743BFF]/50"
                    >
                      <div className="text-xs font-semibold text-white">{s.name}</div>
                      <div className="text-[11px] text-[#27D9D0]">{s.handle}</div>
                      <div className="mt-1 truncate text-[10px] text-[#A5A9BC]">{s.skills.join(' · ')}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Posts */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A5A9BC]">
                  <FileText className="h-3.5 w-3.5 text-[#258BFF]" />
                  <span>Student Showcases</span>
                </div>
                <div className="space-y-1.5">
                  {matchedPosts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenPost(p);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-[#080910]/60 px-3.5 py-2.5 text-left hover:border-[#258BFF]/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-white">
                          {p.title || p.content}
                        </div>
                        <div className="text-[11px] text-[#A5A9BC]">by {p.authorName}</div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A5A9BC]" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Opportunities & Courses */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A5A9BC]">
                    <Trophy className="h-3.5 w-3.5 text-[#27D9D0]" />
                    <span>Opportunities</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedOpps.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigate('opportunities');
                        }}
                        className="block w-full rounded-xl border border-white/8 bg-[#080910]/60 p-2.5 text-left hover:border-[#27D9D0]/40"
                      >
                        <div className="text-xs font-semibold text-white line-clamp-1">{o.title}</div>
                        <div className="text-[10px] text-[#27D9D0]">{o.reward}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A5A9BC]">
                    <GraduationCap className="h-3.5 w-3.5 text-[#743BFF]" />
                    <span>Courses</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedCourses.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigate('learn');
                        }}
                        className="block w-full rounded-xl border border-white/8 bg-[#080910]/60 p-2.5 text-left hover:border-[#743BFF]/40"
                      >
                        <div className="text-xs font-semibold text-white line-clamp-1">{c.title}</div>
                        <div className="text-[10px] text-[#A5A9BC]">
                          {c.level} · {c.duration}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
