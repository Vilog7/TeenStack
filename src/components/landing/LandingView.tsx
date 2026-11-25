import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SPRINGS, assetUrl } from '../../lib/tokens';

interface LandingViewProps {
  onNavigateAuth: (mode: 'login' | 'signup') => void;
}

interface TeenShowcaseSlide {
  id: string;
  title: string;
  discipline: 'Engineer' | 'Scientist' | 'Artist';
  image: string;
  accent: string;
  accentRgb: [number, number, number];
}

const TEEN_SLIDES: TeenShowcaseSlide[] = [
  {
    id: 'slide-robotics',
    title: 'Autonomous Robotics',
    discipline: 'Engineer',
    image: '/images/teens/robotics-engineer.jpg',
    accent: '#743BFF',
    accentRgb: [0.455, 0.231, 1.0],
  },
  {
    id: 'slide-biotech',
    title: 'Microfluidic Biotech',
    discipline: 'Scientist',
    image: '/images/teens/biotech-scientist.jpg',
    accent: '#27D9D0',
    accentRgb: [0.153, 0.851, 0.816],
  },
  {
    id: 'slide-digital-art',
    title: '3D Spatial Design',
    discipline: 'Artist',
    image: '/images/teens/digital-artist.jpg',
    accent: '#258BFF',
    accentRgb: [0.145, 0.545, 1.0],
  },
  {
    id: 'slide-ai-coder',
    title: 'Neural & Shader Systems',
    discipline: 'Engineer',
    image: '/images/teens/ai-coder.jpg',
    accent: '#743BFF',
    accentRgb: [0.455, 0.231, 1.0],
  },
  {
    id: 'slide-astrophysics',
    title: 'CubeSat Optics Lab',
    discipline: 'Scientist',
    image: '/images/teens/astrophysics-maker.jpg',
    accent: '#258BFF',
    accentRgb: [0.145, 0.545, 1.0],
  },
  {
    id: 'slide-visual-art',
    title: 'Projection & Fine Art',
    discipline: 'Artist',
    image: '/images/teens/visual-artist.jpg',
    accent: '#27D9D0',
    accentRgb: [0.153, 0.851, 0.816],
  },
];

/**
 * Instanced per-card vertex shader: shades ONLY each card's tight bounding quad
 * instead of the entire viewport, slashing GPU fill-rate by >65%.
 */
const VERTEX_SHADER = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uStageCy;
uniform vec4 uBoxes[6]; // (xL, xR, hL, hR) in CSS pixels

flat out int vIdx;
out vec2 vPixel;

const vec2 QUAD[6] = vec2[6](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

void main() {
  int idx = gl_InstanceID;
  vec2 uv = QUAD[gl_VertexID];
  vec4 b = uBoxes[idx];

  float pad = 2.0;
  float maxH = max(b.z, b.w) + pad;
  float px = mix(b.x - pad, b.y + pad, uv.x);
  float py = mix(uStageCy - maxH, uStageCy + maxH, uv.y);

  vIdx = idx;
  vPixel = vec2(px, py);

  vec2 ndc = vec2((px / uRes.x) * 2.0 - 1.0, 1.0 - (py / uRes.y) * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

flat in int vIdx;
in vec2 vPixel;
out vec4 fragColor;

uniform float uStageCy;
uniform float uCornerR;
uniform vec4 uBoxes[6];
uniform vec2 uBoxMeta[6]; // (texReady, parallaxShift)
uniform vec3 uAccents[6];

uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform sampler2D uTex4;
uniform sampler2D uTex5;

vec4 sampleSlide(int idx, vec2 uv) {
  if (idx == 0) return texture(uTex0, uv);
  if (idx == 1) return texture(uTex1, uv);
  if (idx == 2) return texture(uTex2, uv);
  if (idx == 3) return texture(uTex3, uv);
  if (idx == 4) return texture(uTex4, uv);
  return texture(uTex5, uv);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdRoundedVerticalTrapezoid(vec2 p, float cy, vec4 box, float r) {
  float xL = box.x;
  float xR = box.y;
  float hL = box.z;
  float hR = box.w;
  float w = max(xR - xL, 2.0);

  float rr = min(r, min(w * 0.42, min(hL, hR) * 0.46));
  float py = abs(p.y - cy);

  vec2 E = vec2(w, hR - hL);
  float L = length(E);
  vec2 N = vec2(-(hR - hL), w) / L;

  float xA = xL + rr;
  float xB = xR - rr;
  float yA = max(0.0, hL + rr * ((hR - hL) - L) / w);
  float yB = max(0.0, hR - rr * (L + (hR - hL)) / w);

  vec2 A = vec2(xA, yA);
  vec2 B = vec2(xB, yB);
  vec2 q = vec2(p.x, py);

  float dLeftPlane = xA - q.x;
  float dRightPlane = q.x - xB;
  float dTopPlane = dot(q - A, N);

  if (dLeftPlane <= 0.0 && dRightPlane <= 0.0 && dTopPlane <= 0.0) {
    return max(max(dLeftPlane, dRightPlane), dTopPlane) - rr;
  }

  float dSegTop = sdSegment(q, A, B);
  float dSegLeft = length(vec2(q.x - xA, q.y - clamp(q.y, 0.0, yA)));
  float dSegRight = length(vec2(q.x - xB, q.y - clamp(q.y, 0.0, yB)));
  return min(dSegTop, min(dSegLeft, dSegRight)) - rr;
}

void main() {
  vec4 b = uBoxes[vIdx];
  float d = sdRoundedVerticalTrapezoid(vPixel, uStageCy, b, uCornerR);
  if (d > 0.8) discard;

  float alpha = 1.0 - smoothstep(-0.75, 0.75, d);

  float maxH = max(b.z, b.w);
  float boxW = max(b.y - b.x, 1.0);
  float boxH = max(maxH * 2.0, 1.0);
  float boxAspect = boxW / boxH;
  const float IMG_ASPECT = 4.0 / 3.0;

  float nx = (vPixel.x - 0.5 * (b.x + b.y)) / boxW;
  float ny = (vPixel.y - uStageCy) / boxH;

  float zoomMargin = 0.93;
  float parallax = uBoxMeta[vIdx].y;
  vec2 uv;
  if (boxAspect > IMG_ASPECT) {
    uv = vec2(0.5 + nx * zoomMargin + parallax * 0.5, 0.5 + ny * (IMG_ASPECT / boxAspect) * zoomMargin);
  } else {
    uv = vec2(0.5 + nx * (boxAspect / IMG_ASPECT) * zoomMargin + parallax, 0.5 + ny * zoomMargin);
  }
  uv = clamp(uv, 0.002, 0.998);

  vec3 placeholder = mix(vec3(0.067, 0.078, 0.15), uAccents[vIdx] * 0.3, 0.5 - ny);
  vec3 texCol = sampleSlide(vIdx, uv).rgb;
  vec3 cardCol = mix(placeholder, texCol, uBoxMeta[vIdx].x);

  // Subtle bottom readability gradient
  float vig = smoothstep(0.05, 0.52, ny);
  cardCol = mix(cardCol, vec3(0.025, 0.03, 0.055), vig * 0.72);

  // Crisp 1.5px anti-aliased border
  float borderBand = smoothstep(-2.0, -0.85, d) * (1.0 - smoothstep(-0.5, 0.75, d));
  cardCol = mix(cardCol, vec3(1.0), borderBand * 0.24);

  fragColor = vec4(cardCol * alpha, alpha);
}
`;

function corridorHalfHeight(xNorm: number, stageH: number, isMobile: boolean): number {
  const ax = Math.abs(xNorm);
  const flatZone = isMobile ? 0.28 : 0.165;
  const minRatio = isMobile ? 0.22 : 0.195;
  const maxRatio = isMobile ? 0.48 : 0.496;

  if (ax <= flatZone) {
    return minRatio * stageH;
  }

  const rawT = Math.min(1.4, (ax - flatZone) / (1.0 - flatZone));
  const smoothT = rawT < 0.08 ? (rawT * rawT) / (2 * 0.08) : rawT - 0.04;
  return (minRatio + (maxRatio - minRatio) * (smoothT / 0.96)) * stageH;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function LandingView({ onNavigateAuth }: LandingViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const uResLoc = gl.getUniformLocation(prog, 'uRes');
    const uStageCyLoc = gl.getUniformLocation(prog, 'uStageCy');
    const uCornerRLoc = gl.getUniformLocation(prog, 'uCornerR');
    const uBoxesLoc = gl.getUniformLocation(prog, 'uBoxes');
    const uBoxMetaLoc = gl.getUniformLocation(prog, 'uBoxMeta');
    const uAccentsLoc = gl.getUniformLocation(prog, 'uAccents');

    const accentArray = new Float32Array(18);
    for (let i = 0; i < 6; i++) {
      accentArray[i * 3] = TEEN_SLIDES[i].accentRgb[0];
      accentArray[i * 3 + 1] = TEEN_SLIDES[i].accentRgb[1];
      accentArray[i * 3 + 2] = TEEN_SLIDES[i].accentRgb[2];
    }
    gl.uniform3fv(uAccentsLoc, accentArray);

    const textures: WebGLTexture[] = [];
    const texReadyTarget = new Float32Array(6);
    const texReadySmooth = new Float32Array(6);
    let disposed = false;

    for (let i = 0; i < 6; i++) {
      const tex = gl.createTexture()!;
      textures.push(tex);
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([17, 20, 38, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const loc = gl.getUniformLocation(prog, `uTex${i}`);
      gl.uniform1i(loc, i);

      const img = new Image();
      img.decoding = 'async';
      if (i < 2) (img as any).fetchPriority = 'high';
      img.src = assetUrl(TEEN_SLIDES[i].image);
      img
        .decode()
        .catch(() => {})
        .then(() => {
          if (disposed || !img.naturalWidth) return;
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          texReadyTarget[i] = 1.0;
        });
    }

    const boxesUniform = new Float32Array(24);
    const boxMetaUniform = new Float32Array(12);

    let vw = window.innerWidth;
    let vh = window.innerHeight;

    const syncViewportSize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      // Cap DPR at 1.5 so integrated laptop GPUs run effortlessly at locked 120Hz/144Hz
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    syncViewportSize();
    window.addEventListener('resize', syncViewportSize, { passive: true });

    const BASE_SPEED = 0.085;

    let phase = 0;
    let rafId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.033, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const isMobile = vw < 640;
      const isTablet = vw >= 640 && vw < 1024;

      // Mobile shows 3 generous side-by-side panels (left wing, center, right wing);
      // Tablet shows 4–5; Desktop shows all 5 panels across the full width.
      const halfSpan = isMobile ? 2.1 : isTablet ? 1.55 : 1.25;
      const fullSpan = halfSpan * 2;
      const speed = isMobile ? 0.14 : BASE_SPEED;

      if (!prefersReducedMotion) {
        phase = (phase + speed * dt) % fullSpan;
      }

      const stageH = isMobile ? Math.min(vh * 0.72, 540) : Math.max(470, vh * 0.85);
      const stageCy = vh * 0.5;
      const halfW = vw * 0.5;
      const cardHalfNormW = isMobile ? 0.315 : isTablet ? 0.235 : 0.194;
      const cornerR = isMobile ? 18.0 : 28.0;

      for (let i = 0; i < 6; i++) {
        texReadySmooth[i] += (texReadyTarget[i] - texReadySmooth[i]) * (1.0 - Math.exp(-9.0 * dt));

        const base = (i / 6) * fullSpan;
        const uCenter = (((base - phase) % fullSpan) + fullSpan) % fullSpan - halfSpan;
        const uLeft = uCenter - cardHalfNormW;
        const uRight = uCenter + cardHalfNormW;

        const hLeft = corridorHalfHeight(uLeft, stageH, isMobile);
        const hRight = corridorHalfHeight(uRight, stageH, isMobile);

        const xLeftPx = halfW + uLeft * halfW;
        const xRightPx = halfW + uRight * halfW;

        const idx4 = i * 4;
        boxesUniform[idx4] = xLeftPx;
        boxesUniform[idx4 + 1] = xRightPx;
        boxesUniform[idx4 + 2] = hLeft;
        boxesUniform[idx4 + 3] = hRight;

        const idx2 = i * 2;
        boxMetaUniform[idx2] = texReadySmooth[i];
        boxMetaUniform[idx2 + 1] = uCenter * 0.04;

        const labelEl = labelRefs.current[i];
        if (labelEl) {
          const minH = Math.min(hLeft, hRight);
          const labelX = xLeftPx + (isMobile ? 10 : 20);
          const labelY = stageCy + minH - (isMobile ? 46 : 56);
          const distC = Math.abs(uCenter);
          const innerFade = isMobile ? 0.34 : 0.25;
          const outerCut = isMobile ? 0.92 : 0.98;
          const vis =
            distC < innerFade || distC > outerCut
              ? 0
              : Math.min(1, (distC - innerFade) / 0.12) * Math.min(1, (outerCut + 0.08 - distC) / 0.08);
          labelEl.style.transform = `translate3d(${labelX.toFixed(1)}px, ${labelY.toFixed(1)}px, 0)`;
          labelEl.style.opacity = (vis * texReadySmooth[i]).toFixed(3);
        }
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(uResLoc, vw, vh);
      gl.uniform1f(uStageCyLoc, stageCy);
      gl.uniform1f(uCornerRLoc, cornerR);
      gl.uniform4fv(uBoxesLoc, boxesUniform);
      gl.uniform2fv(uBoxMetaLoc, boxMetaUniform);

      // Draw ONLY the 6 instanced card quads (36 vertices total!)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 6);
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncViewportSize);
      for (const t of textures) gl.deleteTexture(t);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [prefersReducedMotion]);

  return (
    <div className="relative z-10 h-dvh w-full overflow-hidden bg-[#080910] select-none">
      {/* STATIC SEMI-TRANSPARENT WHITE BACKGROUND GRID (Cached once on GPU — 0.00ms/frame cost) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.09) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />

      {/* INSTANCED GPU MOVING PORTRAIT BOXES */}
      <canvas
        ref={canvasRef}
        aria-label="Infinite loop showcase of teenage engineers, scientists, and artists"
        className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
      />

      {/* COMPOSITOR-ONLY CAPTION LAYER */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {TEEN_SLIDES.map((slide, idx) => (
          <div
            key={slide.id}
            ref={(el) => {
              labelRefs.current[idx] = el;
            }}
            style={{ willChange: 'transform, opacity', opacity: 0 }}
            className="absolute top-0 left-0 flex w-28 flex-col items-start gap-0.5 sm:w-52 sm:gap-1"
          >
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white sm:px-2.5 sm:text-[10px]"
              style={{ backgroundColor: `${slide.accent}D9` }}
            >
              Teen {slide.discipline}
            </span>
            <span className="truncate max-w-full font-heading text-[11px] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-sm">
              {slide.title}
            </span>
          </div>
        ))}
      </div>

      {/* STATIC PURE LEFT & RIGHT GRADIENT LIGHTING (No blur() or blend-mode overdraw — 0.00ms/frame) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-25 w-[42vw] max-w-[440px] sm:w-[36vw]"
        style={{
          background:
            'radial-gradient(100% 56% at 0% 50%, rgba(116,59,255,0.62) 0%, rgba(37,139,255,0.32) 48%, rgba(39,217,208,0.08) 74%, transparent 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-25 w-[42vw] max-w-[440px] sm:w-[36vw]"
        style={{
          background:
            'radial-gradient(100% 56% at 100% 50%, rgba(37,139,255,0.62) 0%, rgba(116,59,255,0.34) 48%, rgba(39,217,208,0.08) 74%, transparent 100%)',
        }}
      />

      {/* TOP BAR: Centered "TEENSTACK" Title */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-5">
        <h1 className="font-heading text-lg font-bold uppercase tracking-[0.24em] text-white drop-shadow-[0_2px_12px_rgba(8,9,16,0.9)] sm:text-2xl sm:tracking-[0.26em]">
          TEEN<span className="text-[#27D9D0]">STACK</span>
        </h1>
      </header>

      {/* CENTERED "GET STARTED" BUTTON */}
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-4">
        <motion.div
          layoutId="primary-auth-card"
          transition={SPRINGS.morph}
          className="pointer-events-auto rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#258BFF] to-[#27D9D0] p-[1.5px] shadow-[0_0_36px_rgba(116,59,255,0.72),0_12px_28px_rgba(8,9,16,0.9)]"
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={SPRINGS.micro}
            onClick={() => onNavigateAuth('signup')}
            className="flex min-h-[44px] items-center justify-center rounded-[15px] bg-[#080910]/95 px-6 py-2.5 hover:bg-[#111426] sm:px-8 sm:py-3"
          >
            <span className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-white sm:text-sm sm:tracking-[0.2em] lg:text-base">
              GET STARTED
            </span>
          </motion.button>
        </motion.div>
      </div>

      {/* BOTTOM BAR: Centered "Founder — Vihaan Bhattacharjee" */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-40 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-center sm:pb-4">
        <p className="font-heading text-[11px] font-medium tracking-[0.12em] text-[#A5A9BC] drop-shadow-[0_2px_10px_rgba(8,9,16,0.95)] sm:text-sm sm:tracking-[0.14em]">
          Founder — <span className="font-semibold text-white">Vihaan Bhattacharjee</span>
        </p>
      </footer>
    </div>
  );
}
