import { useState, type ChangeEvent, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sliders,
  UserCheck,
  Plus,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  Upload,
  Sparkles,
  AlertCircle,
  Loader2,
  Link2,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { AVATAR_PRESETS, SPRINGS } from '../../lib/tokens';
import { SUGGESTED_SUBJECTS, SUGGESTED_SKILLS } from '../../data/catalog';
import { api } from '../../lib/api';
import type { UserAccount } from '../../types';

interface OnboardingViewProps {
  user: UserAccount;
  onUpdateUser: (updated: UserAccount) => void;
  onFinishToHome: (updated: UserAccount) => void;
}

const MAX_SKILLS = 10;

const RATE_PRESETS = ['$50 / project', '$120 / project', '$250 / project', '$500 / project'];

function generateSkillTagOptions(
  skills: string[],
  subjects: string[],
  expYears: number
): string[] {
  const joined = [...skills, ...subjects].join(' ').toLowerCase();
  const options = new Set<string>();

  const levelPrefix = expYears >= 3 ? 'Pro' : expYears >= 1 ? 'Rising' : 'Junior';

  if (joined.includes('react') || joined.includes('typescript') || joined.includes('sql')) {
    options.add('#FullStackBuilder');
    options.add(`#${levelPrefix}WebEngineer`);
  }
  if (joined.includes('ui') || joined.includes('figma') || joined.includes('design') || joined.includes('art')) {
    options.add('#CreativeUIArtist');
    options.add('#ProductDesigner');
  }
  if (joined.includes('python') || joined.includes('pytorch') || joined.includes('ai')) {
    options.add('#AIScientist');
    options.add('#MLBuilder');
  }
  if (joined.includes('robot') || joined.includes('embedded') || joined.includes('3d')) {
    options.add('#RoboticsEngineer');
    options.add('#HardwareMaker');
  }
  if (joined.includes('bio') || joined.includes('chem') || joined.includes('physics')) {
    options.add('#STEMResearcher');
  }

  for (const s of skills.slice(0, 4)) {
    const clean = s.replace(/[^a-zA-Z0-9]/g, '');
    if (clean) options.add(`#${clean}Specialist`);
  }

  if (subjects[0]) {
    const cleanSub = subjects[0].replace(/[^a-zA-Z0-9]/g, '');
    if (cleanSub) options.add(`#${cleanSub}Scholar`);
  }

  options.add('#TeenStackCreator');
  return Array.from(options).slice(0, 6);
}

/**
 * Post-Signup Two-Page Required Onboarding Flow:
 * 1. "Setup" Page:
 *    - Select interested subject(s)
 *    - Select skills (strict maximum of 10 skills)
 *    - Experience years in those skills
 *    - Rate per project
 * 2. "Setup Profile" Page:
 *    - Upload profile picture
 *    - Bio
 *    - Portfolio link
 *    - Get a skill tag
 * Only after completing both pages can a newly signed-up student enter the Home page.
 */
export function OnboardingView({
  user,
  onUpdateUser,
  onFinishToHome,
}: OnboardingViewProps) {
  const p = user.profile;

  // Step 1 = Setup, Step 2 = Setup Profile
  const [page, setPage] = useState<1 | 2>(() => (user.onboardingStep >= 2 ? 2 : 1));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- PAGE 1: SETUP STATE ---
  const [subjects, setSubjects] = useState<string[]>(() =>
    p.subjects.length ? p.subjects : []
  );
  const [customSubject, setCustomSubject] = useState('');

  const [skills, setSkills] = useState<string[]>(() =>
    p.skills.length ? p.skills.slice(0, MAX_SKILLS) : []
  );
  const [customSkill, setCustomSkill] = useState('');

  const [experienceYears, setExperienceYears] = useState<string>(() =>
    p.experienceYears ? String(p.experienceYears) : '1'
  );
  const [ratePerProject, setRatePerProject] = useState<string>(() =>
    p.ratePerProject || ''
  );

  // --- PAGE 2: SETUP PROFILE STATE ---
  const [avatarUrl, setAvatarUrl] = useState<string>(p.avatarUrl || '');
  const [avatarPreset, setAvatarPreset] = useState<string>(p.avatarPreset || 'violet-coder');
  const [bio, setBio] = useState<string>(p.bio || '');
  const [portfolioUrl, setPortfolioUrl] = useState<string>(p.portfolioUrl || '');
  const [selectedSkillTag, setSelectedSkillTag] = useState<string>(
    p.generatedTags[0] || ''
  );
  const [tagRevealed, setTagRevealed] = useState<boolean>(() => Boolean(p.generatedTags.length));

  const parsedYears = Math.max(0, Math.min(20, Number(experienceYears) || 0));
  const tagChoices = generateSkillTagOptions(skills, subjects, parsedYears);
  const activeTag = selectedSkillTag && tagChoices.includes(selectedSkillTag)
    ? selectedSkillTag
    : selectedSkillTag || tagChoices[0];

  const toggleSubject = (subj: string) => {
    setErrorMsg('');
    if (subjects.includes(subj)) {
      setSubjects(subjects.filter((s) => s !== subj));
    } else {
      setSubjects([...subjects, subj]);
    }
  };

  const addCustomSubject = () => {
    const clean = customSubject.trim();
    if (!clean) return;
    if (!subjects.includes(clean)) {
      setSubjects([...subjects, clean]);
    }
    setCustomSubject('');
    setErrorMsg('');
  };

  const toggleSkill = (sk: string) => {
    setErrorMsg('');
    if (skills.includes(sk)) {
      setSkills(skills.filter((s) => s !== sk));
      return;
    }
    if (skills.length >= MAX_SKILLS) {
      setErrorMsg(`You can select at most ${MAX_SKILLS} skills. Deselect one to swap.`);
      return;
    }
    setSkills([...skills, sk]);
  };

  const addCustomSkill = () => {
    const clean = customSkill.trim();
    if (!clean) return;
    if (skills.includes(clean)) {
      setCustomSkill('');
      return;
    }
    if (skills.length >= MAX_SKILLS) {
      setErrorMsg(`Maximum ${MAX_SKILLS} skills allowed.`);
      return;
    }
    setSkills([...skills, clean]);
    setCustomSkill('');
    setErrorMsg('');
  };

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const uploaded = await api.uploadMedia(reader.result, 'avatar');
          setAvatarUrl(uploaded.url);
          setErrorMsg('');
        } catch (err: any) {
          setErrorMsg(err.message || 'Could not upload profile photo.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSetupContinue = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (subjects.length === 0) {
      setErrorMsg('Please select at least one subject you are interested in.');
      return;
    }
    if (skills.length === 0) {
      setErrorMsg('Please select at least 1 skill (up to 10 skills).');
      return;
    }
    if (skills.length > MAX_SKILLS) {
      setErrorMsg(`You can only select up to ${MAX_SKILLS} skills.`);
      return;
    }
    if (!ratePerProject.trim()) {
      setErrorMsg('Please enter the rate you will take per project.');
      return;
    }

    setSaving(true);
    try {
      const nextTags = generateSkillTagOptions(skills, subjects, parsedYears);
      if (!selectedSkillTag) {
        setSelectedSkillTag(nextTags[0]);
      }
      const res = await api.saveOnboarding({
        step: 2,
        completed: false,
        profilePatch: {
          subjects,
          skills,
          experienceYears: parsedYears,
          ratePerProject: ratePerProject.trim(),
          generatedTags: [nextTags[0], ...nextTags.slice(1, 3)],
        },
      });
      onUpdateUser(res.user);
      setPage(2);
      window.scrollTo(0, 0);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save setup details.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteProfile = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!bio.trim()) {
      setErrorMsg('Please add a short bio for your profile.');
      return;
    }
    if (!portfolioUrl.trim()) {
      setErrorMsg('Please enter your portfolio or project link.');
      return;
    }
    if (!tagRevealed) {
      setErrorMsg('Click "Get Skill Tag" to claim your skill badge before entering TeenStack.');
      return;
    }

    let normalizedUrl = portfolioUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const finalTag = activeTag || tagChoices[0] || '#TeenStackCreator';
    const remainingTags = tagChoices.filter((t) => t !== finalTag).slice(0, 2);

    setSaving(true);
    try {
      const res = await api.saveOnboarding({
        step: 2,
        completed: true,
        profilePatch: {
          subjects,
          skills,
          experienceYears: parsedYears,
          ratePerProject: ratePerProject.trim(),
          avatarUrl,
          avatarPreset,
          bio: bio.trim(),
          portfolioUrl: normalizedUrl,
          generatedTags: [finalTag, ...remainingTags],
        },
      });
      onUpdateUser(res.user);
      onFinishToHome(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not complete profile setup.');
      setSaving(false);
    }
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-4xl flex-col justify-between px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      {/* Top Brand + 2-Step Indicator */}
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-heading text-lg font-bold uppercase tracking-[0.24em] text-white sm:text-xl">
            TEEN<span className="text-[#27D9D0]">STACK</span>
          </span>
          <span className="rounded-full border border-white/12 bg-[#111426] px-3 py-1 text-xs font-semibold text-[#27D9D0]">
            Step {page} of 2 · Required
          </span>
        </div>

        {/* Two-Page Morphing Stepper: [ 1. Setup ] ---> [ 2. Setup Profile ] */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { id: 1 as const, label: '1. Setup', sub: 'Subject · Skills (Max 10) · Exp · Rate', icon: Sliders },
            { id: 2 as const, label: '2. Setup Profile', sub: 'Photo · Bio · Portfolio · Skill Tag', icon: UserCheck },
          ].map((item) => {
            const Icon = item.icon;
            const current = page === item.id;
            const completed = page > item.id;
            return (
              <div
                key={item.id}
                className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 transition-colors sm:p-3.5 ${
                  current
                    ? 'border-[#743BFF] bg-[#161A36] text-white'
                    : completed
                    ? 'border-[#27D9D0]/40 bg-[#111426]/90 text-white'
                    : 'border-white/10 bg-[#111426]/55 text-[#A5A9BC]'
                }`}
              >
                {current && (
                  <motion.div
                    layoutId="setup-two-step-pill"
                    transition={SPRINGS.pill}
                    className="absolute inset-0 -z-10 bg-gradient-to-r from-[#743BFF]/25 to-[#258BFF]/15"
                  />
                )}
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                    current
                      ? 'bg-[#743BFF] text-white'
                      : completed
                      ? 'bg-[#27D9D0]/20 text-[#27D9D0]'
                      : 'bg-white/8 text-[#A5A9BC]'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-heading text-xs font-bold sm:text-sm">{item.label}</div>
                  <div className="hidden truncate text-[11px] text-[#A5A9BC] sm:block">{item.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      {/* Main Card */}
      <main className="my-auto py-4 sm:py-6">
        <motion.div
          layout
          layoutId="primary-auth-card"
          transition={SPRINGS.morph}
          className="ts-surface-elevated overflow-hidden rounded-3xl p-4 sm:p-8"
        >
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {page === 1 ? (
              /* ============================================================
                 PAGE 1: SETUP
                 - Subject interested in
                 - Skills (Max 10)
                 - Experience years in that skill
                 - Rate per project
                 ============================================================ */
              <motion.form
                key="setup-page-1"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={SPRINGS.morph}
                onSubmit={handleSetupContinue}
                className="space-y-5"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#27D9D0]">
                    Step 1 · Builder Setup
                  </span>
                  <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
                    Setup
                  </h1>
                  <p className="mt-0.5 text-xs text-[#A5A9BC] sm:text-sm">
                    Select your subject interests, up to 10 skills, your experience in years, and your project rate.
                  </p>
                </div>

                {/* 1. Subject Interested In */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white sm:text-sm">
                      1. Subject Interested In <span className="text-[#27D9D0]">*</span>
                    </label>
                    <span className="text-[11px] text-[#A5A9BC]">
                      {subjects.length} selected
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_SUBJECTS.map((subj) => {
                      const active = subjects.includes(subj);
                      return (
                        <button
                          key={subj}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleSubject(subj)}
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-[#743BFF] bg-[#743BFF]/25 text-white'
                              : 'border-white/12 bg-[#080910] text-[#A5A9BC] hover:text-white'
                          }`}
                        >
                          {active && <Check className="h-3.5 w-3.5 text-[#27D9D0]" />}
                          <span>{subj}</span>
                        </button>
                      );
                    })}
                    {subjects
                      .filter((s) => !SUGGESTED_SUBJECTS.includes(s))
                      .map((custom) => (
                        <button
                          key={custom}
                          type="button"
                          onClick={() => toggleSubject(custom)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#743BFF] bg-[#743BFF]/25 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          <span>{custom}</span>
                          <X className="h-3 w-3 text-[#27D9D0]" />
                        </button>
                      ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomSubject();
                        }
                      }}
                      placeholder="Or add another subject (e.g. Astrophysics)…"
                      className="min-h-[42px] flex-1 rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustomSubject}
                      className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-white/14 bg-[#111426] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#743BFF]"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>

                {/* 2. Skills (Strictly capped at 10 skills!) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white sm:text-sm">
                      2. Your Skills <span className="text-[#A5A9BC] font-normal">(Max 10)</span>{' '}
                      <span className="text-[#27D9D0]">*</span>
                    </label>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        skills.length >= MAX_SKILLS
                          ? 'bg-[#27D9D0]/20 text-[#27D9D0]'
                          : 'bg-white/8 text-white'
                      }`}
                    >
                      {skills.length} / {MAX_SKILLS} skills
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_SKILLS.map((sk) => {
                      const active = skills.includes(sk);
                      const disabled = !active && skills.length >= MAX_SKILLS;
                      return (
                        <button
                          key={sk}
                          type="button"
                          aria-pressed={active}
                          disabled={disabled}
                          onClick={() => toggleSkill(sk)}
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-[#258BFF] bg-[#258BFF]/25 text-white'
                              : disabled
                              ? 'cursor-not-allowed border-white/6 bg-[#080910]/40 text-[#A5A9BC]/35'
                              : 'border-white/12 bg-[#080910] text-[#A5A9BC] hover:text-white'
                          }`}
                        >
                          {active && <Check className="h-3.5 w-3.5 text-[#27D9D0]" />}
                          <span>{sk}</span>
                        </button>
                      );
                    })}
                    {skills
                      .filter((s) => !SUGGESTED_SKILLS.includes(s))
                      .map((custom) => (
                        <button
                          key={custom}
                          type="button"
                          onClick={() => toggleSkill(custom)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#258BFF] bg-[#258BFF]/25 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          <span>{custom}</span>
                          <X className="h-3 w-3 text-[#27D9D0]" />
                        </button>
                      ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      disabled={skills.length >= MAX_SKILLS}
                      value={customSkill}
                      onChange={(e) => setCustomSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomSkill();
                        }
                      }}
                      placeholder={
                        skills.length >= MAX_SKILLS
                          ? 'Maximum 10 skills selected'
                          : 'Add a custom skill (e.g. Blender, Solidity, C#)…'
                      }
                      className="min-h-[42px] flex-1 rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#258BFF] disabled:opacity-45 sm:text-xs"
                    />
                    <button
                      type="button"
                      disabled={skills.length >= MAX_SKILLS}
                      onClick={addCustomSkill}
                      className="inline-flex min-h-[42px] items-center gap-1 rounded-xl bg-[#258BFF]/20 border border-[#258BFF]/40 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>

                {/* 3. Experience Years & 4. Rate Per Project */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="setup-exp-years"
                      className="mb-1.5 block text-xs font-semibold text-white sm:text-sm"
                    >
                      3. Experience Years in Skill <span className="text-[#27D9D0]">*</span>
                    </label>
                    <input
                      id="setup-exp-years"
                      type="number"
                      min={0}
                      max={20}
                      step="0.5"
                      required
                      inputMode="decimal"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="e.g. 2"
                      className="min-h-[46px] w-full rounded-xl border border-white/14 bg-[#080910] px-4 py-2.5 text-base text-white focus:border-[#743BFF] sm:text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-rate"
                      className="mb-1.5 block text-xs font-semibold text-white sm:text-sm"
                    >
                      4. Rate Per Project <span className="text-[#27D9D0]">*</span>
                    </label>
                    <input
                      id="setup-rate"
                      type="text"
                      required
                      value={ratePerProject}
                      onChange={(e) => setRatePerProject(e.target.value)}
                      placeholder="e.g. $120 / project or ₹5,000"
                      className="min-h-[46px] w-full rounded-xl border border-white/14 bg-[#080910] px-4 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {RATE_PRESETS.map((rp) => (
                        <button
                          key={rp}
                          type="button"
                          onClick={() => setRatePerProject(rp)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                            ratePerProject === rp
                              ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-[#27D9D0]'
                              : 'border-white/10 bg-[#080910] text-[#A5A9BC] hover:text-white'
                          }`}
                        >
                          {rp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Continue to Setup Profile */}
                <div className="flex justify-end border-t border-white/10 pt-4">
                  <motion.button
                    type="submit"
                    disabled={saving}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_26px_-6px_rgba(116,59,255,0.75)] sm:w-auto"
                  >
                    {saving ? <Loader2 className="h-4 w-4 ts-spin" /> : null}
                    <span>Next: Setup Profile</span>
                    <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.form>
            ) : (
              /* ============================================================
                 PAGE 2: SETUP PROFILE
                 - Upload profile picture
                 - Bio
                 - Portfolio link
                 - Get a skill tag
                 -> Complete to unlock Home Page
                 ============================================================ */
              <motion.form
                key="setup-profile-page-2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={SPRINGS.morph}
                onSubmit={handleCompleteProfile}
                className="space-y-5"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#27D9D0]">
                    Step 2 · Public Student Identity
                  </span>
                  <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
                    Setup Profile
                  </h1>
                  <p className="mt-0.5 text-xs text-[#A5A9BC] sm:text-sm">
                    Upload your profile picture, write your bio, add your portfolio link, and generate your skill tag to unlock TeenStack.
                  </p>
                </div>

                {/* 1. Upload Profile Picture */}
                <div className="rounded-2xl border border-white/12 bg-[#080910]/85 p-4">
                  <span className="mb-3 block text-xs font-semibold text-white sm:text-sm">
                    1. Upload Profile Picture
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="rounded-full bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[2.5px]">
                      <div className="rounded-full bg-[#080910] p-[2px]">
                        <StudentAvatar
                          presetOrUrl={avatarUrl || avatarPreset}
                          name={user.fullName}
                          size="xl"
                          className="!h-20 !w-20 !rounded-full"
                        />
                      </div>
                    </div>

                    <div className="flex-1 space-y-2.5">
                      <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl bg-[#743BFF] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#834DFF]">
                        <Upload className="h-4 w-4" />
                        <span>{avatarUrl ? 'Change Uploaded Photo' : 'Upload Photo from Device'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="sr-only"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-[#A5A9BC] mr-1">Or pick preset:</span>
                        {Object.entries(AVATAR_PRESETS).map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setAvatarUrl('');
                              setAvatarPreset(key);
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                              !avatarUrl && avatarPreset === key
                                ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-white'
                                : 'border-white/10 bg-[#111426] text-[#A5A9BC] hover:text-white'
                            }`}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Bio */}
                <div>
                  <label
                    htmlFor="setup-profile-bio"
                    className="mb-1.5 block text-xs font-semibold text-white sm:text-sm"
                  >
                    2. Bio <span className="text-[#27D9D0]">*</span>
                  </label>
                  <textarea
                    id="setup-profile-bio"
                    rows={3}
                    required
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="e.g. 17yo student builder passionate about robotics, React interfaces, and open science…"
                    className="w-full rounded-xl border border-white/14 bg-[#080910] p-3.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                  />
                </div>

                {/* 3. Portfolio Link */}
                <div>
                  <label
                    htmlFor="setup-portfolio-url"
                    className="mb-1.5 block text-xs font-semibold text-white sm:text-sm"
                  >
                    3. Portfolio Link <span className="text-[#27D9D0]">*</span>
                  </label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#258BFF]" />
                    <input
                      id="setup-portfolio-url"
                      type="text"
                      required
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://github.com/yourname or yourportfolio.dev"
                      className="min-h-[46px] w-full rounded-xl border border-white/14 bg-[#080910] py-2.5 pr-4 pl-10 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                    />
                  </div>
                </div>

                {/* 4. Get a Skill Tag */}
                <div className="rounded-2xl border border-[#743BFF]/35 bg-gradient-to-br from-[#161233] via-[#111426] to-[#0D2138] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold text-white sm:text-sm">
                        4. Your TeenStack Skill Tag <span className="text-[#27D9D0]">*</span>
                      </span>
                      <p className="mt-0.5 text-xs text-[#A5A9BC]">
                        Generated from {skills.slice(0, 3).join(', ') || 'your skills'} ({parsedYears} yr{parsedYears === 1 ? '' : 's'} exp)
                      </p>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setTagRevealed(true);
                        if (!selectedSkillTag && tagChoices[0]) {
                          setSelectedSkillTag(tagChoices[0]);
                        }
                        setErrorMsg('');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#743BFF] to-[#27D9D0] px-4 py-2 text-xs font-bold text-white shadow-md"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{tagRevealed ? 'Skill Tag Ready!' : 'Get Skill Tag'}</span>
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {tagRevealed && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={SPRINGS.morph}
                        className="mt-4 space-y-2 border-t border-white/10 pt-3.5"
                      >
                        <div className="text-[11px] font-medium text-[#A5A9BC]">
                          Primary Skill Tag (tap to choose your badge):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tagChoices.map((tag) => {
                            const chosen = activeTag === tag;
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setSelectedSkillTag(tag)}
                                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all ${
                                  chosen
                                    ? 'border-[#27D9D0] bg-[#27D9D0]/20 text-[#27D9D0] shadow-[0_0_20px_rgba(39,217,208,0.3)]'
                                    : 'border-white/12 bg-[#080910]/80 text-white/80 hover:text-white'
                                }`}
                              >
                                {chosen && <Check className="h-3.5 w-3.5" />}
                                <span>{tag}</span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Back & Complete Buttons */}
                <div className="flex flex-col-reverse gap-2.5 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setErrorMsg('');
                      setPage(1);
                      window.scrollTo(0, 0);
                    }}
                    className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-semibold text-[#A5A9BC] hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Setup</span>
                  </button>

                  <motion.button
                    type="submit"
                    disabled={saving}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#258BFF] to-[#27D9D0] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_28px_-6px_rgba(39,217,208,0.5)] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 ts-spin" /> : <Check className="h-4 w-4" />}
                    <span>Complete & Go to Home</span>
                    <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <footer className="text-center text-[11px] text-[#A5A9BC]/70">
        Complete both steps to unlock your TeenStack Home feed
      </footer>
    </div>
  );
}
