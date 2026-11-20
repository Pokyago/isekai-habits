import { useEffect } from 'react';
import { useFx } from '../data/fx';

const TONES = {
  reward: 'border-gold/70 text-gold',
  info: 'border-glow/60 text-glow',
  warn: 'border-danger/60 text-danger',
};

export function Toasts() {
  const toasts = useFx((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-8 lg:left-56"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast rounded-full border bg-panel/95 px-4 py-2 text-sm font-semibold whitespace-pre shadow-lg ${TONES[t.tone]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function LevelUpOverlay() {
  const levelUp = useFx((s) => s.levelUp);
  const clear = useFx((s) => s.clearLevelUp);

  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(clear, 4000);
    return () => clearTimeout(id);
  }, [levelUp, clear]);

  if (!levelUp) return null;
  return (
    <button
      type="button"
      onClick={clear}
      aria-label="Dismiss level up"
      className="animate-fade fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 bg-void/85 text-center backdrop-blur-md"
    >
      <span className="text-xs font-semibold tracking-[0.5em] text-glow uppercase">Level up</span>
      <span className="animate-level font-display text-7xl font-bold text-gold drop-shadow-[0_0_30px_rgba(243,196,82,0.6)]">
        Lv {levelUp.level}
      </span>
      {levelUp.rankUp && (
        <span className="animate-fade mt-2 rounded-full border border-gold/60 px-4 py-1.5 text-sm font-semibold text-gold">
          Promoted to {levelUp.rank}-rank adventurer
        </span>
      )}
      <span className="mt-6 text-xs text-mute">Tap to continue</span>
    </button>
  );
}
