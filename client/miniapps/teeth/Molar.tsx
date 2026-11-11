import { cn } from '@miniapp/sdk';
import type { Mood } from './logic';

const TOOTH =
  'M30 14C18 14 10 24 12 38C14 52 20 57 22 71C24 85 28 93 34 93C40 93 41 78 44 70C46 65 54 65 56 70C59 78 60 93 66 93C72 93 76 85 78 71C80 57 86 52 88 38C90 24 82 14 70 14C62 14 58 18 50 18C42 18 38 14 30 14Z';

/** Molar, the tooth: its face says how things are going. */
export function Molar({ mood, className }: { mood: Mood; className?: string }) {
  const mad = mood === 'angry' || mood === 'furious';
  const fill = mood === 'furious' ? '#ffd2cc' : mood === 'angry' ? '#ffe4de' : '#f7fafc';
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn(mad && 'molar-shake', className)}
      role="img"
      aria-label={`Molar looks ${mood}`}
    >
      <style>{`
        @keyframes molar-shake { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-4deg) } 40% { transform: rotate(4deg) } 60% { transform: rotate(-3deg) } 80% { transform: rotate(2deg) } }
        .molar-shake { transform-origin: 50% 90%; animation: molar-shake 0.6s ease-in-out 0.2s 2; }
        @media (prefers-reduced-motion: reduce) { .molar-shake { animation: none; } }
      `}</style>
      {mood === 'happy' && (
        <g fill="#ffd36e">
          <path d="M88 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M12 60l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" />
        </g>
      )}
      <path d={TOOTH} fill={fill} stroke="#9fb0c8" strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d="M24 26c4-5 9-6 13-5"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* eyes */}
      {mood === 'happy' ? (
        <g stroke="#2a3446" strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M34 42q4-5 8 0" />
          <path d="M58 42q4-5 8 0" />
        </g>
      ) : mood === 'annoyed' ? (
        <g stroke="#2a3446" strokeWidth="3.2" strokeLinecap="round">
          <path d="M33 41h9" />
          <path d="M58 41h9" />
        </g>
      ) : (
        <g fill="#2a3446">
          <circle cx="38" cy="41" r={mad ? 3.6 : 3.8} />
          <circle cx="62" cy="41" r={mad ? 3.6 : 3.8} />
        </g>
      )}
      {/* brows */}
      {mad && (
        <g stroke="#2a3446" strokeWidth="3.4" strokeLinecap="round">
          <path d={mood === 'furious' ? 'M31 30l12 6' : 'M32 32l10 4'} />
          <path d={mood === 'furious' ? 'M69 30l-12 6' : 'M68 32l-10 4'} />
        </g>
      )}
      {mood === 'waiting' && (
        <g stroke="#2a3446" strokeWidth="2.6" strokeLinecap="round">
          <path d="M33 33l9-1" />
          <path d="M58 32l9 1" />
        </g>
      )}
      {/* cheeks */}
      {(mood === 'happy' || mood === 'hello' || mood === 'content') && (
        <g fill="#ff9fb2" opacity="0.55">
          <ellipse cx="30" cy="50" rx="5" ry="3" />
          <ellipse cx="70" cy="50" rx="5" ry="3" />
        </g>
      )}
      {/* mouth */}
      <g stroke="#2a3446" strokeWidth="3.2" strokeLinecap="round" fill="none">
        {mood === 'happy' && <path d="M38 52q12 12 24 0" fill="#c94f63" stroke="#2a3446" />}
        {(mood === 'hello' || mood === 'content') && <path d="M41 53q9 7 18 0" />}
        {mood === 'waiting' && <path d="M43 55h14" />}
        {mood === 'annoyed' && <path d="M42 56q8-3 16 0" />}
        {mood === 'angry' && <path d="M40 58q10-9 20 0" />}
        {mood === 'furious' && <path d="M39 59q11-11 22 0" fill="#5a2230" />}
      </g>
      {mood === 'furious' && (
        <g fill="#e05252" fontWeight="700" fontSize="16" fontFamily="system-ui, sans-serif">
          <text x="80" y="22">
            !
          </text>
          <text x="87" y="16">
            !
          </text>
        </g>
      )}
    </svg>
  );
}

/** The app icon's picture: a tooth outline (drawn in the icon's colour). */
export function ToothGlyph({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: string | number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M7.5 3.5C5 3.5 3.6 5.6 4 8.4c.4 2.8 1.6 4 2 7 .3 2.6 1 4.6 2.2 4.6 1.3 0 1.4-3.4 2.1-5 .5-1 2.9-1 3.4 0 .7 1.6.8 5 2.1 5 1.2 0 1.9-2 2.2-4.6.4-3 1.6-4.2 2-7 .4-2.8-1-4.9-3.5-4.9-1.8 0-2.6.9-4.5.9s-2.7-.9-4.5-.9Z" />
    </svg>
  );
}
