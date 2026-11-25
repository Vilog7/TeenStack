import { useState, type ChangeEvent, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Rocket,
  Trophy,
  Award,
  Upload,
  Sparkles,
  Check,
  X,
  Plus,
} from 'lucide-react';
import { SolarisArtwork } from '../ui/SolarisArtwork';
import { SPRINGS } from '../../lib/tokens';
import type { FeedPost, UserAccount } from '../../types';

type CreateMode = 'post' | 'project' | 'achievement' | 'certificate';

interface CreateStudioProps {
  user: UserAccount;
  onPublish: (payload: {
    category: FeedPost['category'];
    title: string;
    content: string;
    mediaType: FeedPost['mediaType'];
    mediaMeta?: Record<string, any>;
    skillTags: string[];
  }) => Promise<void>;
  compactModal?: boolean;
  onCloseModal?: () => void;
}

const MODES: { id: CreateMode; label: string; desc: string; icon: typeof Rocket }[] = [
  { id: 'post', label: 'Create Post', desc: 'Study note, question, or update', icon: FileText },
  { id: 'project', label: 'Upload Project', desc: 'Demo showcase, repo & visuals', icon: Rocket },
  { id: 'achievement', label: 'Share Achievement', desc: 'Hackathon win or milestone', icon: Trophy },
  { id: 'certificate', label: 'Upload Certificate', desc: 'Verified course or award badge', icon: Award },
];

export function CreateView({
  user,
  onPublish,
  compactModal = false,
  onCloseModal,
}: CreateStudioProps) {
  const [mode, setMode] = useState<CreateMode>('project');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [issuerOrLink, setIssuerOrLink] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [attachSolarisPreview, setAttachSolarisPreview] = useState(false);
  const [uploadedImage, setUploadedImage] = useState('');
  const [tags, setTags] = useState<string[]>(user.profile.skills.slice(0, 3));
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleImagePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedImage(reader.result);
        setAttachSolarisPreview(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !title.trim()) return;
    setSubmitting(true);

    try {
      let category: FeedPost['category'] = 'post';
      let mediaType: FeedPost['mediaType'] = 'none';
      let mediaMeta: Record<string, any> = {};

      if (mode === 'project') {
        category = 'project';
        if (uploadedImage) {
          mediaType = 'image';
          mediaMeta = { imageUrl: uploadedImage, liveUrl: issuerOrLink };
        } else if (attachSolarisPreview) {
          mediaType = 'landscape_illustration';
          mediaMeta = { liveUrl: issuerOrLink || 'demo.teenstack.dev' };
        } else if (codeSnippet.trim()) {
          mediaType = 'code_preview';
          mediaMeta = { language: 'typescript', snippet: codeSnippet.trim(), readTime: 'Project snippet' };
        }
      } else if (mode === 'achievement') {
        category = 'achievement';
        mediaType = 'certificate_card';
        mediaMeta = {
          award: title || 'Student Milestone',
          issuer: issuerOrLink || 'TeenStack Community',
          verified: true,
        };
      } else if (mode === 'certificate') {
        category = 'certificate';
        mediaType = 'certificate_card';
        mediaMeta = {
          award: title || 'Verified Course Credential',
          issuer: issuerOrLink || 'TeenStack Learning Track',
          verified: true,
        };
      } else {
        category = codeSnippet.trim() ? 'tutorial' : 'post';
        if (codeSnippet.trim()) {
          mediaType = 'code_preview';
          mediaMeta = { language: 'code', snippet: codeSnippet.trim(), readTime: 'Study note' };
        }
      }

      await onPublish({
        category,
        title: title.trim(),
        content: content.trim() || title.trim(),
        mediaType,
        mediaMeta,
        skillTags: tags,
      });

      setTitle('');
      setContent('');
      setIssuerOrLink('');
      setCodeSnippet('');
      setUploadedImage('');
      if (onCloseModal) onCloseModal();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      transition={SPRINGS.morph}
      className={compactModal ? 'space-y-4' : 'ts-surface-elevated rounded-3xl p-5 sm:p-7 space-y-6'}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>TeenStack Creation Studio</span>
          </span>
          <h1 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
            Publish your work to the student network
          </h1>
        </div>
        {compactModal && onCloseModal && (
          <button
            type="button"
            aria-label="Close quick create"
            onClick={onCloseModal}
            className="rounded-xl border border-white/12 p-2 text-[#A5A9BC] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 4 Morphing Mode Selector Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`relative rounded-2xl border p-3 text-left transition-colors ${
                active
                  ? 'border-[#743BFF] text-white'
                  : 'border-white/10 bg-[#080910]/65 text-[#A5A9BC] hover:text-white'
              }`}
            >
              {active && (
                <motion.div
                  layoutId={compactModal ? 'modal-create-tab' : 'page-create-tab'}
                  transition={SPRINGS.pill}
                  className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-[#743BFF]/30 to-[#258BFF]/18"
                />
              )}
              <Icon className={`h-4 w-4 ${active ? 'text-[#27D9D0]' : 'text-[#743BFF]'}`} />
              <div className="mt-2 font-heading text-xs font-bold text-white sm:text-sm">{m.label}</div>
              <div className="mt-0.5 hidden text-[11px] text-[#A5A9BC] sm:block">{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Morphing Dynamic Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={SPRINGS.morph}
            className="space-y-4"
          >
            <div>
              <label htmlFor="create-title" className="mb-1.5 block text-xs font-medium text-white">
                {mode === 'project'
                  ? 'Project Name'
                  : mode === 'achievement'
                  ? 'Achievement / Award Title'
                  : mode === 'certificate'
                  ? 'Certificate Title'
                  : 'Post Headline'}
              </label>
              <input
                id="create-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  mode === 'project'
                    ? 'e.g. Neural Flashcard Engine v1.2'
                    : mode === 'achievement'
                    ? 'e.g. Finalist — National Robotics Challenge'
                    : mode === 'certificate'
                    ? 'e.g. UI Motion & Spatial Morphing Credential'
                    : 'e.g. How I debugged WebSockets for our study group app'
                }
                className="w-full rounded-xl border border-white/14 bg-[#080910] px-4 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
              />
            </div>

            {(mode === 'project' || mode === 'achievement' || mode === 'certificate') && (
              <div>
                <label htmlFor="create-meta" className="mb-1.5 block text-xs font-medium text-white">
                  {mode === 'project'
                    ? 'Live Demo or Repository URL (Optional)'
                    : 'Issuing Organization / Event'}
                </label>
                <input
                  id="create-meta"
                  type="text"
                  value={issuerOrLink}
                  onChange={(e) => setIssuerOrLink(e.target.value)}
                  placeholder={
                    mode === 'project'
                      ? 'https://github.com/student/project'
                      : 'e.g. MIT Blueprint / TeenStack Academy'
                  }
                  className="w-full rounded-xl border border-white/14 bg-[#080910] px-4 py-2.5 text-sm text-white placeholder:text-[#A5A9BC]/45"
                />
              </div>
            )}

            <div>
              <label htmlFor="create-body" className="mb-1.5 block text-xs font-medium text-white">
                Story, Architecture Breakdown, or Takeaways
              </label>
              <textarea
                id="create-body"
                rows={compactModal ? 3 : 4}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share what problem you solved, tools used, and what feedback you're looking for…"
                className="w-full rounded-xl border border-white/14 bg-[#080910] p-3.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
              />
            </div>

            {(mode === 'post' || mode === 'project') && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/12 bg-[#080910] px-3 py-2 text-xs font-medium text-white hover:border-[#258BFF]">
                    <Upload className="h-3.5 w-3.5 text-[#258BFF]" />
                    <span>Attach Screenshot</span>
                    <input type="file" accept="image/*" onChange={handleImagePick} className="sr-only" />
                  </label>

                  {mode === 'project' && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage('');
                        setAttachSolarisPreview((v) => !v);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium ${
                        attachSolarisPreview
                          ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-[#27D9D0]'
                          : 'border-white/12 bg-[#080910] text-[#A5A9BC] hover:text-white'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Attach Interactive Terrain Canvas</span>
                    </button>
                  )}
                </div>

                {attachSolarisPreview && <SolarisArtwork compact />}

                {uploadedImage && (
                  <div className="relative overflow-hidden rounded-2xl border border-white/12">
                    <img src={uploadedImage} alt="Preview" className="max-h-52 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setUploadedImage('')}
                      className="absolute top-2 right-2 rounded-lg bg-[#080910]/80 p-1.5 text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {!compactModal && (
                  <div>
                    <label htmlFor="code-snippet" className="mb-1 block text-xs font-medium text-[#A5A9BC]">
                      Optional Code Snippet
                    </label>
                    <textarea
                      id="code-snippet"
                      rows={2}
                      value={codeSnippet}
                      onChange={(e) => setCodeSnippet(e.target.value)}
                      placeholder="const spring = { type: 'spring', stiffness: 320, damping: 30 };"
                      className="w-full rounded-xl border border-white/10 bg-[#080910] p-3 font-mono text-xs text-[#27D9D0] placeholder:text-[#A5A9BC]/35"
                    />
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Skill Tags Editor */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-white">Skill Tags</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-[#743BFF]/40 bg-[#743BFF]/15 px-3 py-1 text-xs text-white"
              >
                #{t.replace(/^#/, '')}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => setTags(tags.filter((x) => x !== t))}
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
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  setTags([...tags, tagInput.trim()]);
                  setTagInput('');
                }
              }}
              placeholder="Add tag (e.g. WebGL, Robotics)…"
              className="flex-1 rounded-xl border border-white/12 bg-[#080910] px-3.5 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (tagInput.trim()) {
                  setTags([...tags, tagInput.trim()]);
                  setTagInput('');
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-white/14 bg-[#111426] px-3 py-2 text-xs text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 pt-4">
          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#4D63FF] to-[#258BFF] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.75)] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>{submitting ? 'Publishing…' : `Publish ${MODES.find((x) => x.id === mode)?.label.split(' ')[1]}`}</span>
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
}

export function QuickCreateModal({
  open,
  user,
  onClose,
  onPublish,
}: {
  open: boolean;
  user: UserAccount;
  onClose: () => void;
  onPublish: CreateStudioProps['onPublish'];
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            aria-label="Quick Create"
            layoutId="quick-create-trigger"
            transition={SPRINGS.modal}
            className="ts-surface-elevated relative z-10 max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 sm:p-6"
          >
            <CreateView user={user} onPublish={onPublish} compactModal onCloseModal={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
