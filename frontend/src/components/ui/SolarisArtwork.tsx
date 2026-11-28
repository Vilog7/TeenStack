import { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { SPRINGS } from '../../lib/tokens';

interface SolarisArtworkProps {
  compact?: boolean;
  interactive?: boolean;
}

/**
 * Interactive procedural mountain + solar raymarcher preview inspired directly
 * by the twin peaks & glowing sun sketch in the PC/Laptop Posts wireframe.
 */
export function SolarisArtwork({ compact = false, interactive = true }: SolarisArtworkProps) {
  const [wireframe, setWireframe] = useState(false);
  const [sunHigh, setSunHigh] = useState(true);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080910] ${
        compact ? 'h-44 sm:h-52' : 'h-60 sm:h-72'
      }`}
    >
      {/* Atmospheric sky glow */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: sunHigh
            ? 'radial-gradient(circle at 52% 32%, rgba(116,59,255,0.42) 0%, rgba(37,139,255,0.22) 38%, rgba(8,9,16,0.96) 78%)'
            : 'radial-gradient(circle at 52% 54%, rgba(39,217,208,0.34) 0%, rgba(116,59,255,0.28) 42%, rgba(8,9,16,0.98) 80%)',
        }}
      />

      <svg
        viewBox="0 0 640 280"
        className="relative z-10 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Solaris procedural twin-peak mountain terrain and solar light simulation"
      >
        <defs>
          <linearGradient id="peakLeft" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#743BFF" stopOpacity={wireframe ? 0.16 : 0.72} />
            <stop offset="100%" stopColor="#111426" stopOpacity="0.96" />
          </linearGradient>
          <linearGradient id="peakRight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#258BFF" stopOpacity={wireframe ? 0.16 : 0.68} />
            <stop offset="100%" stopColor="#080910" stopOpacity="0.98" />
          </linearGradient>
          <linearGradient id="riverStream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27D9D0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#743BFF" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* Glowing Sun + Rays (honoring the sketch's sun between the two peaks) */}
        <motion.g
          animate={{ y: sunHigh ? 0 : 28 }}
          transition={SPRINGS.morph}
        >
          <circle cx="328" cy="78" r="44" fill="#27D9D0" fillOpacity="0.14" />
          <circle cx="328" cy="78" r="24" fill="#FFFFFF" fillOpacity="0.92" />
          <circle cx="328" cy="78" r="29" stroke="#27D9D0" strokeWidth="1.5" strokeDasharray="4 5" fill="none" />
        </motion.g>

        {/* Distant horizon grid */}
        <line x1="40" y1="218" x2="600" y2="218" stroke="#A5A9BC" strokeOpacity="0.2" strokeWidth="1" />

        {/* Left Mountain Peak */}
        <polygon
          points="78,220 205,74 322,220"
          fill="url(#peakLeft)"
          stroke={wireframe ? '#27D9D0' : '#743BFF'}
          strokeWidth={wireframe ? '1.8' : '1.2'}
        />
        {/* Left ridge facet */}
        <polyline
          points="205,74 226,148 186,220"
          fill="none"
          stroke="#27D9D0"
          strokeOpacity="0.55"
          strokeWidth="1.3"
        />

        {/* Right Mountain Peak */}
        <polygon
          points="296,220 434,82 566,220"
          fill="url(#peakRight)"
          stroke={wireframe ? '#27D9D0' : '#258BFF'}
          strokeWidth={wireframe ? '1.8' : '1.2'}
        />
        {/* Right ridge facet */}
        <polyline
          points="434,82 412,152 452,220"
          fill="none"
          stroke="#743BFF"
          strokeOpacity="0.65"
          strokeWidth="1.3"
        />

        {/* Winding valley light path between peaks (directly matching sketch!) */}
        <path
          d="M310,220 Q294,238 318,254 T302,280"
          fill="none"
          stroke="url(#riverStream)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M336,220 Q352,238 334,256 T348,280"
          fill="none"
          stroke="url(#riverStream)"
          strokeWidth="2"
          strokeOpacity="0.7"
          strokeLinecap="round"
        />
      </svg>

      {/* Top HUD Telemetry Pill */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full border border-white/12 bg-[#080910]/80 px-3 py-1 text-[11px] font-medium text-[#A5A9BC] backdrop-blur-md">
        <Sparkles className="h-3.5 w-3.5 text-[#27D9D0]" />
        <span>WebGPU · 60 FPS</span>
      </div>

      {/* Interactive Shader Controls */}
      {interactive && (
        <div
          className="absolute right-3 bottom-3 z-20 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setSunHigh((v) => !v)}
            className="rounded-lg border border-white/12 bg-[#111426]/90 px-2.5 py-1 text-[11px] font-medium text-white hover:border-[#27D9D0]/60"
          >
            {sunHigh ? 'Dusk Orbit' : 'Zenith Sun'}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            aria-pressed={wireframe}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
              wireframe
                ? 'border-[#27D9D0] bg-[#27D9D0]/15 text-[#27D9D0]'
                : 'border-white/12 bg-[#111426]/90 text-[#A5A9BC] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Mesh
          </button>
        </div>
      )}
    </div>
  );
}
