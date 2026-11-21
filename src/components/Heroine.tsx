import { useId } from 'react';
import type { Mood } from '../game/companion';

const HAIR = '#e6e0ff';
const HAIR_SHADE = '#beb2f2';
const HAIR_DARK = '#8f83d8';
const SKIN = '#ffe6d6';
const INK = '#2a2a5c';
const DRESS = '#f4f5ff';
const DRESS_SHADE = '#cdd3f3';
const LIP = '#b23a5c';
const GOLD = '#f3c452';

const SPARKLE = 'M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z';
const HEART = 'M0 3.6 C-6.2 -0.8 -3.6 -6 0 -2.6 C3.6 -6 6.2 -0.8 0 3.6 Z';
const DROP = 'M0 -4 C2.6 -0.6 3 1.4 3 2.2 A3 3 0 0 1 -3 2.2 C-3 1.4 -2.6 -0.6 0 -4 Z';

const EYES = [48, 72];
const EYE_Y = 64;

/**
 * The heroine, drawn in code. Her face and pose follow her mood; the movement is
 * in index.css (the hv- rules), keyed by data-pose. `cheering` is the short jump
 * for joy when something has just been achieved, whatever her mood.
 */
export function Heroine({
  mood,
  cheering = false,
  accent,
  tone,
  portrait = false,
  className = '',
}: {
  mood: Mood;
  cheering?: boolean;
  /** The colour of her cape and trim: the hero's class. */
  accent: string;
  /** The colour of the light around her: her mood. */
  tone: string;
  /** Only her face, for a small round picture. */
  portrait?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const look: Mood = cheering ? 'radiant' : mood;
  const pose = cheering ? 'cheer' : mood;
  const cape = `color-mix(in srgb, ${accent} 55%, #0b0e22)`;

  return (
    <svg
      viewBox={portrait ? '24 20 72 72' : '0 -14 120 170'}
      className={`hv ${className}`}
      data-pose={pose}
      data-mood={mood}
      data-portrait={portrait || undefined}
      aria-hidden
    >
      <defs>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0%" style={{ stopColor: tone }} stopOpacity={look === 'radiant' ? 0.42 : look === 'exhausted' ? 0.1 : 0.26} />
          <stop offset="100%" style={{ stopColor: tone }} stopOpacity="0" />
        </radialGradient>
        {EYES.map((cx) => (
          <clipPath key={cx} id={`${uid}-lid-${cx}`}>
            <rect x={cx - 7} y={EYE_Y - 1} width="14" height="9" />
          </clipPath>
        ))}
      </defs>

      {!portrait && (
        <>
          <circle cx="60" cy="74" r="66" fill={`url(#${uid}-glow)`} />
          <ellipse cx="60" cy="149" rx="27" ry="4" fill="#000" opacity="0.35" />
        </>
      )}

      <g className="hv-body">
        {/* Cape, then the long hair falling over it. The hair turns with her head. */}
        <path d="M46 92 C36 104 30 120 28 135 Q60 143 92 135 C90 120 84 104 74 92 Z" style={{ fill: cape }} />
        <g className="hv-head" style={{ transformOrigin: '60px 86px' }}>
          <path
            d="M27 56 C22 14 98 14 93 56 C97 76 99 96 95 114 C90 108 86 104 82 102 C80 106 78 108 75 110 L45 110 C42 108 40 106 38 102 C34 104 30 108 25 114 C21 96 23 76 27 56 Z"
            fill={HAIR_SHADE}
          />
        </g>

        {/* Legs and boots. */}
        <rect x="51" y="122" width="6.5" height="20" rx="3" fill="#39407a" />
        <rect x="62.5" y="122" width="6.5" height="20" rx="3" fill="#39407a" />
        <rect x="49" y="138" width="10" height="9.5" rx="3.5" fill="#8a6248" />
        <rect x="61" y="138" width="10" height="9.5" rx="3.5" fill="#8a6248" />
        <path d="M49.5 140.5 H58.5 M61.5 140.5 H70.5" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />

        {/* Dress, with a hem in the class colour and a gold belt. */}
        <path d="M49 91 C46 100 42 114 39 125 Q60 133 81 125 C78 114 74 100 71 91 Z" fill={DRESS} />
        <path d="M60 100 C59 110 58 120 57.5 129" fill="none" stroke={DRESS_SHADE} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M39.8 122.4 Q60 130.4 80.2 122.4" fill="none" style={{ stroke: accent }} strokeWidth="3" />
        <path d="M45.4 106 Q60 110.5 74.6 106" fill="none" stroke={GOLD} strokeWidth="2.6" />

        {/* Arms turn at the shoulder. */}
        <g className="hv-arm hv-arm-l" style={{ transformOrigin: '48px 96px' }}>
          <path d="M48 96 L39.5 116" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
          <circle cx="48.4" cy="96.4" r="5.4" fill={DRESS_SHADE} />
        </g>
        <g className="hv-arm hv-arm-r" style={{ transformOrigin: '72px 96px' }}>
          <path d="M72 96 L80.5 116" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
          <circle cx="71.6" cy="96.4" r="5.4" fill={DRESS_SHADE} />
        </g>

        {/* Collar and brooch. */}
        <path d="M47 92 Q60 102 73 92 Q60 86.5 47 92 Z" style={{ fill: accent }} />
        <circle cx="60" cy="96.2" r="2.6" fill={GOLD} />

        <g className="hv-head" style={{ transformOrigin: '60px 86px' }}>
          <ellipse cx="60" cy="59" rx="26.5" ry="24.5" fill={SKIN} />
          <Face look={look} uid={uid} />

          {/* Fringe, the locks beside her face, and the one strand that never lies flat. */}
          <path
            d="M32.5 60 C29 18 91 18 87.5 60 C86.5 56 84 53 81 51 C79 54 74 57 68 58 C68 52 65 47 60 44 C57 50 51 56 44 58 C44 55 42 52 39.5 51 C36.5 53 34 56 32.5 60 Z"
            fill={HAIR}
          />
          <path d="M32.5 54 C30 68 31 82 36 92 C39 82 39.5 68 38.5 54 Z" fill={HAIR} />
          <path d="M87.5 54 C90 68 89 82 84 92 C81 82 80.5 68 81.5 54 Z" fill={HAIR} />
          <path d="M42 37.5 Q52 29.5 66 29.5" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.4" strokeLinecap="round" />
          <path className="hv-ahoge" d="M58 28 C54 16 64 10 70 16 C65 16 62 20 63 28 Z" fill={HAIR} style={{ transformOrigin: '60.5px 28px' }} />
          <g transform="translate(80 42)">
            <path d={SPARKLE} fill={GOLD} transform="scale(0.95)" />
          </g>

          {/* Worried brows show through the fringe. */}
          {(look === 'tired' || look === 'exhausted') && (
            <path
              d={look === 'tired' ? 'M43 56 L52 54 M77 56 L68 54' : 'M43 57 L52 53 M77 57 L68 53'}
              stroke={HAIR_DARK}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
        </g>
      </g>

      {!portrait && <Around pose={pose} />}
    </svg>
  );
}

function Face({ look, uid }: { look: Mood; uid: string }) {
  const blush = { radiant: 0.7, cheerful: 0.55, steady: 0.32, tired: 0.14, exhausted: 0 }[look];
  const open = look === 'cheerful' || look === 'steady' || look === 'tired';
  return (
    <>
      {blush > 0 && (
        <g fill="#ff8fa3" opacity={blush}>
          <ellipse cx="40.5" cy="71.5" rx="4.6" ry="2.6" />
          <ellipse cx="79.5" cy="71.5" rx="4.6" ry="2.6" />
        </g>
      )}

      {open && (
        <g className="hv-eyes" style={{ transformOrigin: `60px ${EYE_Y}px` }}>
          {EYES.map((cx) => (
            <g key={cx}>
              <g clipPath={look === 'tired' ? `url(#${uid}-lid-${cx})` : undefined}>
                <ellipse cx={cx} cy={EYE_Y} rx="4.7" ry="6.1" fill={INK} />
                <ellipse cx={cx} cy={EYE_Y + 2} rx="3.2" ry="3.4" fill="#6fd6ff" opacity="0.9" />
                <circle cx={cx - 1.6} cy={EYE_Y - 2.6} r={look === 'cheerful' ? 1.9 : 1.6} fill="#fff" />
                <circle cx={cx + 1.9} cy={EYE_Y + 2.6} r="0.85" fill="#fff" opacity="0.85" />
              </g>
              {look === 'tired' ? (
                <path d={`M${cx - 5.4} ${EYE_Y - 1} H${cx + 5.4}`} stroke={INK} strokeWidth="1.9" strokeLinecap="round" />
              ) : (
                <path
                  d={`M${cx - 5.7} ${EYE_Y - 3.8} Q${cx} ${EYE_Y - 8.6} ${cx + 5.7} ${EYE_Y - 3.8}`}
                  fill="none"
                  stroke={INK}
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              )}
            </g>
          ))}
        </g>
      )}

      {/* Eyes shut in a smile. */}
      {look === 'radiant' &&
        EYES.map((cx) => (
          <path
            key={cx}
            d={`M${cx - 5.2} ${EYE_Y + 1.5} Q${cx} ${EYE_Y - 6} ${cx + 5.2} ${EYE_Y + 1.5}`}
            fill="none"
            stroke={INK}
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        ))}

      {/* Eyes shut, and tears. */}
      {look === 'exhausted' &&
        EYES.map((cx, i) => (
          <g key={cx}>
            <path
              d={`M${cx - 5.2} ${EYE_Y - 1} Q${cx} ${EYE_Y + 4} ${cx + 5.2} ${EYE_Y - 1}`}
              fill="none"
              stroke={INK}
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <g transform={`translate(${cx + (i === 0 ? -2 : 2)} ${EYE_Y + 6})`}>
              <path className="hv-tear" d={DROP} fill="#9fe3ff" transform="scale(0.62)" style={{ animationDelay: `${i * 1.3}s` }} />
            </g>
          </g>
        ))}

      {look === 'radiant' && (
        <>
          <path d="M54.5 73 Q60 82.5 65.5 73 Z" fill={LIP} stroke={LIP} strokeWidth="1.2" strokeLinejoin="round" />
          <ellipse cx="60" cy="77.2" rx="2.3" ry="1.3" fill="#ff8fa3" />
        </>
      )}
      {look !== 'radiant' && (
        <path
          d={
            {
              cheerful: 'M55 73.5 Q60 79 65 73.5',
              steady: 'M56.5 75 Q60 77 63.5 75',
              tired: 'M56 77 Q60 74.2 64 77',
              exhausted: 'M55 77 Q57.5 74 60 76.4 T65 76',
            }[look]
          }
          fill="none"
          stroke={LIP}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/** What floats around her: sparkles when she is well, a rain cloud when she is not. */
function Around({ pose }: { pose: Mood | 'cheer' }) {
  if (pose === 'radiant') {
    return (
      <g fill={GOLD}>
        {[
          [14, 34, 1, 0],
          [106, 26, 0.8, 0.7],
          [103, 92, 0.9, 1.3],
          [15, 98, 0.7, 1.9],
          [60, -4, 0.75, 0.4],
        ].map(([x, y, size, delay]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size})`}>
            <path className="hv-sparkle" d={SPARKLE} style={{ animationDelay: `${delay}s` }} />
          </g>
        ))}
      </g>
    );
  }
  if (pose === 'cheerful') {
    return (
      <g fill="#fff" opacity="0.85">
        {[
          [16, 44, 0.7, 0],
          [104, 36, 0.6, 1.6],
        ].map(([x, y, size, delay]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size})`}>
            <path className="hv-sparkle hv-sparkle-slow" d={SPARKLE} style={{ animationDelay: `${delay}s` }} />
          </g>
        ))}
      </g>
    );
  }
  if (pose === 'tired') {
    return (
      <g transform="translate(93 40)">
        <path className="hv-sweat" d={DROP} fill="#9fe3ff" />
      </g>
    );
  }
  if (pose === 'exhausted') {
    return (
      <g className="hv-cloud">
        <g fill="#5c6796">
          <circle cx="49" cy="1" r="7" />
          <circle cx="60" cy="-3" r="9" />
          <circle cx="71" cy="1" r="7" />
          <rect x="43" y="0" width="34" height="8" rx="4" />
        </g>
        <g stroke="#9fe3ff" strokeWidth="1.6" strokeLinecap="round">
          {[
            [50, 0],
            [60, 0.4],
            [70, 0.8],
          ].map(([x, delay]) => (
            <path key={x} className="hv-rain" d={`M${x} 11 l-1.2 4`} style={{ animationDelay: `${delay}s` }} />
          ))}
        </g>
      </g>
    );
  }
  if (pose === 'cheer') {
    return (
      <g fill="#ff8fa3">
        {[
          [17, 44, 1.1, 0],
          [103, 38, 0.9, 0.2],
          [96, 8, 0.7, 0.45],
        ].map(([x, y, size, delay]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size})`}>
            <path className="hv-heart" d={HEART} style={{ animationDelay: `${delay}s` }} />
          </g>
        ))}
      </g>
    );
  }
  return null;
}
