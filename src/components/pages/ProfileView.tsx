import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ExternalLink,
  Award,
  Sparkles,
  ShieldCheck,
  Edit3,
  Plus,
  Users,
  ArrowLeft,
  MessageSquare,
  UserCheck,
  UserPlus,
  Sliders,
  LogOut,
  X,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { PEER_STUDENTS } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { PeerStudent, UserAccount } from '../../types';

interface ProfileViewProps {
  user: UserAccount;
  inspectingPeer: PeerStudent | null;
  connectedIds: Set<string>;
  onClearInspectingPeer: () => void;
  onToggleConnect: (peerId: string) => void;
  onMessagePeer: () => void;
  onSaveProfilePatch: (patch: Partial<UserAccount['profile']>, nextName?: string) => Promise<void>;
  onOpenOnboardingWizard: () => void;
  onLogout?: () => void;
}

export function ProfileView({
  user,
  inspectingPeer,
  connectedIds,
  onClearInspectingPeer,
  onToggleConnect,
  onMessagePeer,
  onSaveProfilePatch,
  onOpenOnboardingWizard,
  onLogout,
}: ProfileViewProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(user.fullName);
  const [editBio, setEditBio] = useState(user.profile.bio);
  const [editSchool, setEditSchool] = useState(user.profile.school);
  const [editPortfolioUrl, setEditPortfolioUrl] = useState(user.profile.portfolioUrl);
  const [hideContact, setHideContact] = useState(user.profile.privacy.hideContactInfo);
  const [dmPerm, setDmPerm] = useState(user.profile.privacy.dmPermission);

  // Quick Add Project drawer
  const [addingProj, setAddingProj] = useState(false);
  const [projTitle, setProjTitle] = useState('');
  const [projSummary, setProjSummary] = useState('');
  const [projTag, setProjTag] = useState('TypeScript · Web');

  // If inspecting a peer student profile (morphed from Recommended Student / Author card!)
  if (inspectingPeer) {
    const isConnected = connectedIds.has(inspectingPeer.id);
    return (
      <motion.div
        layout
        layoutId={`peer-card-${inspectingPeer.id}`}
        transition={SPRINGS.morph}
        className="space-y-5"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClearInspectingPeer}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-[#111426] px-4 py-2 text-xs font-semibold text-white hover:border-[#27D9D0]"
          >
            <ArrowLeft className="h-4 w-4 text-[#27D9D0]" />
            <span>Back to My Profile</span>
          </button>
        </div>

        <section className="ts-surface-elevated rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <StudentAvatar
                presetOrUrl={inspectingPeer.avatarPreset}
                name={inspectingPeer.name}
                size="xl"
                online={inspectingPeer.online}
              />
              <div>
                <h1 className="font-heading text-2xl font-bold text-white sm:text-3xl">
                  {inspectingPeer.name}
                </h1>
                <p className="text-sm text-[#27D9D0]">
                  {inspectingPeer.handle} · {inspectingPeer.school} · {inspectingPeer.age} yrs
                </p>
                <p className="mt-1 text-xs font-medium text-white/90">{inspectingPeer.headline}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onToggleConnect(inspectingPeer.id)}
                className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold ${
                  isConnected
                    ? 'border border-[#27D9D0]/45 bg-[#27D9D0]/15 text-[#27D9D0]'
                    : 'bg-[#743BFF] text-white'
                }`}
              >
                {isConnected ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                <span>{isConnected ? 'Connected' : 'Connect'}</span>
              </button>

              <button
                type="button"
                onClick={onMessagePeer}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-[#258BFF]/50 bg-[#258BFF]/15 px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#258BFF]/30"
              >
                <MessageSquare className="h-4 w-4 text-[#258BFF]" />
                <span>Message</span>
              </button>
            </div>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#A5A9BC]">
            {inspectingPeer.bio}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {inspectingPeer.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-[#27D9D0]/35 bg-[#27D9D0]/12 px-3 py-1 text-xs font-semibold text-[#27D9D0]"
              >
                {t}
              </span>
            ))}
            {inspectingPeer.skills.map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/10 bg-[#080910]/80 px-3 py-1 text-xs text-white"
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <section className="ts-surface rounded-3xl p-5">
            <h2 className="font-heading text-base font-bold text-white">Shipped Projects</h2>
            <div className="mt-3 space-y-3">
              {inspectingPeer.projects.map((pr) => (
                <div key={pr.id} className="rounded-2xl border border-white/8 bg-[#080910]/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-sm font-bold text-white">{pr.title}</span>
                    <span className="rounded-md bg-[#258BFF]/20 px-2 py-0.5 text-[10px] font-semibold text-[#258BFF]">
                      {pr.tag}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#A5A9BC]">{pr.summary}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="ts-surface rounded-3xl p-5">
            <h2 className="font-heading text-base font-bold text-white">Verified Achievements</h2>
            <div className="mt-3 space-y-2.5">
              {inspectingPeer.achievements.map((ach) => (
                <div
                  key={ach}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-[#080910]/70 p-3.5 text-xs text-white"
                >
                  <Award className="h-4 w-4 shrink-0 text-[#27D9D0]" />
                  <span>{ach}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    );
  }

  // Own Student Profile
  const p = user.profile;

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveProfilePatch(
      {
        bio: editBio,
        school: editSchool,
        portfolioUrl: editPortfolioUrl,
        privacy: {
          ...p.privacy,
          hideContactInfo: hideContact,
          dmPermission: dmPerm,
        },
      },
      editName
    );
    setEditOpen(false);
  };

  const handleAddProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;
    const nextProjects = [
      {
        id: `proj-${Date.now()}`,
        title: projTitle.trim(),
        summary: projSummary.trim() || 'Student build showcased on TeenStack.',
        link: p.portfolioUrl || 'https://teenstack.dev',
        tag: projTag.trim() || 'Student Build',
      },
      ...p.portfolioProjects,
    ];
    await onSaveProfilePatch({
      portfolioProjects: nextProjects,
      projectsCompleted: (p.projectsCompleted || 0) + 1,
    });
    setProjTitle('');
    setProjSummary('');
    setAddingProj(false);
  };

  return (
    <div className="space-y-5">
      {/* INSTAGRAM-STYLE MOBILE & DESKTOP STUDENT PROFILE HEADER */}
      <section className="ts-surface-elevated relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-8">
        {/* Top Row: Avatar + 3 Instagram Counters */}
        <div className="flex items-center gap-5 sm:gap-8">
          <div className="shrink-0 rounded-full bg-gradient-to-tr from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[2.5px]">
            <div className="rounded-full bg-[#080910] p-[2px]">
              <StudentAvatar
                layoutId="current-user-avatar-hero"
                presetOrUrl={p.avatarUrl || p.avatarPreset}
                name={user.fullName}
                size="xl"
                className="!h-20 !w-20 !rounded-full sm:!h-24 sm:!w-24"
              />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-around text-center sm:justify-start sm:gap-10">
            <div>
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {p.projectsCompleted}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">projects</div>
            </div>
            <div>
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {connectedIds.size + 128}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">followers</div>
            </div>
            <div>
              <div className="font-heading text-base font-bold text-white sm:text-xl">
                {connectedIds.size + 14}
              </div>
              <div className="text-[11px] text-[#A5A9BC] sm:text-xs">following</div>
            </div>
          </div>
        </div>

        {/* Name, Bio & Skill Tags */}
        <div className="mt-3.5 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-sm font-bold text-white sm:text-xl">
              {user.fullName}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#27D9D0]/12 px-2 py-0.5 text-[10px] font-semibold text-[#27D9D0]">
              <ShieldCheck className="h-3 w-3" />
              @{user.username}
            </span>
          </div>
          <p className="text-xs text-[#A5A9BC]">
            {p.school || p.educationLevel} · Age {user.age}
            {p.desiredField ? ` · ${p.desiredField}` : ''}
          </p>
          <p className="pt-1 max-w-2xl text-xs leading-relaxed text-white/90 sm:text-sm">
            {p.bio || 'Add a biography to tell peers and mentors what you are building.'}
          </p>
        </div>

        {/* Skill Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.generatedTags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-medium text-[#27D9D0]"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Instagram-Style Action Buttons Row (Fits 100% cleanly on 360px phones) */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <motion.button
            type="button"
            layoutId="edit-profile-modal-surface"
            onClick={() => setEditOpen(true)}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            <Edit3 className="h-3.5 w-3.5 text-[#27D9D0]" />
            <span>Edit profile</span>
          </motion.button>

          <button
            type="button"
            onClick={onOpenOnboardingWizard}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            <Sliders className="h-3.5 w-3.5 text-[#743BFF]" />
            <span>Setup wizard</span>
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="col-span-2 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 sm:col-span-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          )}
        </div>
      </section>

      {/* PORTFOLIO & PROJECTS + ACHIEVEMENTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left 7 cols: Portfolio Projects */}
        <section className="ts-surface space-y-4 rounded-3xl p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">Portfolio & Projects</h2>
              {p.portfolioUrl && (
                <a
                  href={p.portfolioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#258BFF] hover:underline"
                >
                  <span>{p.portfolioUrl}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAddingProj((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-[#743BFF]/40 bg-[#743BFF]/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#743BFF]/30"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Project</span>
            </button>
          </div>

          <AnimatePresence>
            {addingProj && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddProject}
                className="space-y-3 overflow-hidden rounded-2xl border border-[#743BFF]/35 bg-[#080910]/80 p-4"
              >
                <input
                  type="text"
                  required
                  value={projTitle}
                  onChange={(e) => setProjTitle(e.target.value)}
                  placeholder="Project title (e.g. Quantum Circuit Visualizer)"
                  className="w-full rounded-xl border border-white/12 bg-[#111426] px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={projSummary}
                  onChange={(e) => setProjSummary(e.target.value)}
                  placeholder="1-sentence summary of what it does…"
                  className="w-full rounded-xl border border-white/12 bg-[#111426] px-3 py-2 text-xs text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={projTag}
                    onChange={(e) => setProjTag(e.target.value)}
                    placeholder="Stack tag"
                    className="rounded-xl border border-white/12 bg-[#111426] px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#743BFF] px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    Save to Portfolio
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            {p.portfolioProjects.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-[#080910]/60 p-4 text-xs text-[#A5A9BC]">
                No projects listed yet—click “Add Project” to showcase your first build!
              </p>
            ) : (
              p.portfolioProjects.map((proj) => (
                <motion.div
                  layout
                  key={proj.id}
                  className="rounded-2xl border border-white/8 bg-[#080910]/70 p-4 hover:border-[#258BFF]/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading text-sm font-bold text-white sm:text-base">
                      {proj.title}
                    </h3>
                    <span className="rounded-lg bg-[#258BFF]/18 px-2.5 py-0.5 text-[11px] font-semibold text-[#258BFF]">
                      {proj.tag}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#A5A9BC]">{proj.summary}</p>
                </motion.div>
              ))
            )}
          </div>
        </section>

        {/* Right 5 cols: Achievements, Career Goals & Connections */}
        <div className="space-y-5 lg:col-span-5">
          <section className="ts-surface rounded-3xl p-5">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[#27D9D0]" />
              <h2 className="font-heading text-base font-bold text-white">
                Achievements & Competitions
              </h2>
            </div>
            <div className="mt-3 space-y-2">
              {[...p.achievements, ...p.competitions].map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-[#080910]/65 p-3 text-xs text-white"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#743BFF]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="ts-surface rounded-3xl p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#258BFF]" />
              <h2 className="font-heading text-base font-bold text-white">Student Network</h2>
            </div>
            <div className="mt-3 space-y-2">
              {PEER_STUDENTS.slice(0, 3).map((peer) => (
                <div
                  key={peer.id}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#080910]/60 p-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <StudentAvatar presetOrUrl={peer.avatarPreset} name={peer.name} size="xs" online={peer.online} />
                    <div>
                      <div className="text-xs font-semibold text-white">{peer.name}</div>
                      <div className="text-[10px] text-[#A5A9BC]">{peer.school}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#27D9D0]">
                    {peer.mutualConnections} mutuals
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* MORPHING EDIT PROFILE & TEEN SAFETY PRIVACY MODAL */}
      <AnimatePresence>
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditOpen(false)}
              className="absolute inset-0 bg-[#080910]/80 backdrop-blur-md"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Edit Student Profile and Privacy"
              layoutId="edit-profile-modal-surface"
              transition={SPRINGS.modal}
              className="ts-surface-elevated relative z-10 w-full max-w-lg rounded-3xl p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold text-white">
                  Edit Profile & Teen Safety Controls
                </h2>
                <button
                  type="button"
                  aria-label="Close edit modal"
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border border-white/10 p-1.5 text-[#A5A9BC] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="ep-name" className="mb-1 block text-xs font-medium text-white">
                    Display Name
                  </label>
                  <input
                    id="ep-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label htmlFor="ep-school" className="mb-1 block text-xs font-medium text-white">
                    School / Institution
                  </label>
                  <input
                    id="ep-school"
                    type="text"
                    value={editSchool}
                    onChange={(e) => setEditSchool(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label htmlFor="ep-bio" className="mb-1 block text-xs font-medium text-white">
                    Biography
                  </label>
                  <textarea
                    id="ep-bio"
                    rows={3}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] p-3 text-xs text-white"
                  />
                </div>

                <div>
                  <label htmlFor="ep-url" className="mb-1 block text-xs font-medium text-white">
                    Portfolio URL
                  </label>
                  <input
                    id="ep-url"
                    type="url"
                    value={editPortfolioUrl}
                    onChange={(e) => setEditPortfolioUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-xs text-white"
                  />
                </div>

                {/* Teen Safety Settings */}
                <div className="space-y-2.5 rounded-2xl border border-[#27D9D0]/30 bg-[#080910]/80 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Teen Privacy Shield</span>
                  </div>

                  <label className="flex items-center justify-between text-xs text-[#A5A9BC]">
                    <span>Mask phone ({user.phone || 'private'}) & personal email</span>
                    <input
                      type="checkbox"
                      checked={hideContact}
                      onChange={(e) => setHideContact(e.target.checked)}
                      className="h-4 w-4 accent-[#27D9D0]"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-2 text-xs text-[#A5A9BC]">
                    <span>Who can message me</span>
                    <select
                      value={dmPerm}
                      onChange={(e) =>
                        setDmPerm(e.target.value as 'connections_only' | 'verified_students')
                      }
                      className="rounded-lg border border-white/12 bg-[#111426] px-2.5 py-1 text-xs text-white"
                    >
                      <option value="connections_only">Connections Only</option>
                      <option value="verified_students">Verified Students</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-xl border border-white/12 px-4 py-2 text-xs text-[#A5A9BC] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#743BFF] px-5 py-2 text-xs font-semibold text-white"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
