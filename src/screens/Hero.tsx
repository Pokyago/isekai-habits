import { Lock, Trophy } from 'lucide-react';
import { Bar, Panel, StatIcon } from '../components/ui';
import { CLASSES, STATS, STAT_ORDER, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { useDerived } from '../hooks';
import { nextRankLevel } from '../game/levels';

export function Hero() {
  const hero = useGame((s) => s.data.hero);
  const d = useDerived();
  if (!hero) return null;

  const cls = CLASSES[hero.heroClass];
  const nextRank = nextRankLevel(d.level.level);
  const bestStreak = Math.max(0, ...Object.values(d.streaks).filter((s) => s.unit === 'days').map((s) => s.best));
  const earned = d.achievements.filter((a) => a.earned).length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Status">
        <div className="flex items-center gap-4">
          <div
            className="flex size-20 shrink-0 rotate-45 items-center justify-center rounded-xl border-2 border-gold/80 bg-gold/10 shadow-[0_0_24px_rgba(243,196,82,0.25)]"
            aria-label={`${d.rank} rank`}
          >
            <span className="-rotate-45 font-display text-4xl font-bold text-gold">{d.rank}</span>
          </div>
          <div className="min-w-0 flex-1 pl-2">
            <h1 className="truncate font-display text-3xl font-bold">{hero.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-mute">
              <span className="inline-flex items-center gap-1" style={{ color: statColor(cls.stat) }}>
                <StatIcon stat={cls.stat} size={14} />
                {cls.name}
              </span>
              <span>·</span>
              <span>{d.rank}-rank adventurer</span>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-glow">Level {d.level.level}</span>
            <span className="text-xs text-mute tabular-nums">
              {d.level.into} / {d.level.needed} XP
            </span>
          </div>
          <Bar value={d.level.into} max={d.level.needed} className="h-3" />
          <p className="mt-2 text-xs text-mute">
            {nextRank ? `Next rank at level ${nextRank}.` : 'You have reached the highest rank.'} {d.heroXp.toLocaleString()} XP
            earned in total.
          </p>
        </div>
      </Panel>

      <Panel title="Stats">
        <ul className="space-y-3.5">
          {STAT_ORDER.map((s) => {
            const info = d.stats[s];
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border"
                  style={{ borderColor: `color-mix(in srgb, ${statColor(s)} 50%, transparent)` }}
                >
                  <StatIcon stat={s} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">
                      <span className="font-semibold">{STATS[s].name}</span>{' '}
                      <span className="text-xs text-mute">{STATS[s].blurb}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: statColor(s) }}>
                      Lv {info.level}
                    </span>
                  </div>
                  <Bar value={info.into} max={info.needed} color={statColor(s)} />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Record" className="lg:col-span-2">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Habits completed', d.completions],
            ['Best streak', `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}`],
            ['Flawless days', d.perfectDays],
            ['Quests finished', d.questsDone],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-edge/70 bg-void/40 p-3">
              <dt className="text-[11px] text-mute">{label}</dt>
              <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel className="lg:col-span-2" title="Titles" right={<span className="text-xs text-mute">{earned}/{d.achievements.length}</span>}>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {d.achievements.map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                a.earned ? 'border-gold/50 bg-gold/10' : 'border-edge/60 bg-void/30 opacity-60'
              }`}
            >
              {a.earned ? <Trophy size={18} className="shrink-0 text-gold" /> : <Lock size={16} className="shrink-0 text-mute" />}
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${a.earned ? 'text-gold' : ''}`}>{a.title}</span>
                <span className="block text-xs text-mute">{a.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
