import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  Calendar,
  Globe2,
  Award,
  Bookmark,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { OPPORTUNITIES } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { OpportunityItem, UserAccount } from '../../types';

interface OpportunitiesViewProps {
  user: UserAccount;
  appliedIds: Set<string>;
  savedOppIds: Set<string>;
  onToggleApply: (oppId: string) => void;
  onToggleSaveOpp: (oppId: string) => void;
}

const FILTERS = ['All', 'Hackathon', 'Internship', 'Competition', 'Workshop', 'Student Bounty'] as const;

export function OpportunitiesView({
  user,
  appliedIds,
  savedOppIds,
  onToggleApply,
  onToggleSaveOpp,
}: OpportunitiesViewProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [selectedOpp, setSelectedOpp] = useState<OpportunityItem | null>(null);
  const [pitchNote, setPitchNote] = useState('');

  const items = OPPORTUNITIES.filter((o) => (filter === 'All' ? true : o.type === filter));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="ts-surface-elevated rounded-3xl p-5 sm:p-6">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
          <Briefcase className="h-4 w-4" />
          <span>Opportunities & Verified Student Bounties</span>
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
          Hackathons, Internships, Competitions & Grants
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-[#A5A9BC] sm:text-sm">
          Every listing is vetted for high-school and teen builders—apply in one click using your TeenStack portfolio.
        </p>

        <div className="ts-snap-scroller mt-4 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`relative shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold ${
                  active ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="opp-filter-pill"
                    transition={SPRINGS.pill}
                    className="absolute inset-0 -z-10 rounded-2xl border border-[#743BFF]/50 bg-[#743BFF]/25"
                  />
                )}
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Opportunity Grid */}
      <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((opp) => {
          const isApplied = appliedIds.has(opp.id);
          const isSaved = savedOppIds.has(opp.id);
          return (
            <motion.article
              layout
              key={opp.id}
              layoutId={`opp-card-${opp.id}`}
              transition={SPRINGS.morph}
              className="ts-surface flex flex-col justify-between rounded-3xl p-5 hover:border-[#258BFF]/45"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border border-[#258BFF]/35 bg-[#258BFF]/15 px-3 py-1 text-[11px] font-semibold text-[#258BFF]">
                    {opp.type}
                  </span>
                  <span className="text-xs font-medium text-[#27D9D0]">{opp.ageRange}</span>
                </div>

                <h2 className="mt-3 font-heading text-lg font-bold text-white">{opp.title}</h2>
                <p className="text-xs font-medium text-[#A5A9BC]">{opp.organization}</p>
                <p className="mt-2.5 text-xs leading-relaxed text-[#A5A9BC] sm:text-sm">
                  {opp.description}
                </p>

                <div className="mt-3.5 flex flex-wrap gap-3 text-xs text-white/90">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#743BFF]" />
                    {opp.deadline}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Globe2 className="h-3.5 w-3.5 text-[#258BFF]" />
                    {opp.Mode}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#27D9D0]">
                    <Award className="h-3.5 w-3.5" />
                    {opp.reward}
                  </span>
                </div>

                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {opp.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg border border-white/8 bg-[#080910]/70 px-2.5 py-1 text-[11px] text-[#A5A9BC]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/8 pt-3.5">
                <button
                  type="button"
                  onClick={() => onToggleSaveOpp(opp.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    isSaved
                      ? 'border-[#27D9D0]/40 bg-[#27D9D0]/15 text-[#27D9D0]'
                      : 'border-white/10 text-[#A5A9BC] hover:text-white'
                  }`}
                >
                  <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-[#27D9D0]' : ''}`} />
                  <span>{isSaved ? 'Saved' : 'Save'}</span>
                </button>

                {isApplied ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#27D9D0]/40 bg-[#27D9D0]/15 px-4 py-2 text-xs font-semibold text-[#27D9D0]">
                    <CheckCircle2 className="h-4 w-4" />
                    Registered
                  </span>
                ) : (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedOpp(opp)}
                    className="rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_-6px_rgba(116,59,255,0.7)]"
                  >
                    Quick Apply →
                  </motion.button>
                )}
              </div>
            </motion.article>
          );
        })}
      </motion.div>

      {/* Morphing Application Modal Expanding Directly from the Card */}
      <AnimatePresence>
        {selectedOpp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOpp(null)}
              className="absolute inset-0 bg-[#080910]/80 backdrop-blur-md"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="opp-apply-heading"
              layoutId={`opp-card-${selectedOpp.id}`}
              transition={SPRINGS.modal}
              className="ts-surface-elevated relative z-10 w-full max-w-lg rounded-3xl p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-[#27D9D0]">{selectedOpp.type} Fast-Apply</span>
                  <h2 id="opp-apply-heading" className="mt-1 font-heading text-xl font-bold text-white">
                    {selectedOpp.title}
                  </h2>
                  <p className="text-xs text-[#A5A9BC]">{selectedOpp.organization}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setSelectedOpp(null)}
                  className="rounded-xl border border-white/10 p-2 text-[#A5A9BC] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-[#080910]/75 p-3.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5 text-[#743BFF]" />
                  <span>Attached TeenStack Student ID</span>
                </div>
                <p className="mt-1 text-[#A5A9BC]">
                  {user.fullName} (@{user.username}) · {user.profile.skills.slice(0, 4).join(', ')}
                </p>
              </div>

              <div className="mt-4">
                <label htmlFor="pitch-note" className="mb-1.5 block text-xs font-medium text-white">
                  Short Builder Note (Optional)
                </label>
                <textarea
                  id="pitch-note"
                  rows={3}
                  value={pitchNote}
                  onChange={(e) => setPitchNote(e.target.value)}
                  placeholder="Share a project you've shipped or why you're excited to join…"
                  className="w-full rounded-xl border border-white/14 bg-[#080910] p-3 text-xs text-white"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOpp(null)}
                  className="rounded-xl border border-white/12 px-4 py-2 text-xs text-[#A5A9BC] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleApply(selectedOpp.id);
                    setPitchNote('');
                    setSelectedOpp(null);
                  }}
                  className="rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-2 text-xs font-semibold text-white"
                >
                  Submit Student Application
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
