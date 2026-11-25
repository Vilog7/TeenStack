import { motion, useReducedMotion } from 'motion/react';
import type { AppRoute } from '../../types';
import { SPRINGS } from '../../lib/tokens';

interface OrbTransform {
  violetX: string;
  violetY: string;
  violetScale: number;
  blueX: string;
  blueY: string;
  blueScale: number;
  cyanX: string;
  cyanY: string;
  cyanOpacity: number;
}

// Compositor-only translate percentages (NEVER animate CSS left/top or heavy filter: blur!)
const ROUTE_ORB_TRANSFORMS: Record<AppRoute, OrbTransform> = {
  landing: {
    violetX: '-30vw',
    violetY: '-25vh',
    violetScale: 1.0,
    blueX: '30vw',
    blueY: '-20vh',
    blueScale: 1.0,
    cyanX: '0vw',
    cyanY: '28vh',
    cyanOpacity: 0.14,
  },
  login: {
    violetX: '-26vw',
    violetY: '-12vh',
    violetScale: 1.05,
    blueX: '24vw',
    blueY: '8vh',
    blueScale: 0.96,
    cyanX: '-18vw',
    cyanY: '24vh',
    cyanOpacity: 0.14,
  },
  signup: {
    violetX: '24vw',
    violetY: '-14vh',
    violetScale: 1.08,
    blueX: '-26vw',
    blueY: '10vh',
    blueScale: 1.0,
    cyanX: '18vw',
    cyanY: '26vh',
    cyanOpacity: 0.16,
  },
  onboarding: {
    violetX: '0vw',
    violetY: '-30vh',
    violetScale: 1.12,
    blueX: '32vw',
    blueY: '18vh',
    blueScale: 1.0,
    cyanX: '-30vw',
    cyanY: '20vh',
    cyanOpacity: 0.15,
  },
  home: {
    violetX: '-34vw',
    violetY: '-28vh',
    violetScale: 0.95,
    blueX: '34vw',
    blueY: '-24vh',
    blueScale: 0.92,
    cyanX: '10vw',
    cyanY: '34vh',
    cyanOpacity: 0.1,
  },
  posts: {
    violetX: '-16vw',
    violetY: '-34vh',
    violetScale: 1.02,
    blueX: '32vw',
    blueY: '0vh',
    blueScale: 0.98,
    cyanX: '-28vw',
    cyanY: '30vh',
    cyanOpacity: 0.13,
  },
  opportunities: {
    violetX: '26vw',
    violetY: '-30vh',
    violetScale: 1.05,
    blueX: '-28vw',
    blueY: '-6vh',
    blueScale: 1.02,
    cyanX: '8vw',
    cyanY: '28vh',
    cyanOpacity: 0.15,
  },
  chats: {
    violetX: '-28vw',
    violetY: '12vh',
    violetScale: 0.92,
    blueX: '28vw',
    blueY: '-24vh',
    blueScale: 1.02,
    cyanX: '-2vw',
    cyanY: '-6vh',
    cyanOpacity: 0.12,
  },
  create: {
    violetX: '0vw',
    violetY: '-20vh',
    violetScale: 1.15,
    blueX: '-22vw',
    blueY: '22vh',
    blueScale: 1.0,
    cyanX: '24vw',
    cyanY: '16vh',
    cyanOpacity: 0.17,
  },
  learn: {
    violetX: '-22vw',
    violetY: '-28vh',
    violetScale: 0.98,
    blueX: '22vw',
    blueY: '14vh',
    blueScale: 1.06,
    cyanX: '32vw',
    cyanY: '-26vh',
    cyanOpacity: 0.16,
  },
  profile: {
    violetX: '-6vw',
    violetY: '-32vh',
    violetScale: 1.1,
    blueX: '30vw',
    blueY: '6vh',
    blueScale: 0.96,
    cyanX: '-28vw',
    cyanY: '16vh',
    cyanOpacity: 0.14,
  },
};

interface AmbientBackgroundProps {
  route: AppRoute;
  paused?: boolean;
}

export function AmbientBackground({ route, paused = false }: AmbientBackgroundProps) {
  const prefersReduced = useReducedMotion();
  // LandingView manages its own dedicated stage & background layers
  if (route === 'landing') return null;

  const disableMotion = Boolean(prefersReduced || paused);
  const preset = ROUTE_ORB_TRANSFORMS[route] || ROUTE_ORB_TRANSFORMS.home;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#080910]"
    >
      {/* Static Semi-Transparent White Grid (Cached on compositor at 0ms/frame) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 85% 75% at 50% 35%, #000 35%, transparent 100%)',
        }}
      />

      {/* Zero-Blur Radial Gradient Light Orbs Animated ONLY via GPU Transform (x, y, scale, opacity) */}
      <motion.div
        animate={{
          x: preset.violetX,
          y: preset.violetY,
          scale: preset.violetScale,
        }}
        transition={disableMotion ? { duration: 0 } : SPRINGS.ambient}
        style={{
          willChange: 'transform',
          background:
            'radial-gradient(circle, rgba(116,59,255,0.24) 0%, rgba(116,59,255,0.08) 42%, rgba(116,59,255,0) 70%)',
        }}
        className="absolute top-1/2 left-1/2 -mt-[24rem] -ml-[24rem] h-[48rem] w-[48rem] rounded-full"
      />

      <motion.div
        animate={{
          x: preset.blueX,
          y: preset.blueY,
          scale: preset.blueScale,
        }}
        transition={disableMotion ? { duration: 0 } : SPRINGS.ambient}
        style={{
          willChange: 'transform',
          background:
            'radial-gradient(circle, rgba(37,139,255,0.2) 0%, rgba(37,139,255,0.06) 44%, rgba(37,139,255,0) 70%)',
        }}
        className="absolute top-1/2 left-1/2 -mt-[22rem] -ml-[22rem] h-[44rem] w-[44rem] rounded-full"
      />

      <motion.div
        animate={{
          x: preset.cyanX,
          y: preset.cyanY,
          opacity: preset.cyanOpacity,
        }}
        transition={disableMotion ? { duration: 0 } : SPRINGS.ambient}
        style={{
          willChange: 'transform, opacity',
          background:
            'radial-gradient(circle, rgba(39,217,208,0.85) 0%, rgba(39,217,208,0.22) 42%, rgba(39,217,208,0) 70%)',
        }}
        className="absolute top-1/2 left-1/2 -mt-[18rem] -ml-[18rem] h-[36rem] w-[36rem] rounded-full"
      />
    </div>
  );
}
