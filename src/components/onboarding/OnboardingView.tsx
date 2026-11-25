import { useState, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Sparkles,
  Award,
  Compass,
  UserCheck,
  Plus,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  Save,
  Upload,
  Shield,
  Loader2,
} from 'lucide-react';
import { BrandLogo } from '../ui/BrandLogo';
import { StudentAvatar } from '../ui/StudentAvatar';
import { AVATAR_PRESETS, SPRINGS } from '../../lib/tokens';
import { SUGGESTED_SUBJECTS, SUGGESTED_SKILLS } from '../../data/catalog';
import { api } from '../../lib/api';
import type { UserAccount, PortfolioProject } from '../../types';

interface OnboardingViewProps {
  user: UserAccount;
  onUpdateUser: (updated: UserAccount) => void;
  onFinishToProfile: (updated: UserAccount) => void;
  onSaveAndExitToHome: (updated: UserAccount) => void;
}

const STEPS = [
  { id: 1, title: 'Student Info', short: 'Info', icon: BookOpen },
  { id: 2, title: 'Skills & Tags', short: 'Skills', icon: Sparkles },
  { id: 3, title: 'Experience', short: 'Exp', icon: Award },
  { id: 4, title: 'Career Goals', short: 'Goals', icon: Compass },
  { id: 5, title: 'Profile Setup', short: 'Profile', icon: UserCheck },
];

function computeSkillTags(skills: string[], subjects: string[], desiredField: string): string[] {
  const tags = new Set<string>();
  const joined = [...skills, ...subjects, desiredField].join(' ').toLowerCase();
  if (joined.includes('react') || joined.includes('typescript')) tags.add('#FullStackTeen');
  if (joined.includes('ui') || joined.includes('figma') || joined.includes('design')) tags.add('#DesignEngineer');
  if (joined.includes('python') || joined.includes('ai') || joined.includes('pytorch')) tags.add('#AISystems');
  if (joined.includes('robot') || joined.includes('embedded')) tags.add('#HardwareMaker');
  if (joined.includes('webgl') || joined.includes('shader') || joined.includes('3d')) tags.add('#CreativeCoder');
  if (joined.includes('bio') || joined.includes('chem') || joined.includes('physics')) tags.add('#STEMResearcher');
  for (const s of skills.slice(0, 3)) {
    tags.add(`#${s.replace(/[^a-zA-Z0-9]/g, '')}`);
  }
  if (tags.size === 0) tags.add('#TeenStackBuilder');
  return Array.from(tags).slice(0, 6);
}

export function OnboardingView({
  user,
  onUpdateUser,
  onFinishToProfile,
  onSaveAndExitToHome,
}: OnboardingViewProps) {
  const p = user.profile;
  const [step, setStep] = useState<number>(Math.max(1, Math.min(5, user.onboardingStep || 1)));
  const [direction, setDirection] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState('');

  // Step 1 — Student Information
  const [subjects, setSubjects] = useState<string[]>(
    p.subjects.length ? p.subjects : ['Computer Science', 'Mathematics']
  );
  const [customSubject, setCustomSubject] = useState('');
  const [educationLevel, setEducationLevel] = useState(p.educationLevel || 'High School (Grade 11)');
  const [school, setSchool] = useState(p.school || '');
  const [careerInterestsInput, setCareerInterestsInput] = useState(
    p.careerInterests.join(', ') || 'Software Engineering, Creative Design'
  );

  // Step 2 — Skills
  const [skills, setSkills] = useState<string[]>(
    p.skills.length ? p.skills : ['TypeScript', 'React', 'UI/UX Design']
  );
  const [customSkill, setCustomSkill] = useState('');

  // Step 3 — Experience + Sketch 1 Setup fields (Rate per project, Aim for no. of clients)
  const [experienceYears, setExperienceYears] = useState<number>(p.experienceYears ?? 1);
  const [projectsCompleted, setProjectsCompleted] = useState<number>(p.projectsCompleted ?? 3);
  const [ratePerProject, setRatePerProject] = useState(p.ratePerProject || '$100 / student milestone');
  const [targetClients, setTargetClients] = useState(p.targetClients || '2–3 clubs or indie teams');
  const [achievementsText, setAchievementsText] = useState(
    p.achievements.join('\n') || 'Built school club portal\nHonor Roll in STEM'
  );
  const [competitionsText, setCompetitionsText] = useState(
    p.competitions.join('\n') || 'Regional Coding Hackathon'
  );

  // Step 4 — Career Goals
  const [careerAim, setCareerAim] = useState(
    p.careerAim || 'Launch impactful student software and collaborate with ambitious peers.'
  );
  const [desiredField, setDesiredField] = useState(p.desiredField || 'AI & Product Engineering');
  const [skillsToLearn, setSkillsToLearn] = useState<string[]>(
    p.skillsToLearn.length ? p.skillsToLearn : ['WebGL / Shaders', 'Rust']
  );
  const [learnInput, setLearnInput] = useState('');

  // Step 5 — Profile Setup
  const [avatarPreset, setAvatarPreset] = useState(p.avatarPreset || 'violet-coder');
  const [avatarUrl, setAvatarUrl] = useState(p.avatarUrl || '');
  const [bio, setBio] = useState(
    p.bio || 'Student builder passionate about turning rough ideas into interactive tools.'
  );
  const [portfolioUrl, setPortfolioUrl] = useState(p.portfolioUrl || '');
  const [projectTitle, setProjectTitle] = useState(p.portfolioProjects[0]?.title || 'StudyPulse Web App');
  const [projectSummary, setProjectSummary] = useState(
    p.portfolioProjects[0]?.summary || 'Collaborative flashcard & Pomodoro timer built for high school finals.'
  );
  const [projectTag, setProjectTag] = useState(p.portfolioProjects[0]?.tag || 'React · TypeScript');
  const [hideContactInfo, setHideContactInfo] = useState(p.privacy?.hideContactInfo ?? true);

  const generatedTags = computeSkillTags(skills, subjects, desiredField);

  const buildProfilePayload = () => {
    const projects: PortfolioProject[] = projectTitle.trim()
      ? [
          {
            id: p.portfolioProjects[0]?.id || 'proj-onboard-1',
            title: projectTitle.trim(),
            summary: projectSummary.trim(),
            link: portfolioUrl.trim() || 'https://teenstack.dev',
            tag: projectTag.trim() || 'Student Build',
          },
          ...p.portfolioProjects.slice(1),
        ]
      : p.portfolioProjects;

    return {
      subjects,
      educationLevel,
      school,
      careerInterests: careerInterestsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      skills,
      generatedTags,
      experienceYears,
      projectsCompleted,
      ratePerProject,
      targetClients,
      achievements: achievementsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      competitions: competitionsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      careerAim,
      desiredField,
      skillsToLearn,
      avatarPreset,
      avatarUrl,
      bio,
      portfolioUrl,
      portfolioProjects: projects,
      privacy: {
        ...p.privacy,
        hideContactInfo,
      },
    };
  };

  const persistProgress = async (nextStep: number, markCompleted = false) => {
    setSaving(true);
    try {
      const res = await api.saveOnboarding({
        step: nextStep,
        completed: markCompleted,
        profilePatch: buildProfilePayload(),
      });
      onUpdateUser(res.user);
      setSavedToast('Progress synced to database');
      setTimeout(() => setSavedToast(''), 2400);
      return res.user;
    } finally {
      setSaving(false);
    }
  };

  const goToStep = async (targetStep: number) => {
    setDirection(targetStep > step ? 1 : -1);
    setStep(targetStep);
    await persistProgress(targetStep, false);
  };

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteOnboarding = async () => {
    const updated = await persistProgress(5, true);
    onFinishToProfile(updated);
  };

  const handleSaveAndResumeLater = async () => {
    const updated = await persistProgress(step, false);
    onSaveAndExitToHome(updated);
  };

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-between px-4 py-6 sm:px-8">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <BrandLogo />

        <div className="flex items-center gap-2.5">
          {savedToast && (
            <motion.span
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-1 rounded-full border border-[#27D9D0]/35 bg-[#27D9D0]/10 px-3 py-1 text-xs font-medium text-[#27D9D0]"
            >
              <Check className="h-3.5 w-3.5" />
              {savedToast}
            </motion.span>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndResumeLater}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/14 bg-[#111426]/90 px-3.5 py-2 text-xs font-semibold text-[#A5A9BC] hover:border-white/25 hover:text-white"
          >
            <Save className="h-3.5 w-3.5 text-[#258BFF]" />
            <span>Save & Resume Later</span>
          </button>
        </div>
      </header>

      {/* Progress Stepper: Horizontal on Desktop, Compact Pill Bar on Mobile */}
      <div className="my-5">
        {/* Desktop Stepper */}
        <nav aria-label="Onboarding steps" className="hidden md:block">
          <ol className="grid grid-cols-5 gap-3">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const isCurrent = step === s.id;
              const isDone = step > s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goToStep(s.id)}
                    className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-colors ${
                      isCurrent
                        ? 'border-[#743BFF] bg-[#161A36] text-white'
                        : isDone
                        ? 'border-[#27D9D0]/35 bg-[#111426]/85 text-white'
                        : 'border-white/10 bg-[#111426]/55 text-[#A5A9BC] hover:text-white'
                    }`}
                  >
                    {isCurrent && (
                      <motion.div
                        layoutId="onboarding-step-highlight"
                        transition={SPRINGS.pill}
                        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#743BFF]/25 to-[#258BFF]/15"
                      />
                    )}
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        isCurrent
                          ? 'bg-[#743BFF] text-white'
                          : isDone
                          ? 'bg-[#27D9D0]/20 text-[#27D9D0]'
                          : 'bg-white/6 text-[#A5A9BC]'
                      }`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#A5A9BC]">
                        Step {s.id}/5
                      </div>
                      <div className="truncate font-heading text-xs font-semibold sm:text-sm">
                        {s.title}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Mobile Compact Progress Indicator */}
        <div className="rounded-2xl border border-white/10 bg-[#111426]/90 p-3.5 md:hidden">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-heading font-semibold text-white">
              Step {step} of 5 — {STEPS[step - 1].title}
            </span>
            <span className="font-medium text-[#27D9D0]">{step * 20}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#080910]">
            <motion.div
              animate={{ width: `${step * 20}%` }}
              transition={SPRINGS.morph}
              className="h-full rounded-full bg-gradient-to-r from-[#743BFF] via-[#258BFF] to-[#27D9D0]"
            />
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Morphing Step Form + Live Student Identity Preview */}
      <main className="my-auto grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Morphing Step Card */}
        <motion.div
          layout
          layoutId="primary-auth-card"
          transition={SPRINGS.morph}
          className="ts-surface-elevated overflow-hidden rounded-3xl p-5 sm:p-8 lg:col-span-8"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={`onboard-step-${step}`}
              initial={{ opacity: 0, x: direction * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -32 }}
              transition={SPRINGS.morph}
              className="space-y-5"
            >
              {step === 1 && (
                <>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#27D9D0]">
                      Step 1 · Academic Foundation
                    </span>
                    <h1 className="mt-1 font-heading text-2xl font-bold text-white">
                      Tell us about your student journey
                    </h1>
                    <p className="mt-1 text-sm text-[#A5A9BC]">
                      We tailor study communities, peer mentors, and competitions to your subjects.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="edu-level" className="mb-1.5 block text-xs font-medium text-white">
                        Educational Level
                      </label>
                      <select
                        id="edu-level"
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2.5 text-sm text-white"
                      >
                        <option>Middle School (Grade 8)</option>
                        <option>High School Freshman (Grade 9)</option>
                        <option>High School Sophomore (Grade 10)</option>
                        <option>High School (Grade 11)</option>
                        <option>High School Senior (Grade 12)</option>
                        <option>Gap Year / Freshman Undergrad</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="school-name" className="mb-1.5 block text-xs font-medium text-white">
                        School / Institution
                      </label>
                      <input
                        id="school-name"
                        type="text"
                        value={school}
                        onChange={(e) => setSchool(e.target.value)}
                        placeholder="e.g. Westlake STEM High"
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2.5 text-sm text-white placeholder:text-[#A5A9BC]/45"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="mb-2 block text-xs font-medium text-white">
                      Academic Subjects (Select or add custom)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_SUBJECTS.map((subj) => {
                        const active = subjects.includes(subj);
                        return (
                          <motion.button
                            layout
                            key={subj}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleItem(subjects, setSubjects, subj)}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? 'border-[#743BFF] bg-[#743BFF]/25 text-white'
                                : 'border-white/12 bg-[#0B0E1D] text-[#A5A9BC] hover:text-white'
                            }`}
                          >
                            {subj}
                          </motion.button>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 flex gap-2">
                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customSubject.trim()) {
                            e.preventDefault();
                            if (!subjects.includes(customSubject.trim())) {
                              setSubjects([...subjects, customSubject.trim()]);
                            }
                            setCustomSubject('');
                          }
                        }}
                        placeholder="Add another subject (e.g. Astrophysics)"
                        className="flex-1 rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customSubject.trim() && !subjects.includes(customSubject.trim())) {
                            setSubjects([...subjects, customSubject.trim()]);
                            setCustomSubject('');
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#258BFF]/40 bg-[#258BFF]/15 px-3.5 py-2 text-xs font-semibold text-white"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="career-interests" className="mb-1.5 block text-xs font-medium text-white">
                      Career Interests
                    </label>
                    <input
                      id="career-interests"
                      type="text"
                      value={careerInterestsInput}
                      onChange={(e) => setCareerInterestsInput(e.target.value)}
                      placeholder="AI Research, Product Design, Robotics, Indie Startups"
                      className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#27D9D0]">
                      Step 2 · Student Toolkit
                    </span>
                    <h1 className="mt-1 font-heading text-2xl font-bold text-white">
                      Add your skills & generate tags
                    </h1>
                    <p className="mt-1 text-sm text-[#A5A9BC]">
                      Select from suggested skills or add custom ones—TeenStack generates smart identity tags automatically.
                    </p>
                  </div>

                  <div>
                    <span className="mb-2 block text-xs font-medium text-white">Suggested Skills</span>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_SKILLS.map((sk) => {
                        const active = skills.includes(sk);
                        return (
                          <motion.button
                            layout
                            key={sk}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleItem(skills, setSkills, sk)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                              active
                                ? 'border-[#258BFF] bg-[#258BFF]/20 text-white'
                                : 'border-white/12 bg-[#0B0E1D] text-[#A5A9BC] hover:text-white'
                            }`}
                          >
                            {active && <Check className="h-3 w-3 text-[#27D9D0]" />}
                            {sk}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSkill}
                      onChange={(e) => setCustomSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customSkill.trim()) {
                          e.preventDefault();
                          if (!skills.includes(customSkill.trim())) {
                            setSkills([...skills, customSkill.trim()]);
                          }
                          setCustomSkill('');
                        }
                      }}
                      placeholder="Add custom skill (e.g. Blender, Swift, Debate)…"
                      className="flex-1 rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2.5 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customSkill.trim() && !skills.includes(customSkill.trim())) {
                          setSkills([...skills, customSkill.trim()]);
                          setCustomSkill('');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#743BFF] px-4 py-2.5 text-xs font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" /> Add Skill
                    </button>
                  </div>

                  {/* Selected Custom/Active Skills */}
                  <div className="rounded-2xl border border-white/10 bg-[#0B0E1D] p-4">
                    <div className="mb-2 text-xs font-semibold text-white">
                      Auto-Generated TeenStack Skill Tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {generatedTags.map((tag) => (
                        <motion.span
                          layout
                          key={tag}
                          className="rounded-full border border-[#27D9D0]/35 bg-[#27D9D0]/12 px-3 py-1 text-xs font-semibold text-[#27D9D0]"
                        >
                          {tag}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#27D9D0]">
                      Step 3 · Proof of Work & Setup
                    </span>
                    <h1 className="mt-1 font-heading text-2xl font-bold text-white">
                      Experience, projects & collaboration goals
                    </h1>
                    <p className="mt-1 text-sm text-[#A5A9BC]">
                      Every club project, competition, or freelance milestone counts—even if you are just starting out.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label htmlFor="exp-years" className="mb-1 block text-xs font-medium text-white">
                        Experience (Years)
                      </label>
                      <input
                        id="exp-years"
                        type="number"
                        min={0}
                        max={12}
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2.5 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="proj-count" className="mb-1 block text-xs font-medium text-white">
                        Projects Done
                      </label>
                      <input
                        id="proj-count"
                        type="number"
                        min={0}
                        max={99}
                        value={projectsCompleted}
                        onChange={(e) => setProjectsCompleted(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2.5 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="rate-proj" className="mb-1 block text-xs font-medium text-white">
                        Rate / Bounty Goal
                      </label>
                      <input
                        id="rate-proj"
                        type="text"
                        value={ratePerProject}
                        onChange={(e) => setRatePerProject(e.target.value)}
                        placeholder="$120 / project"
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2.5 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="target-clients" className="mb-1 block text-xs font-medium text-white">
                        Collab / Client Aim
                      </label>
                      <input
                        id="target-clients"
                        type="text"
                        value={targetClients}
                        onChange={(e) => setTargetClients(e.target.value)}
                        placeholder="3 student teams"
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2.5 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="achievements-area" className="mb-1.5 block text-xs font-medium text-white">
                        Achievements (one per line)
                      </label>
                      <textarea
                        id="achievements-area"
                        rows={3}
                        value={achievementsText}
                        onChange={(e) => setAchievementsText(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] p-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="competitions-area" className="mb-1.5 block text-xs font-medium text-white">
                        Competitions & Hackathons
                      </label>
                      <textarea
                        id="competitions-area"
                        rows={3}
                        value={competitionsText}
                        onChange={(e) => setCompetitionsText(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] p-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#27D9D0]">
                      Step 4 · North Star
                    </span>
                    <h1 className="mt-1 font-heading text-2xl font-bold text-white">
                      Where do you want to grow next?
                    </h1>
                    <p className="mt-1 text-sm text-[#A5A9BC]">
                      TeenStack matches your learning recommendations and hackathon invites to your future goals.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="desired-field" className="mb-1.5 block text-xs font-medium text-white">
                      Desired Field / Specialty
                    </label>
                    <input
                      id="desired-field"
                      type="text"
                      value={desiredField}
                      onChange={(e) => setDesiredField(e.target.value)}
                      placeholder="e.g. Human-Centered AI, Robotics, Interactive Graphics"
                      className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="career-aim" className="mb-1.5 block text-xs font-medium text-white">
                      Your Career / Builder Aim
                    </label>
                    <textarea
                      id="career-aim"
                      rows={2}
                      value={careerAim}
                      onChange={(e) => setCareerAim(e.target.value)}
                      className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] p-3 text-sm text-white"
                    />
                  </div>

                  <div>
                    <span className="mb-2 block text-xs font-medium text-white">
                      Skills You Want to Learn Next
                    </span>
                    <div className="mb-2.5 flex flex-wrap gap-2">
                      {skillsToLearn.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#743BFF]/40 bg-[#743BFF]/15 px-3 py-1 text-xs font-medium text-white"
                        >
                          {item}
                          <button
                            type="button"
                            aria-label={`Remove ${item}`}
                            onClick={() => setSkillsToLearn(skillsToLearn.filter((x) => x !== item))}
                            className="text-[#A5A9BC] hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={learnInput}
                        onChange={(e) => setLearnInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && learnInput.trim()) {
                            e.preventDefault();
                            if (!skillsToLearn.includes(learnInput.trim())) {
                              setSkillsToLearn([...skillsToLearn, learnInput.trim()]);
                            }
                            setLearnInput('');
                          }
                        }}
                        placeholder="Add a skill to learn (e.g. WebGPU, Quantum Computing)…"
                        className="flex-1 rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (learnInput.trim() && !skillsToLearn.includes(learnInput.trim())) {
                            setSkillsToLearn([...skillsToLearn, learnInput.trim()]);
                            setLearnInput('');
                          }
                        }}
                        className="rounded-xl border border-[#27D9D0]/40 bg-[#27D9D0]/15 px-3.5 py-2 text-xs font-semibold text-[#27D9D0]"
                      >
                        + Add Goal
                      </button>
                    </div>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#27D9D0]">
                      Step 5 · Public Student Identity
                    </span>
                    <h1 className="mt-1 font-heading text-2xl font-bold text-white">
                      Setup your profile & featured portfolio
                    </h1>
                    <p className="mt-1 text-sm text-[#A5A9BC]">
                      Choose a stylized avatar or upload your photo, craft your bio, and spotlight a project.
                    </p>
                  </div>

                  {/* Avatar Selector + Upload */}
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-[#0B0E1D] p-4">
                    <StudentAvatar
                      presetOrUrl={avatarUrl || avatarPreset}
                      name={user.fullName}
                      size="lg"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(AVATAR_PRESETS).map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setAvatarUrl('');
                              setAvatarPreset(key);
                            }}
                            className={`rounded-xl border px-2.5 py-1 text-xs font-medium ${
                              !avatarUrl && avatarPreset === key
                                ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-white'
                                : 'border-white/10 bg-[#111426] text-[#A5A9BC] hover:text-white'
                            }`}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/14 bg-[#111426] px-3 py-1.5 text-xs font-medium text-white hover:border-[#743BFF]">
                          <Upload className="h-3.5 w-3.5 text-[#743BFF]" />
                          <span>Upload Custom Picture</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="student-bio" className="mb-1 block text-xs font-medium text-white">
                      Biography
                    </label>
                    <textarea
                      id="student-bio"
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] p-3 text-sm text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="portfolio-link" className="mb-1 block text-xs font-medium text-white">
                        Portfolio / GitHub URL
                      </label>
                      <input
                        id="portfolio-link"
                        type="url"
                        value={portfolioUrl}
                        onChange={(e) => setPortfolioUrl(e.target.value)}
                        placeholder="https://yourname.teenstack.dev"
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="feat-proj-title" className="mb-1 block text-xs font-medium text-white">
                        Featured Project Title
                      </label>
                      <input
                        id="feat-proj-title"
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="feat-proj-summary" className="mb-1 block text-xs font-medium text-white">
                        Project Summary
                      </label>
                      <input
                        id="feat-proj-summary"
                        type="text"
                        value={projectSummary}
                        onChange={(e) => setProjectSummary(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="feat-proj-tag" className="mb-1 block text-xs font-medium text-white">
                        Stack Tag
                      </label>
                      <input
                        id="feat-proj-tag"
                        type="text"
                        value={projectTag}
                        onChange={(e) => setProjectTag(e.target.value)}
                        className="w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  {/* Teen Safety Default Toggle */}
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#27D9D0]/25 bg-[#27D9D0]/8 px-4 py-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Shield className="h-4 w-4 text-[#27D9D0]" />
                      <div>
                        <div className="font-semibold text-white">Teen Privacy Shield Enabled</div>
                        <div className="text-[#A5A9BC]">Keep personal phone & email masked on public student profile</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={hideContactInfo}
                      onChange={(e) => setHideContactInfo(e.target.checked)}
                      className="h-4 w-4 accent-[#27D9D0]"
                    />
                  </label>
                </>
              )}

              {/* Bottom Step Controls */}
              <div className="flex items-center justify-between border-t border-white/10 pt-5">
                <button
                  type="button"
                  disabled={step === 1 || saving}
                  onClick={() => goToStep(step - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-semibold text-[#A5A9BC] hover:text-white disabled:opacity-35"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                {step < 5 ? (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={saving}
                    onClick={() => goToStep(step + 1)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-6 py-3 text-xs font-semibold text-white shadow-[0_10px_24px_-6px_rgba(116,59,255,0.7)] sm:text-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 ts-spin" /> : null}
                    <span>Continue to {STEPS[step].title}</span>
                    <ArrowRight className="h-4 w-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={saving}
                    onClick={handleCompleteOnboarding}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#258BFF] to-[#27D9D0] px-6 py-3 text-xs font-bold text-white shadow-[0_10px_28px_-6px_rgba(39,217,208,0.55)] sm:text-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 ts-spin" /> : <Check className="h-4 w-4" />}
                    <span>Complete Setup & View Profile</span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Right: Live Morphing Student Identity Card Preview */}
        <motion.aside
          layout
          transition={SPRINGS.morph}
          className="ts-surface flex flex-col justify-between rounded-3xl p-5 sm:p-6 lg:col-span-4"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A5A9BC]">
                Live Student Card
              </span>
              <span className="rounded-full bg-[#743BFF]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#27D9D0]">
                Syncing
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              <StudentAvatar
                layoutId="current-user-avatar-hero"
                presetOrUrl={avatarUrl || avatarPreset}
                name={user.fullName}
                size="lg"
                online
              />
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-bold text-white">{user.fullName}</h2>
                <p className="truncate text-xs text-[#27D9D0]">@{user.username}</p>
                <p className="mt-0.5 truncate text-xs text-[#A5A9BC]">
                  {school || educationLevel} · {user.age} yrs
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#A5A9BC]">{bio}</p>

            {/* Dynamic Skill Tags */}
            <div className="flex flex-wrap gap-1.5">
              {generatedTags.map((tag) => (
                <motion.span
                  layout
                  key={tag}
                  className="rounded-lg border border-white/10 bg-[#080910]/80 px-2.5 py-1 text-[11px] font-medium text-[#27D9D0]"
                >
                  {tag}
                </motion.span>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-[#080910]/70 p-3 text-center">
              <div>
                <div className="font-heading text-base font-bold text-white">{skills.length}</div>
                <div className="text-[10px] text-[#A5A9BC]">Skills</div>
              </div>
              <div>
                <div className="font-heading text-base font-bold text-white">{projectsCompleted}</div>
                <div className="text-[10px] text-[#A5A9BC]">Projects</div>
              </div>
              <div>
                <div className="font-heading text-base font-bold text-white">{experienceYears}y</div>
                <div className="text-[10px] text-[#A5A9BC]">Exp</div>
              </div>
            </div>

            {projectTitle && (
              <div className="rounded-2xl border border-[#743BFF]/25 bg-[#111426] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{projectTitle}</span>
                  <span className="rounded-md bg-[#258BFF]/20 px-2 py-0.5 text-[10px] font-medium text-[#258BFF]">
                    {projectTag}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-[#A5A9BC]">{projectSummary}</p>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-white/8 pt-3 text-[11px] text-[#A5A9BC]">
            Desired Track: <span className="font-medium text-white">{desiredField}</span>
          </div>
        </motion.aside>
      </main>
    </div>
  );
}
