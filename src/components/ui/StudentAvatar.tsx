import { motion } from 'motion/react';
import { AVATAR_PRESETS, SPRINGS, assetUrl } from '../../lib/tokens';

interface StudentAvatarProps {
  presetOrUrl?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  layoutId?: string;
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
};

export function StudentAvatar({
  presetOrUrl = 'violet-coder',
  name = 'Student',
  size = 'md',
  online,
  layoutId,
  className = '',
}: StudentAvatarProps) {
  const preset = AVATAR_PRESETS[presetOrUrl];
  const resolvedSrc = preset
    ? assetUrl(preset.image)
    : presetOrUrl.startsWith('data:') || presetOrUrl.startsWith('http') || presetOrUrl.includes('/')
    ? assetUrl(presetOrUrl)
    : assetUrl(AVATAR_PRESETS['violet-coder'].image);

  return (
    <motion.div
      layoutId={layoutId}
      transition={SPRINGS.morph}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111426] select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={resolvedSrc}
        alt={name}
        loading="lazy"
        decoding="async"
        className="h-full w-full rounded-[inherit] object-cover object-center"
      />

      {online !== undefined && (
        <span
          aria-label={online ? 'Online' : 'Offline'}
          className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-[#080910] ${
            online ? 'bg-[#27D9D0]' : 'bg-[#A5A9BC]/45'
          }`}
        />
      )}
    </motion.div>
  );
}
