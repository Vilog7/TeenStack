import { motion } from 'motion/react';
import { SPRINGS } from '../../lib/tokens';

interface BrandLogoProps {
  layoutId?: string;
  compact?: boolean;
  onClick?: () => void;
}

export function BrandLogo({ layoutId = 'teenstack-brand-mark', compact = false, onClick }: BrandLogoProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="group inline-flex items-center gap-2.5 text-left focus:outline-none"
    >
      <motion.div
        layoutId={layoutId}
        transition={SPRINGS.morph}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#743BFF] via-[#4D63FF] to-[#258BFF] p-[1px] shadow-[0_0_24px_-4px_rgba(116,59,255,0.65)]"
      >
        <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-[#0B0E1D]">
          <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
            <path
              d="M7 11.5L16 6.5L25 11.5L16 16.5L7 11.5Z"
              fill="#743BFF"
            />
            <path
              d="M7 16.8L16 21.8L25 16.8"
              stroke="#258BFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M10 21.8L16 25.2L22 21.8"
              stroke="#27D9D0"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
      </motion.div>

      {!compact && (
        <div className="flex flex-col">
          <span className="font-heading text-lg font-bold tracking-tight text-white leading-none">
            Teen<span className="text-[#27D9D0]">Stack</span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#A5A9BC]">
            Student Network
          </span>
        </div>
      )}
    </Wrapper>
  );
}
