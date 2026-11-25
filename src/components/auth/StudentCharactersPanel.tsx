import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { SPRINGS } from '../../lib/tokens';

interface StudentCharactersPanelProps {
  mode: 'login' | 'signup';
  passwordFocused?: boolean;
  passwordVisible?: boolean;
}

type LookMode = 'track' | 'peek' | 'shy';
type EyeState = 'open' | 'closed' | 'happy';

interface CreatureSpec {
  id: string;
  label: string;
  bodyPath: string;
  fill: string;
  stroke: string;
  eyes: [number, number][];
  eyeR: number;
  pupilR: number;
  pupilColor: string;
  bubble: [number, number];
  decor?: ReactNode; // moves with body
  face?: ReactNode; // moves with head (drawn behind eyes)
}

const POKE_LINES = ['Hi!', 'Hey!', 'Hehe', "Let's build!", 'Boop!', 'Yo!'];

const CREATURES: CreatureSpec[] = [
  {
    id: 'violet',
    label: 'Violet student character',
    bodyPath: 'M126 94 C126 56, 198 56, 198 94 L198 214 L126 214 Z',
    fill: 'url(#charTallViolet)',
    stroke: '#A985FF',
    eyes: [
      [151, 95],
      [173, 95],
    ],
    eyeR: 8.5,
    pupilR: 3.8,
    pupilColor: '#080910',
    bubble: [162, 44],
    face: (
      <>
        <path d="M124 92 C124 52, 200 52, 200 92" fill="none" stroke="#27D9D0" strokeWidth="3" strokeLinecap="round" />
        <rect x="119" y="86" width="7" height="18" rx="3.5" fill="#27D9D0" />
        <rect x="198" y="86" width="7" height="18" rx="3.5" fill="#27D9D0" />
      </>
    ),
  },
  {
    id: 'blue',
    label: 'Blue student character',
    bodyPath: 'M78 130 C78 98, 140 98, 140 130 L140 214 L78 214 Z',
    fill: 'url(#charLeftBlue)',
    stroke: '#7EC0FF',
    eyes: [
      [99, 132],
      [119, 132],
    ],
    eyeR: 7.5,
    pupilR: 3.4,
    pupilColor: '#080910',
    bubble: [109, 88],
    face: <path d="M103 149 Q109 154 115 149" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" fill="none" />,
  },
  {
    id: 'cyan',
    label: 'Cyan student character',
    bodyPath: 'M204 122 C204 90, 268 90, 268 122 L268 214 L204 214 Z',
    fill: 'url(#charRightCyan)',
    stroke: '#9FF7F2',
    eyes: [
      [225, 124],
      [246, 124],
    ],
    eyeR: 7.5,
    pupilR: 3.4,
    pupilColor: '#080910',
    bubble: [236, 60],
    decor: (
      <>
        <line x1="236" y1="90" x2="236" y2="76" stroke="#27D9D0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="236" cy="73" r="4" fill="#743BFF" stroke="#27D9D0" strokeWidth="1.5" />
      </>
    ),
  },
  {
    id: 'front',
    label: 'Front student builder character',
    bodyPath: 'M140 162 C140 132, 218 132, 218 162 L218 214 L140 214 Z',
    fill: 'url(#charFrontBuilder)',
    stroke: '#743BFF',
    eyes: [
      [169, 163],
      [189, 163],
    ],
    eyeR: 6.2,
    pupilR: 2.7,
    pupilColor: '#743BFF',
    bubble: [179, 124],
    decor: (
      <>
        <rect x="163" y="186" width="32" height="18" rx="4" fill="#258BFF" fillOpacity="0.22" stroke="#27D9D0" strokeOpacity="0.6" />
        <circle cx="179" cy="195" r="2.3" fill="#27D9D0" />
      </>
    ),
    face: <rect x="154" y="152" width="50" height="22" rx="11" fill="#080910" stroke="#258BFF" strokeOpacity="0.5" />,
  },
];

function getPeekTarget(): { x: number; y: number } | null {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el || el.tagName !== 'INPUT') return null;
  const r = el.getBoundingClientRect();
  const caret = el.selectionStart ?? el.value.length;
  return {
    x: r.left + 16 + Math.min(Math.max(0, r.width - 56), caret * 8.4),
    y: r.top + r.height / 2,
  };
}

interface CreatureProps {
  spec: CreatureSpec;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  lookMode: LookMode;
  attentionId: string | null;
  getAnchor: (id: string) => SVGCircleElement | null;
  registerAnchor: (id: string, el: SVGCircleElement | null) => void;
  onPoke: (id: string) => void;
}

function Creature({
  spec,
  pointerX,
  pointerY,
  lookMode,
  attentionId,
  getAnchor,
  registerAnchor,
  onPoke,
}: CreatureProps) {
  const anchorRef = useRef<SVGCircleElement | null>(null);
  const [blinking, setBlinking] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [bubbleText, setBubbleText] = useState('');

  const pupilXTarget = useMotionValue(0);
  const pupilYTarget = useMotionValue(0);
  const leanTarget = useMotionValue(0);

  const pupilX = useSpring(pupilXTarget, { stiffness: 320, damping: 24, mass: 0.4 });
  const pupilY = useSpring(pupilYTarget, { stiffness: 320, damping: 24, mass: 0.4 });
  // Slightly under-damped so the body sways naturally while its base stays planted
  const lean = useSpring(leanTarget, { stiffness: 150, damping: 13, mass: 0.9 });
  const headX = useTransform(lean, [-12, 12], [3, -3]);

  // Idle blinking
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        setBlinking(true);
        timeout = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 130);
      }, 2400 + Math.random() * 3600);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  // Gaze + body lean
  useEffect(() => {
    let raf = 0;
    const maxPupil = spec.eyeR - spec.pupilR - 0.8;

    const update = () => {
      raf = 0;
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      let tx = pointerX.get();
      let ty = pointerY.get();

      if (lookMode === 'peek' || lookMode === 'shy') {
        const t = getPeekTarget();
        if (t) {
          tx = t.x;
          ty = t.y;
        }
      } else if (attentionId && attentionId !== spec.id) {
        const other = getAnchor(attentionId);
        if (other) {
          const o = other.getBoundingClientRect();
          tx = o.left + o.width / 2;
          ty = o.top + o.height / 2;
        }
      }

      const dx = tx - cx;
      const dy = ty - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const horizontal = Math.max(-1, Math.min(1, dx / 520));

      if (lookMode === 'shy') {
        // Eyes shut, turning politely away from the hidden password
        pupilXTarget.set(0);
        pupilYTarget.set(maxPupil * 0.5);
        leanTarget.set(horizontal * 7);
        return;
      }

      const reach = Math.min(1, dist / 200);
      pupilXTarget.set((dx / dist) * maxPupil * reach);
      pupilYTarget.set((dy / dist) * maxPupil * reach);
      leanTarget.set(-horizontal * (lookMode === 'peek' ? 12 : 9));
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    schedule();
    const offX = pointerX.on('change', schedule);
    const offY = pointerY.on('change', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('input', schedule, true);

    return () => {
      cancelAnimationFrame(raf);
      offX();
      offY();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('input', schedule, true);
    };
  }, [lookMode, attentionId, spec, pointerX, pointerY, getAnchor, pupilXTarget, pupilYTarget, leanTarget]);

  const poke = () => {
    if (reacting) return;
    setBubbleText(POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]);
    setReacting(true);
    onPoke(spec.id);
    setTimeout(() => setReacting(false), 900);
  };

  const eyeState: EyeState = reacting
    ? 'happy'
    : lookMode === 'shy' || blinking
    ? 'closed'
    : 'open';

  const eyeMidX = (spec.eyes[0][0] + spec.eyes[1][0]) / 2;
  const eyeMidY = spec.eyes[0][1];

  return (
    <>
      {/* Static gaze anchor (outside the moving body to avoid feedback) */}
      <circle
        ref={(el) => {
          anchorRef.current = el;
          registerAnchor(spec.id, el);
        }}
        cx={eyeMidX}
        cy={eyeMidY}
        r={0.5}
        fill="transparent"
      />

      <motion.g style={{ skewX: lean, originX: 0.5, originY: 1 }}>
        <motion.g
          role="button"
          tabIndex={0}
          aria-label={`Poke the ${spec.label}`}
          onClick={poke}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              poke();
            }
          }}
          animate={
            reacting
              ? {
                  y: [0, -22, 0, -7, 0],
                  scaleX: [1, 0.93, 1.09, 0.98, 1],
                  scaleY: [1, 1.08, 0.9, 1.03, 1],
                }
              : { y: 0, scaleX: 1, scaleY: 1 }
          }
          transition={{ duration: 0.75, ease: 'easeOut' }}
          style={{ originX: 0.5, originY: 1, cursor: 'pointer', outline: 'none' }}
        >
          <path d={spec.bodyPath} fill={spec.fill} stroke={spec.stroke} strokeOpacity="0.45" strokeWidth="1.5" />
          {spec.decor}

          <motion.g style={{ x: headX }}>
            {spec.face}
            {spec.eyes.map(([ex, ey]) =>
              eyeState === 'happy' ? (
                <path
                  key={`${ex}-${ey}`}
                  d={`M${ex - spec.eyeR * 0.8} ${ey + 2} Q${ex} ${ey - spec.eyeR} ${ex + spec.eyeR * 0.8} ${ey + 2}`}
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : (
                <motion.g
                  key={`${ex}-${ey}`}
                  animate={{ scaleY: eyeState === 'closed' ? 0.1 : 1 }}
                  transition={{ duration: 0.11, ease: 'easeOut' }}
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <circle cx={ex} cy={ey} r={spec.eyeR} fill="#FFFFFF" />
                  <motion.circle cx={ex} cy={ey} r={spec.pupilR} fill={spec.pupilColor} style={{ x: pupilX, y: pupilY }} />
                </motion.g>
              )
            )}
          </motion.g>
        </motion.g>

        <AnimatePresence>
          {reacting && (
            <motion.g
              key="bubble"
              initial={{ opacity: 0, scale: 0.4, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -4 }}
              transition={SPRINGS.micro}
              style={{ originX: 0.5, originY: 1 }}
              pointerEvents="none"
            >
              <rect
                x={spec.bubble[0] - 30}
                y={spec.bubble[1] - 22}
                width="60"
                height="20"
                rx="10"
                fill="#111426"
                stroke="#27D9D0"
                strokeOpacity="0.7"
              />
              <text
                x={spec.bubble[0]}
                y={spec.bubble[1] - 8.5}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="700"
                fontFamily="Space Grotesk, sans-serif"
              >
                {bubbleText}
              </text>
            </motion.g>
          )}
        </AnimatePresence>
      </motion.g>
    </>
  );
}

/**
 * Interactive student characters (Sketch 2):
 * - Eyes follow the cursor anywhere on the page; bodies sway toward it while staying planted.
 * - Password visible -> they lean in and read along the caret.
 * - Password hidden -> they close their eyes and turn away.
 * - Click / tap / Enter on a character -> it hops, smiles, says hi, and the others glance at it.
 */
export function StudentCharactersPanel({
  mode,
  passwordFocused = false,
  passwordVisible = false,
}: StudentCharactersPanelProps) {
  const pointerX = useMotionValue(typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const pointerY = useMotionValue(typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
  const anchors = useRef<Record<string, SVGCircleElement | null>>({});
  const [attentionId, setAttentionId] = useState<string | null>(null);
  const attentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerX.set(e.clientX);
      pointerY.set(e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) {
        pointerX.set(t.clientX);
        pointerY.set(t.clientY);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('touchmove', onTouch);
      if (attentionTimer.current) clearTimeout(attentionTimer.current);
    };
  }, [pointerX, pointerY]);

  const registerAnchor = useCallback((id: string, el: SVGCircleElement | null) => {
    anchors.current[id] = el;
  }, []);

  const getAnchor = useCallback((id: string) => anchors.current[id] || null, []);

  const handlePoke = useCallback((id: string) => {
    setAttentionId(id);
    if (attentionTimer.current) clearTimeout(attentionTimer.current);
    attentionTimer.current = setTimeout(() => setAttentionId(null), 1100);
  }, []);

  const lookMode: LookMode = passwordFocused ? (passwordVisible ? 'peek' : 'shy') : 'track';

  return (
    <motion.div
      layout
      layoutId="auth-illustration-panel"
      transition={SPRINGS.morph}
      className="relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0E1F] p-3.5 sm:p-6 lg:min-h-[500px] lg:p-8"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 45%, rgba(116, 59, 255, 0.26) 0%, rgba(37, 139, 255, 0.12) 45%, rgba(11, 14, 31, 0.98) 85%)',
      }}
    >
      <motion.div layout="position" className="relative z-10 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#743BFF]/40 bg-[#743BFF]/15 px-2.5 py-0.5 text-[11px] font-medium text-white sm:px-3 sm:py-1 sm:text-xs">
          <Sparkles className="h-3 w-3 text-[#27D9D0] sm:h-3.5 sm:w-3.5" />
          {mode === 'login' ? 'Welcome Back, Builder' : 'Join 14,000+ Teen Creators'}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#27D9D0] sm:text-[11px]">
          <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span className="hidden xs:inline sm:inline">Teen-Safe</span> Verified
        </span>
      </motion.div>

      <div className="relative z-10 flex flex-1 items-center justify-center py-1 sm:py-4">
        <svg
          viewBox="30 30 300 205"
          className="h-32 w-full max-w-[280px] touch-manipulation overflow-visible drop-shadow-[0_14px_26px_rgba(116,59,255,0.28)] sm:h-44 sm:max-w-[360px] lg:h-auto lg:max-w-[420px]"
          role="group"
          aria-label="Interactive TeenStack student characters — tap one to say hi"
        >
          <defs>
            <linearGradient id="charTallViolet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8957FF" />
              <stop offset="100%" stopColor="#4B21B8" />
            </linearGradient>
            <linearGradient id="charLeftBlue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#258BFF" />
              <stop offset="100%" stopColor="#16499E" />
            </linearGradient>
            <linearGradient id="charRightCyan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#27D9D0" />
              <stop offset="100%" stopColor="#127380" />
            </linearGradient>
            <linearGradient id="charFrontBuilder" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1C2242" />
              <stop offset="100%" stopColor="#111426" />
            </linearGradient>
          </defs>

          <ellipse cx="180" cy="150" rx="122" ry="74" fill="#743BFF" fillOpacity="0.12" />

          {/* Floating skill chips */}
          <rect x="44" y="42" width="34" height="24" rx="8" fill="#111426" stroke="#743BFF" strokeOpacity="0.6" />
          <text x="61" y="58" textAnchor="middle" fill="#27D9D0" fontSize="10" fontFamily="monospace">
            &lt;/&gt;
          </text>
          <rect x="278" y="48" width="38" height="24" rx="8" fill="#111426" stroke="#258BFF" strokeOpacity="0.6" />
          <circle cx="291" cy="60" r="3.5" fill="#27D9D0" />
          <line x1="298" y1="60" x2="309" y2="60" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />

          {CREATURES.map((spec) => (
            <Creature
              key={spec.id}
              spec={spec}
              pointerX={pointerX}
              pointerY={pointerY}
              lookMode={lookMode}
              attentionId={attentionId}
              getAnchor={getAnchor}
              registerAnchor={registerAnchor}
              onPoke={handlePoke}
            />
          ))}

          {/* Ground line */}
          <line x1="42" y1="214" x2="318" y2="214" stroke="#A5A9BC" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="96" y1="222" x2="264" y2="222" stroke="#743BFF" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </motion.div>
  );
}
