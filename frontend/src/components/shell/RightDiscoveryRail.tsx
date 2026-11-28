import { motion } from 'motion/react';
import {
  UserPlus,
  UserCheck,
  Flame,
  Trophy,
  GraduationCap,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { PEER_STUDENTS, OPPORTUNITIES, TRENDING_SKILLS, COURSES } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { NavSection, PeerStudent, UserAccount } from '../../types';

interface RightDiscoveryRailProps {
  user: UserAccount;
  connectedIds: Set<string>;
  onToggleConnect: (peerId: string) => void;
  onSelectPeer: (peer: PeerStudent) => void;
  onNavigate: (section: NavSection) => void;
  onFilterBySkill: (skill: string) => void;
  onResumeOnboarding: () => void;
}

export function RightDiscoveryRail({
  user,
  connectedIds,
  onToggleConnect,
  onSelectPeer,
  onNavigate,
  onFilterBySkill,
  onResumeOnboarding,
}: RightDiscoveryRailProps) {
  const upcomingOpps = OPPORTUNITIES.slice(0, 3);
  const recommendedCourse = COURSES[0];

  return (
    <aside aria-label="Student discovery and opportunities" className="space-y-5">
      {/* Resume Onboarding Prompt if incomplete */}
      {!user.onboardingCompleted && (
        <motion.div
          layout
          className="rounded-3xl border border-[#743BFF]/45 bg-gradient-to-br from-[#743BFF]/22 via-[#111426] to-[#258BFF]/15 p-4"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[#27D9D0]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Step {user.onboardingStep}/5 Saved</span>
          </div>
          <h3 className="mt-1 font-heading text-sm font-bold text-white">
            Finish your student profile setup
          </h3>
          <p className="mt-1 text-xs text-[#A5A9BC]">
            Unlock personalized hackathon matches and skill badges.
          </p>
          <button
            type="button"
            onClick={onResumeOnboarding}
            className="mt-3 w-full rounded-xl bg-[#743BFF] py-2 text-xs font-semibold text-white hover:bg-[#824FFF]"
          >
            Resume Onboarding →
          </button>
        </motion.div>
      )}

      {/* Recommended Students */}
      <div className="ts-surface rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold text-white">Recommended Students</h2>
          <span className="text-[11px] text-[#A5A9BC]">Peer Builders</span>
        </div>

        <div className="space-y-3">
          {PEER_STUDENTS.slice(0, 3).map((peer) => {
            const isConnected = connectedIds.has(peer.id);
            return (
              <motion.div
                layout
                key={peer.id}
                layoutId={`peer-card-${peer.id}`}
                transition={SPRINGS.morph}
                className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/6 bg-[#080910]/55 p-2.5 hover:border-white/15"
              >
                <button
                  type="button"
                  onClick={() => onSelectPeer(peer)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <StudentAvatar
                    presetOrUrl={peer.avatarPreset}
                    name={peer.name}
                    size="sm"
                    online={peer.online}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white hover:text-[#27D9D0]">
                      {peer.name}
                    </div>
                    <div className="truncate text-[11px] text-[#A5A9BC]">{peer.school}</div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={isConnected}
                  onClick={() => onToggleConnect(peer.id)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    isConnected
                      ? 'border border-[#27D9D0]/40 bg-[#27D9D0]/12 text-[#27D9D0]'
                      : 'bg-[#743BFF]/20 text-white hover:bg-[#743BFF]'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Connected</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Connect</span>
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Trending Skills */}
      <div className="ts-surface rounded-3xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-[#743BFF]" />
          <h2 className="font-heading text-sm font-bold text-white">Trending Skills</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TRENDING_SKILLS.map((sk) => (
            <button
              key={sk.name}
              type="button"
              onClick={() => onFilterBySkill(sk.name)}
              className="group flex items-center gap-1.5 rounded-xl border border-white/8 bg-[#080910]/65 px-2.5 py-1.5 text-left text-xs hover:border-[#258BFF]/50"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sk.accent }} />
              <span className="font-medium text-white">{sk.name}</span>
              <span className="text-[10px] text-[#A5A9BC]">{sk.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hackathons, Competitions & Internships */}
      <div className="ts-surface rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#258BFF]" />
            <h2 className="font-heading text-sm font-bold text-white">Hackathons & Internships</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('opportunities')}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#27D9D0] hover:underline"
          >
            All <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2.5">
          {upcomingOpps.map((opp) => (
            <button
              key={opp.id}
              type="button"
              onClick={() => onNavigate('opportunities')}
              className="block w-full rounded-2xl border border-white/8 bg-[#080910]/60 p-3 text-left transition-colors hover:border-[#258BFF]/45"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-[#258BFF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#258BFF]">
                  {opp.type}
                </span>
                <span className="text-[10px] text-[#A5A9BC]">{opp.deadline}</span>
              </div>
              <div className="mt-1.5 text-xs font-semibold text-white line-clamp-1">{opp.title}</div>
              <div className="mt-0.5 text-[11px] text-[#27D9D0]">{opp.reward}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Learning Recommendation */}
      <div className="ts-surface rounded-3xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-[#27D9D0]" />
          <h2 className="font-heading text-sm font-bold text-white">Learning Pick for You</h2>
        </div>
        <p className="text-xs font-semibold text-white">{recommendedCourse.title}</p>
        <p className="mt-1 text-[11px] text-[#A5A9BC]">{recommendedCourse.summary}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-[#27D9D0]">
            {recommendedCourse.completedLessons}/{recommendedCourse.lessonsCount} lessons
          </span>
          <button
            type="button"
            onClick={() => onNavigate('learn')}
            className="rounded-xl border border-[#27D9D0]/35 bg-[#27D9D0]/10 px-3 py-1.5 text-xs font-semibold text-[#27D9D0] hover:bg-[#27D9D0]/20"
          >
            Continue Track
          </button>
        </div>
      </div>
    </aside>
  );
}
