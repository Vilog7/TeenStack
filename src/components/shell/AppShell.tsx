import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Home,
  Search,
  Compass,
  BookOpen,
  Send,
  PlusSquare,
  LogOut,
} from 'lucide-react';
import { StudentAvatar } from '../ui/StudentAvatar';
import { CHAT_THREADS } from '../../data/catalog';
import { SPRINGS } from '../../lib/tokens';
import type { NavSection, UserAccount } from '../../types';

interface AppShellProps {
  activeSection: NavSection;
  user: UserAccount;
  unreadChatsCount: number;
  ambientPaused?: boolean;
  onToggleAmbient?: () => void;
  onNavigate: (section: NavSection) => void;
  onOpenQuickCreate: () => void;
  onOpenSearch: () => void;
  onQuickSelectThread: (threadId: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({
  activeSection,
  user,
  unreadChatsCount,
  onNavigate,
  onOpenSearch,
  onLogout,
  children,
}: AppShellProps) {
  const isExploreActive = activeSection === 'posts' || activeSection === 'opportunities';

  const desktopItems: {
    id: string;
    label: string;
    icon?: typeof Home;
    isAvatar?: boolean;
    active: boolean;
    badge?: number;
    onClick: () => void;
  }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      active: activeSection === 'home',
      onClick: () => onNavigate('home'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: Search,
      active: false,
      onClick: onOpenSearch,
    },
    {
      id: 'explore',
      label: 'Posts & Ads',
      icon: Compass,
      active: isExploreActive,
      onClick: () => onNavigate('posts'),
    },
    {
      id: 'learn',
      label: 'Learn',
      icon: BookOpen,
      active: activeSection === 'learn',
      onClick: () => onNavigate('learn'),
    },
    {
      id: 'inbox',
      label: 'Messages',
      icon: Send,
      active: activeSection === 'chats',
      badge: unreadChatsCount,
      onClick: () => onNavigate('chats'),
    },
    {
      id: 'create',
      label: 'Create',
      icon: PlusSquare,
      active: activeSection === 'create',
      onClick: () => onNavigate('create'),
    },
    {
      id: 'profile',
      label: 'Profile',
      isAvatar: true,
      active: activeSection === 'profile',
      onClick: () => onNavigate('profile'),
    },
  ];

  return (
    <div className="relative z-10 min-h-dvh bg-[#080910] text-white">
      {/* MOBILE THIN INSTAGRAM TOP BAR (< md) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080910]/96 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
        <div className="flex h-11 items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-heading text-[15px] font-bold uppercase tracking-[0.22em] text-white"
          >
            TEEN<span className="text-[#27D9D0]">STACK</span>
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Search"
              onClick={onOpenSearch}
              className="flex h-9 w-9 items-center justify-center text-white/90 active:scale-90"
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              type="button"
              aria-label="Direct messages inbox"
              onClick={() => onNavigate('chats')}
              className="relative flex h-9 w-9 items-center justify-center text-white/90 active:scale-90"
            >
              <Send className="h-5 w-5" />
              {unreadChatsCount > 0 && (
                <span className="absolute top-0.5 right-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#743BFF] px-1 text-[10px] font-bold text-white">
                  {unreadChatsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* DESKTOP THIN LEFT INSTAGRAM RAIL (>= md: 68px icon rail, xl: slim 212px rail) */}
      <aside
        aria-label="Primary navigation"
        className="fixed inset-y-0 left-0 z-30 hidden flex-col justify-between border-r border-white/10 bg-[#080910] px-2.5 py-5 md:flex md:w-[68px] xl:w-[212px] xl:px-3.5"
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex h-10 w-full items-center justify-center rounded-xl px-2 text-left xl:justify-start"
          >
            <span className="font-heading text-base font-bold uppercase tracking-[0.22em] text-white hidden xl:inline">
              TEEN<span className="text-[#27D9D0]">STACK</span>
            </span>
            <span className="font-heading text-base font-bold text-[#27D9D0] xl:hidden">
              TS
            </span>
          </button>

          {/* Thin Vertical Nav List */}
          <nav className="space-y-1">
            {desktopItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  title={item.label}
                  className={`group relative flex h-11 w-full items-center justify-center gap-3.5 rounded-xl px-3 text-sm transition-colors xl:justify-start ${
                    item.active
                      ? 'font-bold text-white'
                      : 'font-normal text-[#A5A9BC] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.active && (
                    <motion.span
                      layoutId="ig-rail-active"
                      transition={SPRINGS.pill}
                      className="absolute inset-0 -z-10 rounded-xl bg-white/[0.07]"
                    />
                  )}

                  {item.isAvatar ? (
                    <span
                      className={`rounded-full p-[1.5px] ${
                        item.active
                          ? 'bg-gradient-to-tr from-[#743BFF] to-[#27D9D0]'
                          : 'bg-transparent'
                      }`}
                    >
                      <StudentAvatar
                        presetOrUrl={user.profile.avatarUrl || user.profile.avatarPreset}
                        name={user.fullName}
                        size="xs"
                        className="!h-6 !w-6 !rounded-full"
                      />
                    </span>
                  ) : (
                    Icon && (
                      <div className="relative">
                        <Icon
                          strokeWidth={item.active ? 2.4 : 1.9}
                          className={`h-[22px] w-[22px] transition-transform group-hover:scale-105 ${
                            item.active ? 'text-white' : ''
                          }`}
                        />
                        {item.badge ? (
                          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#743BFF] px-1 text-[10px] font-bold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    )
                  )}

                  <span className="hidden truncate xl:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Subtle Sign Out */}
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          className="flex h-10 w-full items-center justify-center gap-3.5 rounded-xl px-3 text-xs font-medium text-[#A5A9BC] hover:bg-white/5 hover:text-white xl:justify-start"
        >
          <LogOut className="h-[19px] w-[19px]" />
          <span className="hidden xl:inline">Log out</span>
        </button>
      </aside>

      {/* MAIN CONTENT OFFSET BY THIN RAIL */}
      <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-0 md:pl-[68px] md:pb-10 md:pt-6 xl:pl-[212px]">
        <div
          className={`mx-auto max-w-[980px] ${
            activeSection === 'home' ? 'px-0 sm:px-4' : 'px-3 pt-3 sm:px-4 sm:pt-0'
          }`}
        >
          {children}
        </div>
      </main>

      {/* DESKTOP INSTAGRAM FLOATING "MESSAGES" PILL (Bottom-Right Corner) */}
      {activeSection !== 'chats' && (
        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('chats')}
          className="fixed right-6 bottom-5 z-30 hidden h-11 items-center gap-3 rounded-full border border-white/14 bg-[#111426]/95 px-4 shadow-[0_12px_34px_rgba(0,0,0,0.85)] backdrop-blur-md hover:border-[#743BFF]/50 lg:flex"
        >
          <div className="relative">
            <Send className="h-4 w-4 text-white" />
            {unreadChatsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-2 w-2 rounded-full bg-[#27D9D0]" />
            )}
          </div>
          <span className="font-heading text-xs font-bold text-white">Messages</span>
          <div className="flex -space-x-2 pl-1">
            {CHAT_THREADS.slice(0, 3).map((t) => (
              <StudentAvatar
                key={t.id}
                presetOrUrl={t.avatarPreset}
                name={t.name}
                size="xs"
                className="!h-6 !w-6 !rounded-full ring-2 ring-[#111426]"
              />
            ))}
          </div>
        </motion.button>
      )}

      {/* MOBILE ULTRA-THIN INSTAGRAM BOTTOM TAB BAR (< md, 46px flush icon bar) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#080910]/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex h-11 max-w-md items-center justify-around px-2">
          <button
            type="button"
            aria-label="Home"
            onClick={() => onNavigate('home')}
            className="flex h-10 w-12 items-center justify-center"
          >
            <Home
              strokeWidth={activeSection === 'home' ? 2.5 : 1.8}
              className={`h-[22px] w-[22px] ${
                activeSection === 'home' ? 'text-white' : 'text-[#A5A9BC]'
              }`}
            />
          </button>

          <button
            type="button"
            aria-label="Explore Posts and Ads"
            onClick={() => onNavigate('posts')}
            className="flex h-10 w-12 items-center justify-center"
          >
            <Compass
              strokeWidth={isExploreActive ? 2.5 : 1.8}
              className={`h-[22px] w-[22px] ${
                isExploreActive ? 'text-white' : 'text-[#A5A9BC]'
              }`}
            />
          </button>

          <button
            type="button"
            aria-label="Create"
            onClick={() => onNavigate('create')}
            className="flex h-10 w-12 items-center justify-center"
          >
            <PlusSquare
              strokeWidth={activeSection === 'create' ? 2.5 : 1.8}
              className={`h-[23px] w-[23px] ${
                activeSection === 'create' ? 'text-[#27D9D0]' : 'text-white'
              }`}
            />
          </button>

          <button
            type="button"
            aria-label="Learn"
            onClick={() => onNavigate('learn')}
            className="flex h-10 w-12 items-center justify-center"
          >
            <BookOpen
              strokeWidth={activeSection === 'learn' ? 2.5 : 1.8}
              className={`h-[22px] w-[22px] ${
                activeSection === 'learn' ? 'text-white' : 'text-[#A5A9BC]'
              }`}
            />
          </button>

          <button
            type="button"
            aria-label="Profile"
            onClick={() => onNavigate('profile')}
            className="flex h-10 w-12 items-center justify-center"
          >
            <span
              className={`rounded-full p-[1.5px] ${
                activeSection === 'profile'
                  ? 'bg-gradient-to-tr from-[#743BFF] to-[#27D9D0]'
                  : 'bg-transparent'
              }`}
            >
              <StudentAvatar
                presetOrUrl={user.profile.avatarUrl || user.profile.avatarPreset}
                name={user.fullName}
                size="xs"
                className="!h-6 !w-6 !rounded-full"
              />
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
