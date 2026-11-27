import { useState, useMemo, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Image as ImageIcon,
  Clapperboard,
  CircleFadingPlus,
  Upload,
  AtSign,
  Link2,
  Hash,
  Check,
  X,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { PEER_STUDENTS } from '../../data/catalog';
import { SPRINGS, assetUrl } from '../../lib/tokens';
import { api } from '../../lib/api';
import type { FeedPost, UserAccount } from '../../types';

export type CreateMode = 'story' | 'post' | 'reel';

const MAX_TAGGED_PEOPLE = 10;

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

const CREATE_MODES: {
  id: CreateMode;
  label: string;
  desc: string;
  icon: typeof ImageIcon;
}[] = [
  {
    id: 'story',
    label: 'Story',
    desc: 'Quick 24h highlight ring',
    icon: CircleFadingPlus,
  },
  {
    id: 'post',
    label: 'Post',
    desc: 'Feed photo or build update',
    icon: ImageIcon,
  },
  {
    id: 'reel',
    label: 'Reel',
    desc: 'Short vertical demo clip',
    icon: Clapperboard,
  },
];

const QUICK_TOPICS = [
  'Robotics',
  'Web Dev',
  'AI & ML',
  'UI/UX Design',
  'Hackathon',
  'Campus Life',
];

const SAMPLE_VISUALS = [
  { label: 'Shader Studio', path: 'images/posts/shader-desk.jpg' },
  { label: 'Lake Rover', path: 'images/posts/rover-lake.jpg' },
  { label: 'Hackathon Win', path: 'images/posts/hackathon-win.jpg' },
  { label: 'AI Lab', path: 'images/teens/ai-coder.jpg' },
];

function normalizeHandle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
  return cleaned ? `@${cleaned.slice(0, 24)}` : '';
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function CreateView({
  user,
  onPublish,
  compactModal = false,
  onCloseModal,
}: CreateStudioProps) {
  const [mode, setMode] = useState<CreateMode>('post');
  const [topic, setTopic] = useState('');
  const [caption, setCaption] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<string[]>([]);
  const [mentionInput, setMentionInput] = useState('');
  const [tagLimitNotice, setTagLimitNotice] = useState('');
  const [attachedLink, setAttachedLink] = useState('');
  const [uploadedMedia, setUploadedMedia] = useState('');
  const [uploadedIsVideo, setUploadedIsVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Extract active @query if the user is currently typing @something at the end of the caption
  const inlineCaptionMentionQuery = useMemo(() => {
    const match = caption.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [caption]);

  // Filter peer suggestions for the @ tagger input
  const filteredPeers = useMemo(() => {
    const needle = mentionInput.replace(/^@+/, '').trim().toLowerCase();
    return PEER_STUDENTS.filter((peer) => {
      const normalized = normalizeHandle(peer.handle);
      if (taggedPeople.includes(normalized)) return false;
      if (!needle) return true;
      return (
        normalized.includes(needle) ||
        peer.name.toLowerCase().includes(needle)
      );
    });
  }, [mentionInput, taggedPeople]);

  const inlineCaptionSuggestions = useMemo(() => {
    if (inlineCaptionMentionQuery === null) return [];
    return PEER_STUDENTS.filter((peer) => {
      const clean = peer.handle.replace(/^@/, '').toLowerCase();
      return (
        clean.includes(inlineCaptionMentionQuery) ||
        peer.name.toLowerCase().includes(inlineCaptionMentionQuery)
      );
    }).slice(0, 4);
  }, [inlineCaptionMentionQuery]);

  const addTaggedPerson = (rawHandle: string): boolean => {
    const normalized = normalizeHandle(rawHandle);
    if (!normalized) return false;
    if (taggedPeople.includes(normalized)) {
      setMentionInput('');
      setTagLimitNotice('');
      return true;
    }
    if (taggedPeople.length >= MAX_TAGGED_PEOPLE) {
      setTagLimitNotice(`You can tag at most ${MAX_TAGGED_PEOPLE} people on a ${mode}.`);
      return false;
    }
    setTaggedPeople((prev) => [...prev, normalized]);
    setMentionInput('');
    setTagLimitNotice('');
    return true;
  };

  const removeTaggedPerson = (handle: string) => {
    setTaggedPeople((prev) => prev.filter((h) => h !== handle));
    setTagLimitNotice('');
  };

  const handleMentionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && mentionInput.trim()) {
      e.preventDefault();
      addTaggedPerson(mentionInput);
    } else if (e.key === 'Backspace' && !mentionInput && taggedPeople.length > 0) {
      removeTaggedPerson(taggedPeople[taggedPeople.length - 1]);
    }
  };

  const handlePickInlineCaptionPeer = (peerHandle: string) => {
    const normalized = normalizeHandle(peerHandle);
    if (!normalized) return;
    if (!taggedPeople.includes(normalized) && taggedPeople.length >= MAX_TAGGED_PEOPLE) {
      setTagLimitNotice(`Maximum of ${MAX_TAGGED_PEOPLE} @tags reached.`);
      return;
    }
    setCaption((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9_.]*$/, (prefix) => {
      const leadingSpace = prefix.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}${normalized} `;
    }));
    if (!taggedPeople.includes(normalized)) {
      setTaggedPeople((prev) => [...prev, normalized]);
    }
    setTagLimitNotice('');
  };

  const handleMediaUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVid = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const uploaded = await api.uploadMedia(
            reader.result,
            mode === 'reel' ? 'reel' : mode === 'story' ? 'story' : 'post'
          );
          setUploadedMedia(uploaded.url);
          setUploadedIsVideo(uploaded.mimeType.startsWith('video/') || isVid);
          setFormError('');
        } catch (err: any) {
          setFormError(err.message || 'Could not upload selected media file.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedTopic = topic.trim();
    const trimmedCaption = caption.trim();

    if (!trimmedTopic && !trimmedCaption) {
      setFormError('Please enter a topic or a caption before publishing.');
      return;
    }

    // Collect any inline @handles typed directly into the caption as well
    const inlineMatches = trimmedCaption.match(/@[a-zA-Z0-9_.]{2,24}/g) || [];
    const mergedTags = [...taggedPeople];
    for (const raw of inlineMatches) {
      const norm = normalizeHandle(raw);
      if (norm && !mergedTags.includes(norm)) {
        mergedTags.push(norm);
      }
    }

    if (mergedTags.length > MAX_TAGGED_PEOPLE) {
      setFormError(`You can tag a maximum of ${MAX_TAGGED_PEOPLE} people using @ (currently ${mergedTags.length}).`);
      return;
    }

    const finalLink = normalizeUrl(attachedLink);
    if (finalLink) {
      try {
        new URL(finalLink);
      } catch {
        setFormError('Please enter a valid link (for example, https://github.com/your-project).');
        return;
      }
    }

    setSubmitting(true);
    try {
      let mediaType: FeedPost['mediaType'] = 'none';
      const defaultVisual =
        mode === 'reel'
          ? 'images/teens/ai-coder.jpg'
          : mode === 'story'
          ? 'images/posts/hackathon-win.jpg'
          : '';

      const mediaMeta: Record<string, any> = {
        createType: mode,
        topic: trimmedTopic,
        taggedPeople: mergedTags,
        attachedLink: finalLink,
      };

      if (mode === 'reel') {
        mediaType = 'video_showcase';
        if (uploadedMedia) {
          if (uploadedIsVideo) mediaMeta.videoUrl = uploadedMedia;
          else mediaMeta.imageUrl = uploadedMedia;
        } else {
          mediaMeta.imageUrl = defaultVisual;
        }
      } else if (uploadedMedia) {
        if (uploadedIsVideo) {
          mediaType = 'video_showcase';
          mediaMeta.videoUrl = uploadedMedia;
        } else {
          mediaType = 'image';
          mediaMeta.imageUrl = uploadedMedia;
        }
      } else if (mode === 'story') {
        mediaType = 'image';
        mediaMeta.imageUrl = defaultVisual;
      }

      const derivedSkillTags = trimmedTopic
        ? [trimmedTopic.replace(/\s+/g, '')]
        : user.profile.skills.slice(0, 2);

      await onPublish({
        category: mode,
        title: trimmedTopic,
        content: trimmedCaption || trimmedTopic,
        mediaType,
        mediaMeta,
        skillTags: derivedSkillTags,
      });

      setTopic('');
      setCaption('');
      setTaggedPeople([]);
      setMentionInput('');
      setAttachedLink('');
      setUploadedMedia('');
      setUploadedIsVideo(false);
      setTagLimitNotice('');
      if (onCloseModal) onCloseModal();
    } finally {
      setSubmitting(false);
    }
  };

  const activeModeObj = CREATE_MODES.find((m) => m.id === mode)!;

  return (
    <motion.div
      layout
      transition={SPRINGS.morph}
      className={
        compactModal
          ? 'space-y-4'
          : 'ts-surface-elevated mx-auto max-w-2xl space-y-6 rounded-3xl p-4 sm:p-7'
      }
    >
      {/* Studio Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#27D9D0]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Create on TeenStack</span>
          </span>
          <h1 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
            Share a Story, Post, or Reel
          </h1>
        </div>
        {compactModal && onCloseModal && (
          <button
            type="button"
            aria-label="Close create modal"
            onClick={onCloseModal}
            className="rounded-xl border border-white/12 p-2 text-[#A5A9BC] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Step 1: 3 Morphing Options — Story | Post | Reel */}
      <div
        role="tablist"
        aria-label="Choose format: Story, Post, or Reel"
        className="grid grid-cols-3 gap-2.5"
      >
        {CREATE_MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setMode(m.id);
                setFormError('');
              }}
              className={`relative rounded-2xl border p-3 text-left transition-colors sm:p-3.5 ${
                active
                  ? 'border-[#743BFF] text-white'
                  : 'border-white/10 bg-[#080910]/65 text-[#A5A9BC] hover:text-white'
              }`}
            >
              {active && (
                <motion.div
                  layoutId={compactModal ? 'modal-create-3mode' : 'page-create-3mode'}
                  transition={SPRINGS.pill}
                  className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-[#743BFF]/35 via-[#258BFF]/20 to-[#27D9D0]/15"
                />
              )}
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#27D9D0]' : 'text-[#743BFF]'}`} />
                <span className="font-heading text-sm font-bold text-white sm:text-base">
                  {m.label}
                </span>
              </div>
              <div className="mt-1 hidden text-[11px] text-[#A5A9BC] sm:block">{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Step 2: Topic or Caption, @Tag People (max 10), Attach Link, and Media */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRINGS.morph}
            className="space-y-4"
          >
            {/* Optional Visual / Video Attachment */}
            <div className="rounded-2xl border border-white/10 bg-[#080910]/65 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  {mode === 'reel'
                    ? 'Reel Video or Cover Visual'
                    : mode === 'story'
                    ? 'Story Visual'
                    : 'Post Photo or Visual (Optional)'}
                </span>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#258BFF]/40 bg-[#258BFF]/12 px-3 py-1.5 text-xs font-semibold text-white hover:border-[#27D9D0]">
                  <Upload className="h-3.5 w-3.5 text-[#27D9D0]" />
                  <span>{mode === 'reel' ? 'Upload Video / Photo' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept={mode === 'reel' ? 'video/*,image/*' : 'image/*'}
                    onChange={handleMediaUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Quick sample presets */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] text-[#A5A9BC]">Quick presets:</span>
                {SAMPLE_VISUALS.map((preset) => {
                  const selected = uploadedMedia === preset.path;
                  return (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => {
                        setUploadedMedia(selected ? '' : preset.path);
                        setUploadedIsVideo(false);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selected
                          ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-[#27D9D0]'
                          : 'border-white/10 bg-[#111426] text-[#A5A9BC] hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {uploadedMedia && (
                <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/12 bg-black">
                  {uploadedIsVideo ? (
                    <video
                      src={uploadedMedia}
                      controls
                      playsInline
                      className="max-h-60 w-full object-contain"
                    />
                  ) : (
                    <img
                      src={assetUrl(uploadedMedia)}
                      alt="Selected preview"
                      className="max-h-56 w-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Remove media"
                    onClick={() => {
                      setUploadedMedia('');
                      setUploadedIsVideo(false);
                    }}
                    className="absolute top-2 right-2 rounded-lg bg-[#080910]/85 p-1.5 text-white hover:bg-[#080910]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Topic Field */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="create-topic"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white"
                >
                  <Hash className="h-3.5 w-3.5 text-[#743BFF]" />
                  <span>Topic</span>
                </label>
                <span className="text-[11px] text-[#A5A9BC]">Fill topic, caption, or both</span>
              </div>

              <input
                id="create-topic"
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder={
                  mode === 'story'
                    ? 'e.g. Late-night hackathon sprint'
                    : mode === 'reel'
                    ? 'e.g. 30s Demo: Autonomous Rover Telemetry'
                    : 'e.g. WebGL Shader Engine / Robotics'
                }
                className="w-full rounded-xl border border-white/14 bg-[#080910] px-4 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] focus:outline-none sm:text-sm"
              />

              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_TOPICS.map((item) => {
                  const isPicked = topic.toLowerCase() === item.toLowerCase();
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTopic(isPicked ? '' : item)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isPicked
                          ? 'border-[#743BFF] bg-[#743BFF]/20 text-white'
                          : 'border-white/10 bg-[#080910] text-[#A5A9BC] hover:text-white'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Caption Field (with live inline @mention autocomplete!) */}
            <div>
              <label
                htmlFor="create-caption"
                className="mb-1.5 block text-xs font-semibold text-white"
              >
                Caption
              </label>
              <textarea
                id="create-caption"
                rows={compactModal ? 3 : 4}
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder={`Write a caption for your ${mode}… (tip: type @username to mention someone)`}
                className="w-full rounded-xl border border-white/14 bg-[#080910] p-3.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] focus:outline-none sm:text-sm"
              />

              {/* Inline @mention suggestions while typing in Caption */}
              {inlineCaptionSuggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#258BFF]/30 bg-[#111426] p-2">
                  <span className="text-[11px] text-[#A5A9BC]">Mention:</span>
                  {inlineCaptionSuggestions.map((peer) => (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => handlePickInlineCaptionPeer(peer.handle)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-[#080910] px-2.5 py-1 text-xs font-semibold text-[#27D9D0] hover:border-[#27D9D0]"
                    >
                      <StudentAvatar
                        presetOrUrl={peer.avatarPreset}
                        name={peer.name}
                        size="xs"
                        className="!h-4 !w-4 !rounded-full"
                      />
                      <span>{peer.handle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag People with @ (Strict Max 10) */}
            <div className="rounded-2xl border border-white/12 bg-[#080910]/70 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="create-tag-people"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white"
                >
                  <AtSign className="h-3.5 w-3.5 text-[#27D9D0]" />
                  <span>Tag People (@)</span>
                </label>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    taggedPeople.length >= MAX_TAGGED_PEOPLE
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-[#258BFF]/15 text-[#27D9D0]'
                  }`}
                >
                  {taggedPeople.length} / {MAX_TAGGED_PEOPLE} tagged
                </span>
              </div>

              {/* Active Tagged Chips */}
              {taggedPeople.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {taggedPeople.map((handle) => (
                    <span
                      key={handle}
                      className="inline-flex items-center gap-1 rounded-full border border-[#27D9D0]/40 bg-[#27D9D0]/12 px-2.5 py-1 text-xs font-semibold text-[#27D9D0]"
                    >
                      <span>{handle}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${handle}`}
                        onClick={() => removeTaggedPerson(handle)}
                        className="rounded-full p-0.5 text-white/70 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* @ Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-bold text-[#27D9D0]">
                    @
                  </span>
                  <input
                    id="create-tag-people"
                    type="text"
                    disabled={taggedPeople.length >= MAX_TAGGED_PEOPLE}
                    value={mentionInput.replace(/^@+/, '')}
                    onChange={(e) => {
                      setMentionInput(e.target.value);
                      if (tagLimitNotice) setTagLimitNotice('');
                    }}
                    onKeyDown={handleMentionKeyDown}
                    placeholder={
                      taggedPeople.length >= MAX_TAGGED_PEOPLE
                        ? 'Max 10 people tagged'
                        : 'username (press Enter to tag)'
                    }
                    className="w-full rounded-xl border border-white/14 bg-[#080910] py-2.5 pr-3.5 pl-8 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#27D9D0] focus:outline-none disabled:cursor-not-allowed disabled:opacity-55 sm:text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={
                    taggedPeople.length >= MAX_TAGGED_PEOPLE || !mentionInput.replace(/^@+/, '').trim()
                  }
                  onClick={() => addTaggedPerson(mentionInput)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/14 bg-[#111426] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#27D9D0] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tag</span>
                </button>
              </div>

              {tagLimitNotice && (
                <p className="mt-2 text-xs font-medium text-amber-300">{tagLimitNotice}</p>
              )}

              {/* Quick Peer @ Suggestions */}
              {taggedPeople.length < MAX_TAGGED_PEOPLE && filteredPeers.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-[#A5A9BC]">Suggested:</span>
                  {filteredPeers.slice(0, 5).map((peer) => (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => addTaggedPerson(peer.handle)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#111426] px-2.5 py-1 text-[11px] font-medium text-white/90 hover:border-[#258BFF] hover:text-[#27D9D0]"
                    >
                      <StudentAvatar
                        presetOrUrl={peer.avatarPreset}
                        name={peer.name}
                        size="xs"
                        className="!h-4 !w-4 !rounded-full"
                      />
                      <span>{peer.handle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Attach a Link */}
            <div>
              <label
                htmlFor="create-attached-link"
                className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white"
              >
                <Link2 className="h-3.5 w-3.5 text-[#258BFF]" />
                <span>Attach a Link (Optional)</span>
              </label>
              <div className="relative">
                <input
                  id="create-attached-link"
                  type="text"
                  inputMode="url"
                  value={attachedLink}
                  onChange={(e) => {
                    setAttachedLink(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="https://github.com/your-project or portfolio link"
                  className="w-full rounded-xl border border-white/14 bg-[#080910] py-2.5 pr-9 pl-4 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#258BFF] focus:outline-none sm:text-sm"
                />
                {attachedLink.trim() && (
                  <ExternalLink className="pointer-events-none absolute top-1/2 right-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#27D9D0]" />
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-500/12 px-3.5 py-2.5 text-xs font-medium text-rose-200"
          >
            {formError}
          </div>
        )}

        <div className="flex items-center justify-end border-t border-white/10 pt-4">
          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#4D63FF] to-[#258BFF] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.75)] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>{submitting ? 'Sharing…' : `Share ${activeModeObj.label}`}</span>
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
