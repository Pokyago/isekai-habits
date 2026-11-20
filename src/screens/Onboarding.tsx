import { Check } from 'lucide-react';
import { useState } from 'react';
import { SyncPanel } from '../components/SyncPanel';
import { Button, Chip, Panel, StatIcon, inputClass } from '../components/ui';
import { CLASSES, CLASS_ORDER, DIFFICULTIES, STATS, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { TEMPLATE_GROUPS } from '../data/templates';
import type { HeroClass } from '../data/types';
import { scheduleLabel } from '../game/schedule';

const SUGGESTED = ['walk', 'read', 'plan', 'bed'];

export function Onboarding() {
  const createHero = useGame((s) => s.createHero);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [heroClass, setHeroClass] = useState<HeroClass>('warrior');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(SUGGESTED));
  const [showLoad, setShowLoad] = useState(false);

  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const begin = () => {
    const templates = TEMPLATE_GROUPS.flatMap((g) => g.templates).filter((t) => picked.has(t.key));
    createHero(name, heroClass, templates);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <header className="text-center">
        <p className="text-[11px] font-semibold tracking-[0.4em] text-glow uppercase">Isekai Habits</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-balance sm:text-4xl">
          {step === 0 && 'You have been summoned to another world'}
          {step === 1 && 'Choose your class'}
          {step === 2 && 'Choose your first habits'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-pretty text-mute">
          {step === 0 && 'Here, strength is not granted. It is earned, one real-life habit at a time. Every habit you keep makes your hero stronger.'}
          {step === 1 && 'Your class earns 10% more XP from habits that train its stat. You can train every stat whatever you pick.'}
          {step === 2 && 'Start small. Three to five habits you can actually keep beat a long list you abandon. You can add more at any time.'}
        </p>
      </header>

      {step === 0 && (
        <>
          <Panel title="Your name, hero">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) setStep(1);
              }}
            >
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hero name"
                aria-label="Hero name"
                maxLength={30}
                autoFocus
              />
              <Button variant="primary" type="submit" disabled={!name.trim()}>
                Continue
              </Button>
            </form>
          </Panel>
          {showLoad ? (
            <Panel title="Continue an existing adventure">
              <SyncPanel />
            </Panel>
          ) : (
            <button
              type="button"
              className="mx-auto text-sm text-mute underline decoration-edge underline-offset-4 hover:text-ink"
              onClick={() => setShowLoad(true)}
            >
              I already have a save file
            </button>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div role="radiogroup" aria-label="Class" className="grid gap-2 sm:grid-cols-2">
            {CLASS_ORDER.map((c) => {
              const info = CLASSES[c];
              const on = c === heroClass;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setHeroClass(c)}
                  className={`rounded-xl border p-3 text-left transition-colors ${on ? '' : 'border-edge bg-panel/80 hover:border-mute'}`}
                  style={
                    on
                      ? {
                          borderColor: statColor(info.stat),
                          background: `color-mix(in srgb, ${statColor(info.stat)} 12%, var(--color-panel))`,
                        }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    <StatIcon stat={info.stat} size={18} />
                    <span className="font-display text-lg font-bold">{info.name}</span>
                    <span className="ml-auto text-[11px] font-semibold" style={{ color: statColor(info.stat) }}>
                      +10% {STATS[info.stat].name}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-mute">{info.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {TEMPLATE_GROUPS.map((group) => (
            <Panel key={group.area} title={group.area}>
              <ul className="space-y-1.5">
                {group.templates.map((t) => {
                  const on = picked.has(t.key);
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(t.key)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                          on ? 'border-glow/70 bg-glow/10' : 'border-edge/70 bg-void/40 hover:border-mute'
                        }`}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                            on ? 'border-glow bg-glow text-void' : 'border-mute'
                          }`}
                        >
                          {on && <Check size={14} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{t.name}</span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          <Chip color={statColor(t.stat)}>{STATS[t.stat].short}</Chip>
                          <Chip>{DIFFICULTIES[t.difficulty].name}</Chip>
                          <Chip>{scheduleLabel(t.schedule)}</Chip>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
          <div className="sticky bottom-3 flex items-center justify-between rounded-xl border border-edge bg-panel/95 p-2 backdrop-blur">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <span className="text-sm text-mute">{picked.size} chosen</span>
            <Button variant="gold" onClick={begin}>
              Begin the adventure
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
