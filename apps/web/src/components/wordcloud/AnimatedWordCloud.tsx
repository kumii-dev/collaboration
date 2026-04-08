import { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WordEntry } from '../../lib/wordCloudApi';

interface Props {
  words: WordEntry[];
  /** Maximum number of words to render */
  maxWords?: number;
  /** Container height in pixels */
  height?: number;
}

/** Brand colour palette — matches the existing #7a8567 / #c5df96 theme */
const PALETTE = [
  '#7a8567',
  '#c5df96',
  '#5a6b47',
  '#a8c47a',
  '#6b7a55',
  '#4a5a38',
  '#b8d48a',
  '#8a9870',
  '#3d4f2e',
  '#d0e8a0',
];

/** Cheap seeded PRNG — gives deterministic position per word string */
function seededRand(seed: number, n: number): number {
  // Lehmer / Park-Miller
  const x = ((seed * 16807) % 2147483647);
  return (x % n);
}

function charSum(s: string): number {
  let v = 0;
  for (let i = 0; i < s.length; i++) v += s.charCodeAt(i) * (i + 1);
  return v;
}

function wordStyle(
  word: WordEntry,
  minCount: number,
  maxCount: number,
  index: number
): { fontSize: number; fontWeight: number; color: string; opacity: number } {
  const range = maxCount - minCount || 1;
  const ratio = (word.count - minCount) / range; // 0..1

  const fontSize   = Math.round(14 + ratio * 50);        // 14px – 64px
  const fontWeight = ratio > 0.65 ? 700 : ratio > 0.3 ? 600 : 400;
  const opacity    = 0.55 + ratio * 0.45;                // 0.55 – 1.0
  const color      = PALETTE[index % PALETTE.length];

  return { fontSize, fontWeight, color, opacity };
}

export default function AnimatedWordCloud({ words, maxWords = 80, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort by count desc, take top N
  const sorted = useMemo(
    () => [...words].sort((a, b) => b.count - a.count).slice(0, maxWords),
    [words, maxWords]
  );

  const minCount = sorted[sorted.length - 1]?.count ?? 0;
  const maxCount = sorted[0]?.count ?? 1;

  // Deterministic layout — positions are derived from the word string so they
  // never jump on re-render when only counts change
  const positioned = useMemo(
    () =>
      sorted.map((w) => {
        const seed = charSum(w.word);
        // left: 4% – 88%, top: 5% – 85%  (keeps text inside the container)
        const left = 4  + (seededRand(seed,       841) % 85);
        const top  = 5  + (seededRand(seed + 1,   813) % 81);
        return { ...w, left, top };
      }),
    [sorted]
  );

  if (words.length === 0) {
    return (
      <div
        className="d-flex align-items-center justify-content-center text-muted"
        style={{
          height,
          borderRadius: 12,
          background: '#f8f9fa',
          border: '2px dashed #dee2e6',
        }}
      >
        <div className="text-center p-4">
          <div style={{ fontSize: 44, marginBottom: 10 }}>☁️</div>
          <p className="mb-0" style={{ fontSize: 15 }}>
            No words yet — be the first to contribute!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'linear-gradient(135deg, #f8f9fa 0%, #f0f4ea 100%)',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #E5E5E3',
        userSelect: 'none',
      }}
    >
      <AnimatePresence>
        {positioned.map((w, i) => {
          const { fontSize, fontWeight, color, opacity } = wordStyle(
            w,
            minCount,
            maxCount,
            i
          );

          return (
            <motion.span
              key={w.word}
              title={`"${w.word}" — ${w.count} ${w.count === 1 ? 'vote' : 'votes'}`}
              initial={{ opacity: 0, scale: 0.35 }}
              animate={{ opacity, scale: 1 }}
              exit={{ opacity: 0, scale: 0.35 }}
              // Re-animate font-size when count changes (word grows in real-time)
              style={{
                position: 'absolute',
                left: `${w.left}%`,
                top: `${w.top}%`,
                transform: 'translate(-50%, -50%)',
                fontSize,
                fontWeight,
                color,
                lineHeight: 1.1,
                cursor: 'default',
                whiteSpace: 'nowrap',
              }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              {w.word}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
