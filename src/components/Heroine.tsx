import { useId } from 'react';
import type { Mood } from '../game/companion';

const HAIR = '#eceef6';
const HAIR_SHADE = '#c3c8da';
const HAIR_DARK = '#8f96ae';
const SKIN = '#ffe6d6';
const SKIN_SHADE = '#f1c2ab';
const INK = '#33213a';
const IRIS = '#e23f55';
const WHITE = '#f7f8fc';
const WHITE_SHADE = '#dde1ee';
const VEST = '#383b4a';
const RED = '#c9303f';
const RED_SHADE = '#9c2232';
const BLUE = '#2a428f';
const GREEN = '#2e8b78';
const GREEN_SHADE = '#216b5c';
const LEATHER = '#5e4336';
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
  /** The colour of the gem on her bow: the hero's class. */
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
        {/* Her long hair, which turns with her head. */}
        <g className="hv-head" style={{ transformOrigin: '60px 86px' }}>
          <path
            d="M27 56 C22 14 98 14 93 56 C98 80 101 108 98 132 C94 125 91 121 88 119 C87 123 85 126 82 128 L38 128 C35 126 33 123 32 119 C29 121 26 125 22 132 C19 108 22 80 27 56 Z"
            fill={HAIR_SHADE}
          />
        </g>

        {/* The cape hangs from one shoulder: red, lined in blue, edged in gold, and cut to two points. */}
        <path d="M70 97 C77 108 80 122 81 135 L87 141 C86 124 81 108 72 96 Z" fill={BLUE} />
        <path
          d="M66 90 L80 91 C91 104 98 120 101 137 L92 131 L87 141 C86 124 81 108 72 96 Z"
          fill={RED}
          stroke={GOLD}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M80 93 C88 106 93 119 95.5 131" fill="none" stroke={RED_SHADE} strokeWidth="1.2" strokeLinecap="round" />

        {/* White stockings and tall boots with gold cuffs. */}
        <rect x="51" y="122" width="6.5" height="20" rx="3" fill={WHITE} />
        <rect x="62.5" y="122" width="6.5" height="20" rx="3" fill={WHITE} />
        <rect x="49.2" y="134" width="10" height="13.5" rx="3.5" fill={LEATHER} />
        <rect x="60.8" y="134" width="10" height="13.5" rx="3.5" fill={LEATHER} />
        <path d="M49.6 136.4 H58.8 M61.2 136.4 H70.4" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />

        {/* Neck, blouse and the dark vest with its gold buttons. */}
        <rect x="56.5" y="80" width="7" height="13" fill={SKIN_SHADE} />
        <path d="M49.5 91 C48 97 47 103 46.5 109 L73.5 109 C73 103 72 97 70.5 91 Z" fill={WHITE} />
        <path d="M48.7 95.5 L55 95.5 L60 102.5 L65 95.5 L71.3 95.5 L73.5 109 L46.5 109 Z" fill={VEST} />
        <path d="M55 95.5 L60 102.5 L65 95.5" fill="none" stroke={GOLD} strokeWidth="0.9" strokeLinejoin="round" />
        <g fill={GOLD}>
          <circle cx="54.6" cy="101" r="0.9" />
          <circle cx="65.4" cy="101" r="0.9" />
          <circle cx="55.6" cy="104.6" r="0.9" />
          <circle cx="64.4" cy="104.6" r="0.9" />
        </g>

        {/* Pleated green skirt with a gold hem, under a leather belt. */}
        <path d="M46 109 L74 109 C77 115 80 121 82 126 Q60 133.5 38 126 C40 121 43 115 46 109 Z" fill={GREEN} />
        <path d="M52.5 111 L48.5 129 M60 111 V131 M67.5 111 L71.5 129" stroke={GREEN_SHADE} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M39 123.6 Q60 130.8 81 123.6" fill="none" stroke={GOLD} strokeWidth="1.6" />
        <path d="M46.3 107 H73.7 L74.2 110.8 H45.8 Z" fill="#7a5236" />
        <rect x="57.6" y="106.6" width="4.8" height="4.6" rx="0.8" fill="none" stroke={GOLD} strokeWidth="1.2" />

        {/* Arms turn at the shoulder: puffed white sleeves with gold cuffs. */}
        <g className="hv-arm hv-arm-l" style={{ transformOrigin: '48px 96px' }}>
          <path d="M48 96 L40.6 113.4" stroke={WHITE} strokeWidth="7" strokeLinecap="round" />
          <path d="M41.3 111.8 L40.5 113.7" stroke={GOLD} strokeWidth="7.4" />
          <circle cx="39.5" cy="116.3" r="3.3" fill={SKIN} />
          <circle cx="48.4" cy="96.4" r="5.4" fill={WHITE_SHADE} />
        </g>
        <g className="hv-arm hv-arm-r" style={{ transformOrigin: '72px 96px' }}>
          <path d="M72 96 L79.4 113.4" stroke={WHITE} strokeWidth="7" strokeLinecap="round" />
          <path d="M78.7 111.8 L79.5 113.7" stroke={GOLD} strokeWidth="7.4" />
          <circle cx="80.5" cy="116.3" r="3.3" fill={SKIN} />
          <circle cx="71.6" cy="96.4" r="5.4" fill={WHITE_SHADE} />
        </g>

        {/* The gold epaulette that holds the cape. */}
        <path d="M70.5 95.6 v3.2 M73 96.4 v3.2 M75.5 96.7 v3.2 M78 96.4 v3.2 M80.5 95.6 v3.2" stroke={GOLD} strokeWidth="1.3" strokeLinecap="round" />
        <ellipse cx="75.5" cy="93" rx="7.2" ry="3.5" fill={GOLD} />
        <ellipse cx="75.5" cy="92.4" rx="5" ry="1.8" fill="#ffe08a" />

        {/* Collar, and a red bow with a gem in the class colour. */}
        <path d="M53 89.5 L60 95 L67 89.5 L65 87.2 L60 91 L55 87.2 Z" fill="#fff" />
        <path d="M60 94.5 L52.8 91 L53.6 98 Z M60 94.5 L67.2 91 L66.4 98 Z" fill={RED} />
        <circle cx="60" cy="94.5" r="2" style={{ fill: accent }} stroke={GOLD} strokeWidth="0.7" />

        <g className="hv-head" style={{ transformOrigin: '60px 86px' }}>
          <ellipse cx="60" cy="59" rx="26.5" ry="24.5" fill={SKIN} />
          <Face look={look} uid={uid} />

          {/* Fringe with a strand between the eyes, long locks beside her face, and the one strand that never lies flat. */}
          <path
            d="M32.5 60 C29 18 91 18 87.5 60 C86.5 56 84 53 81 51 C79 55 75 57.5 70 58 C70 53 68 49 65 46 C64 52 62 58 60 62 C58 56 55 50 51 46 C50 51 47 56 43 58 C43.5 55 42 52 39.5 51 C36.5 53 34 56 32.5 60 Z"
            fill={HAIR}
          />
          <path d="M32.5 54 C29.5 70 30 90 34.5 104 C38 90 39.5 70 38.5 54 Z" fill={HAIR} />
          <path d="M87.5 54 C90.5 70 90 90 85.5 104 C82 90 80.5 70 81.5 54 Z" fill={HAIR} />
          <path d="M42 37.5 Q52 29.5 66 29.5" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="2.4" strokeLinecap="round" />
          <path className="hv-ahoge" d="M58 28 C54 16 64 10 70 16 C65 16 62 20 63 28 Z" fill={HAIR} style={{ transformOrigin: '60.5px 28px' }} />

          {/* A gold leaf clip tied with a dark ribbon. */}
          <path d="M84.5 45 L90 42.5 L89 49 Z M84.5 45 L86.5 52.5 L81.5 50.5 Z" fill="#2d2f3a" />
          <path d="M76 45.5 Q78 36.5 86 36.5 Q84.5 45 76 45.5 Z" fill={GOLD} />
          <path d="M77.5 44.5 L84.5 38" fill="none" stroke="#c9972e" strokeWidth="0.8" strokeLinecap="round" />

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
                <ellipse cx={cx} cy={EYE_Y + 2} rx="3.2" ry="3.4" fill={IRIS} />
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
