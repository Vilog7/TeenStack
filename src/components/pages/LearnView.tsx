import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  Clock,
  CheckCircle2,
  PlayCircle,
  Sparkles,
  Award,
} from 'lucide-react';
import { COURSES } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { CourseItem, UserAccount } from '../../types';

interface LearnViewProps {
  user: UserAccount;
  completedModuleKeys: Set<string>;
  onToggleModule: (moduleKey: string) => void;
  onShareCourseCertificate: (course: CourseItem) => Promise<void>;
}

const LEVELS = ['All', 'Beginner', 'Intermediate', 'Advanced'] as const;

export function LearnView({
  user,
  completedModuleKeys,
  onToggleModule,
  onShareCourseCertificate,
}: LearnViewProps) {
  const [levelFilter, setLevelFilter] = useState<(typeof LEVELS)[number]>('All');
  const [expandedCourseId, setExpandedCourseId] = useState<string>(COURSES[0].id);
  const [certSharedId, setCertSharedId] = useState<string>('');

  const filtered = COURSES.filter((c) => (levelFilter === 'All' ? true : c.level === levelFilter));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="ts-surface-elevated rounded-3xl p-5 sm:p-6">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
          <GraduationCap className="h-4 w-4" />
          <span>TeenStack Learning Ecosystem</span>
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
          Structured Student Tracks & Peer Labs
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-[#A5A9BC] sm:text-sm">
          Matched to your goals ({user.profile.skillsToLearn.join(', ') || 'Full-Stack & Creative Tech'}). Complete interactive modules to unlock verified profile badges.
        </p>

        <div className="ts-snap-scroller mt-4 pb-1">
          {LEVELS.map((lvl) => {
            const active = levelFilter === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`relative shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold ${
                  active ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="learn-level-pill"
                    transition={SPRINGS.pill}
                    className="absolute inset-0 -z-10 rounded-2xl border border-[#258BFF]/50 bg-[#258BFF]/20"
                  />
                )}
                {lvl === 'All' ? 'All Skill Levels' : lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Courses List with Morphing Curriculum Drawer */}
      <motion.div layout className="space-y-4">
        {filtered.map((course) => {
          const isOpen = expandedCourseId === course.id;
          const doneInThisCourse = course.modules.filter((m) =>
            completedModuleKeys.has(`${course.id}:${m.id}`)
          ).length;
          const pct = Math.round((doneInThisCourse / course.modules.length) * 100);

          return (
            <motion.article
              layout
              key={course.id}
              transition={SPRINGS.morph}
              className={` rounded-3xl p-5 transition-colors ${
                isOpen ? 'ts-surface-elevated' : 'ts-surface hover:border-white/20'
              }`}
            >
              <div
                onClick={() => setExpandedCourseId(isOpen ? '' : course.id)}
                className="flex cursor-pointer flex-wrap items-start justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#743BFF]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#27D9D0]">
                      {course.level}
                    </span>
                    <span className="text-xs text-[#A5A9BC]">{course.track}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-[#A5A9BC]">
                      <Clock className="h-3.5 w-3.5 text-[#258BFF]" />
                      {course.duration}
                    </span>
                  </div>

                  <h2 className="font-heading text-lg font-bold text-white sm:text-xl">
                    {course.title}
                  </h2>
                  <p className="max-w-2xl text-xs text-[#A5A9BC] sm:text-sm">{course.summary}</p>
                  <div className="text-xs text-[#A5A9BC]">
                    Mentor: <span className="font-medium text-white">{course.mentor}</span>
                  </div>
                </div>

                {/* Progress Badge */}
                <div className="min-w-[130px] rounded-2xl border border-white/10 bg-[#080910]/70 p-3 text-right">
                  <div className="font-heading text-lg font-bold text-[#27D9D0]">{pct}%</div>
                  <div className="text-[11px] text-[#A5A9BC]">
                    {doneInThisCourse}/{course.modules.length} Lab Modules
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#111426]">
                    <motion.div
                      animate={{ width: `${pct}%` }}
                      transition={SPRINGS.morph}
                      className="h-full rounded-full bg-gradient-to-r from-[#743BFF] to-[#27D9D0]"
                    />
                  </div>
                </div>
              </div>

              {/* Expanded Interactive Modules */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={SPRINGS.morph}
                    className="mt-5 space-y-3 border-t border-white/10 pt-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Sparkles className="h-3.5 w-3.5 text-[#743BFF]" />
                        <span>Interactive Modules — Click to mark completed</span>
                      </span>

                      <button
                        type="button"
                        onClick={async () => {
                          await onShareCourseCertificate(course);
                          setCertSharedId(course.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#27D9D0]/40 bg-[#27D9D0]/12 px-3 py-1.5 text-xs font-semibold text-[#27D9D0] hover:bg-[#27D9D0]/20"
                      >
                        <Award className="h-3.5 w-3.5" />
                        <span>
                          {certSharedId === course.id
                            ? 'Certificate Posted to Feed!'
                            : 'Share Milestone Certificate'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {course.modules.map((mod, idx) => {
                        const key = `${course.id}:${mod.id}`;
                        const done = completedModuleKeys.has(key);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            aria-pressed={done}
                            onClick={() => onToggleModule(key)}
                            className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                              done
                                ? 'border-[#27D9D0]/45 bg-[#27D9D0]/10 text-white'
                                : 'border-white/8 bg-[#080910]/70 text-[#A5A9BC] hover:border-white/20 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {done ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#27D9D0]" />
                              ) : (
                                <PlayCircle className="h-5 w-5 shrink-0 text-[#743BFF]" />
                              )}
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-[#A5A9BC]">
                                  Module {idx + 1}
                                </div>
                                <div className="text-xs font-semibold text-white">{mod.title}</div>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] text-[#A5A9BC]">{mod.duration}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          );
        })}
      </motion.div>
    </div>
  );
}
