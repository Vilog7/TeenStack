import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Users,
  Code2,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { CHAT_THREADS } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { ChatMessage, ChatThread, UserAccount } from '../../types';

interface ChatsViewProps {
  user: UserAccount;
  threads?: ChatThread[];
  messages: ChatMessage[];
  activeThreadId: string;
  mobileShowConversation: boolean;
  onSelectThread: (threadId: string, openMobileConversation: boolean) => void;
  onBackToListMobile: () => void;
  onSendMessage: (threadId: string, text: string) => Promise<void>;
}

const QUICK_PROMPTS = [
  'Want to team up for the Teen AI Hackathon?',
  'Just pushed a commit—can you test the UI?',
  'Sharing my AP Physics / Shader notes!',
];

export function ChatsView({
  user,
  threads = CHAT_THREADS,
  messages,
  activeThreadId,
  mobileShowConversation,
  onSelectThread,
  onBackToListMobile,
  onSendMessage,
}: ChatsViewProps) {
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [sendError, setSendError] = useState('');

  const threadList = threads.length > 0 ? threads : CHAT_THREADS;
  const activeThread = threadList.find((t) => t.id === activeThreadId) || threadList[0];
  const threadMessages = messages.filter((m) => m.threadId === activeThread.id);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft.trim();
    setSendError('');
    try {
      await onSendMessage(activeThread.id, text);
      setDraft('');
      setPeerTyping(true);
      setTimeout(() => {
        setPeerTyping(false);
      }, 1400);
    } catch (err: any) {
      setSendError(err.message || 'Could not send message.');
    }
  };

  return (
    <div className="ts-surface-elevated overflow-hidden rounded-2xl sm:rounded-3xl">
      <div className="grid h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] min-h-[420px] grid-cols-1 md:h-[78dvh] lg:grid-cols-12">
        {/* LEFT PANE: CONVERSATION LIST */}
        <div
          className={`overflow-y-auto border-white/8 lg:col-span-4 lg:border-r ${
            mobileShowConversation ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="border-b border-white/8 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h1 className="font-heading text-lg font-bold text-white">Student Chats</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#27D9D0]/12 px-2.5 py-0.5 text-[10px] font-semibold text-[#27D9D0]">
                <ShieldCheck className="h-3 w-3" />
                Verified Peers
              </span>
            </div>
            <p className="mt-1 text-xs text-[#A5A9BC]">
              Collaborate on projects, hackathons & study groups safely.
            </p>
          </div>

          <div className="divide-y divide-white/6 p-2.5">
            {threadList.map((thread) => {
              const selected = thread.id === activeThread.id;
              const lastMsg = [...messages].reverse().find((m) => m.threadId === thread.id);

              return (
                <motion.button
                  layout
                  key={thread.id}
                  type="button"
                  onClick={() => onSelectThread(thread.id, true)}
                  className={`relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${
                    selected ? 'text-white' : 'text-[#A5A9BC] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="active-chat-row-bg"
                      transition={SPRINGS.pill}
                      className="absolute inset-0 -z-10 rounded-2xl border border-[#743BFF]/45 bg-[#743BFF]/20"
                    />
                  )}

                  <StudentAvatar
                    layoutId={`chat-avatar-${thread.id}`}
                    presetOrUrl={thread.avatarPreset}
                    name={thread.name}
                    size="md"
                    online={thread.online}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-heading text-sm font-bold text-white">
                        {thread.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {thread.unread > 0 && (
                          <span className="rounded-full bg-[#743BFF] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {thread.unread}
                          </span>
                        )}
                        {thread.isGroup && <Users className="h-3.5 w-3.5 shrink-0 text-[#258BFF]" />}
                      </div>
                    </div>
                    <div className="truncate text-[11px] text-[#27D9D0]">{thread.roleBadge}</div>
                    {lastMsg && (
                      <p className="mt-0.5 truncate text-xs text-[#A5A9BC]">{lastMsg.text}</p>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: ACTIVE CONVERSATION */}
        <div
          className={`h-full min-h-0 flex-col justify-between lg:col-span-8 ${
            mobileShowConversation ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Active Thread Header */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeThread.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={SPRINGS.morph}
              className="flex items-center justify-between gap-3 border-b border-white/8 bg-[#080910]/45 px-4 py-3.5 sm:px-6"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Back to chat list"
                  onClick={onBackToListMobile}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#111426] text-[#A5A9BC] hover:text-white lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <StudentAvatar
                  presetOrUrl={activeThread.avatarPreset}
                  name={activeThread.name}
                  size="sm"
                  online={activeThread.online}
                />
                <div>
                  <div className="font-heading text-sm font-bold text-white sm:text-base">
                    {activeThread.name}
                  </div>
                  <div className="text-xs text-[#27D9D0]">
                    {activeThread.online ? 'Active now' : 'Offline'} · {activeThread.roleBadge}
                  </div>
                </div>
              </div>

              <span className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-[#111426] px-3 py-1.5 text-[11px] text-[#A5A9BC] sm:inline-flex">
                <Code2 className="h-3.5 w-3.5 text-[#743BFF]" />
                Collab Room Ready
              </span>
            </motion.div>
          </AnimatePresence>

          {/* Teen Safety Notice */}
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-[#27D9D0]/20 bg-[#27D9D0]/8 px-3 py-2 text-[11px] text-[#A5A9BC] sm:mx-6">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#27D9D0]" />
            <span>Teen Safety Filter active: never share home addresses, passwords, or private banking info in chat.</span>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            {threadMessages.map((msg) => {
              const isMine = msg.senderId === user.id || msg.senderName === user.fullName;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={SPRINGS.morph}
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm ${
                      isMine
                        ? 'bg-gradient-to-r from-[#743BFF] to-[#258BFF] text-white shadow-[0_8px_20px_-6px_rgba(116,59,255,0.65)]'
                        : 'border border-white/10 bg-[#080910]/80 text-white'
                    }`}
                  >
                    {!isMine && (
                      <div className="mb-0.5 text-[10px] font-semibold text-[#27D9D0]">
                        {msg.senderName}
                      </div>
                    )}
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                </motion.div>
              );
            })}

            {peerTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#080910]/80 px-3.5 py-2 text-xs text-[#A5A9BC]"
              >
                <Sparkles className="h-3 w-3 text-[#27D9D0]" />
                <span>{activeThread.name.split(' ')[0]} is typing…</span>
              </motion.div>
            )}
          </div>

          {/* Quick Collab Chips + Message Input */}
          <div className="border-t border-white/8 bg-[#080910]/55 p-3.5 sm:p-4">
            {sendError && (
              <div
                role="alert"
                className="mb-2.5 rounded-xl border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs text-rose-200"
              >
                {sendError}
              </div>
            )}
            <div className="ts-snap-scroller mb-2.5 pb-1">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  onClick={() => setDraft(qp)}
                  className="shrink-0 rounded-full border border-white/10 bg-[#111426] px-3 py-1 text-[11px] text-[#A5A9BC] hover:border-[#743BFF]/50 hover:text-white"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                enterKeyHint="send"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${activeThread.name}…`}
                className="min-h-[42px] flex-1 rounded-full border border-white/14 bg-[#111426] px-4 py-2 text-base text-white placeholder:text-[#A5A9BC]/50 focus:border-[#743BFF] sm:text-sm"
              />
              <motion.button
                type="submit"
                whileTap={{ scale: 0.94 }}
                disabled={!draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-45 sm:text-sm"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span>
              </motion.button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
