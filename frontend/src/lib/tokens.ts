// Centralized Design Tokens, Asset URL Helper & Real Photographic Avatar Presets

export function assetUrl(relPath: string): string {
  if (!relPath) return '';
  if (
    relPath.startsWith('data:') ||
    relPath.startsWith('http://') ||
    relPath.startsWith('https://') ||
    relPath.startsWith('blob:') ||
    relPath.startsWith('/uploads/')
  ) {
    return relPath;
  }
  const base = import.meta.env.BASE_URL || './';
  const cleanRel = relPath.replace(/^\/+/, '');
  return `${base.endsWith('/') ? base : `${base}/`}${cleanRel}`;
}

export const COLORS = {
  bgPrimary: '#080910',
  bgSecondary: '#111426',
  bgElevated: '#161A33',
  accentViolet: '#743BFF',
  accentBlue: '#258BFF',
  accentCyan: '#27D9D0',
  textPrimary: '#FFFFFF',
  textSecondary: '#A5A9BC',
} as const;

export const SPRINGS = {
  morph: {
    type: 'spring' as const,
    stiffness: 380,
    damping: 36,
    mass: 0.72,
  },
  pill: {
    type: 'spring' as const,
    stiffness: 480,
    damping: 38,
    mass: 0.62,
  },
  modal: {
    type: 'spring' as const,
    stiffness: 410,
    damping: 36,
    mass: 0.68,
  },
  ambient: {
    type: 'spring' as const,
    stiffness: 70,
    damping: 24,
    mass: 1.1,
  },
  micro: {
    type: 'spring' as const,
    stiffness: 560,
    damping: 36,
  },
} as const;

export const AVATAR_PRESETS: Record<
  string,
  { label: string; image: string; ring: string; primary: string }
> = {
  'violet-coder': {
    label: 'Campus Builder',
    image: 'images/avatars/arav.jpg',
    ring: '#743BFF',
    primary: '#743BFF',
  },
  'cyan-creator': {
    label: 'Design Studio',
    image: 'images/avatars/maya.jpg',
    ring: '#27D9D0',
    primary: '#27D9D0',
  },
  'blue-builder': {
    label: 'Engineering Lab',
    image: 'images/avatars/rohan.jpg',
    ring: '#258BFF',
    primary: '#258BFF',
  },
  'amber-innovator': {
    label: 'STEM Researcher',
    image: 'images/avatars/zara.jpg',
    ring: '#27D9D0',
    primary: '#9D6BFF',
  },
  'emerald-scholar': {
    label: 'Systems Hacker',
    image: 'images/teens/ai-coder.jpg',
    ring: '#258BFF',
    primary: '#27D9D0',
  },
  'visual-creator': {
    label: 'Creative Artist',
    image: 'images/teens/visual-artist.jpg',
    ring: '#743BFF',
    primary: '#743BFF',
  },
};
