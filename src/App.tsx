import {
  CalendarClock,
  Check,
  Coins,
  HeartPulse,
  RefreshCw,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  Store,
  Swords,
  Target,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CompanionBadge, CompanionWindow } from './components/Companion';
import { LevelUpOverlay, Toasts } from './components/Fx';
import { useManualDirty } from './components/SyncPanel';
import { Bar, Button, Ring, Segmented } from './components/ui';
import { useGame } from './data/store';
import { nextRankLevel } from './game/levels';
import { mainId } from './plan/plan';
import { useChanged, useCountUp, useDayProgress, useDerived, useToday } from './hooks';
import { Chronicle } from './screens/Chronicle';
import { Habits } from './screens/Habits';
import { Health } from './screens/Health';
import { Hero } from './screens/Hero';
import { Money } from './screens/money/Money';
import { Onboarding } from './screens/Onboarding';
import { Plan } from './screens/Plan';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Today } from './screens/Today';
import { initSync, reconnectSaveFile, syncMode, useSync } from './sync';

type Tab = 'today' | 'plan' | 'habits' | 'health' | 'money' | 'shop' | 'hero' | 'settings';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: Swords },
  { id: 'plan', label: 'Plan', icon: CalendarClock },
  { id: 'habits', label: 'Habits', icon: ScrollText },
  { id: 'health', label: 'Health', icon: HeartPulse },
  { id: 'money', label: 'Money', icon: Wallet },
  { id: 'shop', label: 'Shop', icon: Store },
  { id: 'hero', label: 'Hero', icon: User },
];

/** How wide each section's content may grow on a large window. */
const WIDTH: Record<Tab, string> = {
  today: 'max-w-[110rem]',
  plan: 'max-w-[100rem]',
  habits: 'max-w-[110rem]',
  health: 'max-w-7xl',
  money: 'max-w-7xl',
  shop: 'max-w-6xl',
  hero: 'max-w-7xl',
  settings: 'max-w-3xl',
};

export default function App() {
  const loaded = useGame((s) => s.loaded);
  const hasHero = useGame((s) => s.data.hero !== null);
  const [tab, setTab] = useState<Tab>('today');
  // Which day the Plan page opens on: 1 is tomorrow, 0 is today.
  const [planStart, setPlanStart] = useState(1);
  const openPlan = (offset: number) => {
    setPlanStart(offset);
    setTab('plan');
  };
  const select = (next: Tab) => {
    if (next === 'plan') setPlanStart(1);
    setTab(next);
  };

  useEffect(() => {
    void useGame
      .getState()
      .load()
      .then(() => initSync());
  }, []);

  // When a new day starts with the app open, add the monthly money items that came due.
  const today = useToday();
  useEffect(() => {
    if (loaded) useGame.getState().tick();
  }, [today, loaded]);

  // Each section, and the game itself after the summoning, opens at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, hasHero]);

  if (!loaded) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-mute">Loading…</div>;
  }
  if (!hasHero) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    );
  }

  return (
    // On a large window the sections sit in a rail on the left; on a small one, in a bar at the bottom.
    <div className="min-h-dvh lg:pl-56">
      <SideNav tab={tab} onSelect={select} />
      <TopBar
        onSettings={() => setTab(tab === 'settings' ? 'today' : 'settings')}
        settingsOpen={tab === 'settings'}
        onToday={() => setTab('today')}
      />

      <div className={`mx-auto px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-6 lg:pb-12 ${WIDTH[tab]}`}>
        {tab !== 'settings' && <SyncNotice onOpenSettings={() => setTab('settings')} />}
        <main key={tab} className="animate-fade">
          {tab === 'today' && <Today onManageHabits={() => setTab('habits')} onPlan={openPlan} />}
          {tab === 'plan' && <Plan startOn={planStart} />}
          {tab === 'hero' && <HeroPage />}
          {tab === 'health' && <Health />}
          {tab === 'habits' && <Habits />}
          {tab === 'money' && <Money />}
          {tab === 'shop' && <Shop />}
          {tab === 'settings' && <Settings />}
        </main>
      </div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-3xl">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => select(id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-medium transition-colors sm:text-[11px] ${
                    on ? 'text-glow' : 'text-mute hover:text-ink'
                  }`}
                >
                  <Icon size={21} strokeWidth={on ? 2.4 : 1.8} className={`transition-transform ${on ? '-translate-y-0.5' : ''}`} />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Toasts />
      <LevelUpOverlay />
    </div>
  );
}

/** The sections as a rail down the left edge. Only on large windows. */
function SideNav({ tab, onSelect }: { tab: Tab; onSelect(tab: Tab): void }) {
  const d = useDerived();
  const nextRank = nextRankLevel(d.level.level);
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto border-r border-edge/70 bg-panel/70 px-3 py-5 backdrop-blur lg:flex"
    >
      <p className="mb-6 shrink-0 px-3 text-[11px] font-semibold tracking-[0.35em] text-glow uppercase">Isekai Habits</p>
      <ul className="shrink-0 space-y-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = tab === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={on ? 'page' : undefined}
                className={`group relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                  on ? 'bg-raise text-glow' : 'text-mute hover:bg-raise/60 hover:text-ink'
                }`}
              >
                <span
                  className={`absolute top-2 bottom-2 left-0 w-1 rounded-full bg-glow transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}
                  style={{ boxShadow: '0 0 10px var(--color-glow)' }}
                />
                <Icon size={19} strokeWidth={on ? 2.4 : 1.8} className="transition-transform group-hover:scale-110" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      {/* The heroine stands in what is left of the rail, above the rank. */}
      <div className="mt-auto flex min-h-0 shrink flex-col pt-4 pb-3">
        <CompanionWindow xp={d.heroXp} onToday={() => onSelect('today')} />
      </div>

      <button
        type="button"
        onClick={() => onSelect('hero')}
        className="flex shrink-0 items-center gap-3 rounded-xl border border-edge/70 bg-void/40 p-3 text-left transition-colors hover:border-gold/50"
      >
        <span className="flex size-10 shrink-0 rotate-45 items-center justify-center rounded-lg border-2 border-gold/80 bg-gold/10">
          <span className="-rotate-45 font-display text-lg font-bold text-gold">{d.rank}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{d.rank}-rank adventurer</span>
          <span className="block text-[11px] text-mute">{nextRank ? `Next rank at level ${nextRank}` : 'Highest rank reached'}</span>
        </span>
      </button>
    </nav>
  );
}

/** The Hero tab: the character sheet, and the chronicle of what has been done. */
function HeroPage() {
  const [view, setView] = useState<'status' | 'chronicle'>('status');
  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Segmented<'status' | 'chronicle'>
          label="Hero section"
          value={view}
          onChange={setView}
          options={[
            { value: 'status', label: 'Status' },
            { value: 'chronicle', label: 'Chronicle' },
          ]}
        />
      </div>
      {view === 'status' ? <Hero /> : <Chronicle />}
    </div>
  );
}

const HINT_KEY = 'isekai-habits-sync-hint-dismissed';

/** A strip above the page when the save file needs the user: reconnect, an error, or not set up yet. */
function SyncNotice({ onOpenSettings }: { onOpenSettings(): void }) {
  const status = useSync((s) => s.status);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (syncMode === 'manual') return null;

  const box = 'mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm';

  if (status === 'needs-permission') {
    return (
      <div role="status" className={`${box} border-gold/60 bg-gold/10`}>
        <span className="min-w-48 flex-1">
          The browser needs permission to use your save file again. Until then, changes stay on this PC only.
        </span>
        <Button variant="gold" onClick={() => void reconnectSaveFile()}>
          <RefreshCw size={16} /> Reconnect
        </Button>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div role="alert" className={`${box} border-danger/60 bg-danger/10`}>
        <span className="min-w-48 flex-1">Saving to your save file failed. Your progress is still kept on this PC.</span>
        <Button onClick={onOpenSettings}>See details</Button>
      </div>
    );
  }
  if (status === 'off' && syncMode === 'auto' && !hintDismissed) {
    return (
      <div role="status" className={`${box} border-edge bg-panel/85 text-mute`}>
        <span className="min-w-48 flex-1">
          Your progress is stored only in this browser. Set up a save file to keep a copy in iCloud Drive.
        </span>
        <Button variant="primary" onClick={onOpenSettings}>
          Set up
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(HINT_KEY, '1');
            } catch {
              // Not being able to remember the choice only means the hint shows again.
            }
            setHintDismissed(true);
          }}
        >
          Not now
        </Button>
      </div>
    );
  }
  return null;
}

/**
 * The bar that stays at the top of every screen: who you are, how far to the next
 * level, and how today is going (habits done and the three daily quests).
 */
function TopBar({
  onSettings,
  settingsOpen,
  onToday,
}: {
  onSettings(): void;
  settingsOpen: boolean;
  onToday(): void;
}) {
  const hero = useGame((s) => s.data.hero);
  const today = useToday();
  const main = useGame((s) => s.data.plan[mainId(today)]);
  const goal = main && !main.deleted ? main : null;
  const d = useDerived();
  const day = useDayProgress();
  const gold = useCountUp(d.gold);
  const xpGained = useChanged(d.heroXp);
  const syncStatus = useSync((s) => s.status);
  const manualDirty = useManualDirty();
  const needsAttention =
    syncMode === 'manual' ? manualDirty : syncStatus === 'needs-permission' || syncStatus === 'error';
  const allDone = day.total > 0 && day.done === day.total;
  const questsDone = day.quests.filter((q) => q.done).length;

  return (
    <header className="sticky top-0 z-30 border-b border-edge/60 bg-void/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 py-2.5 sm:gap-3 lg:gap-5 lg:px-8">
        <CompanionBadge xp={d.heroXp} onToday={onToday} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="truncate font-display text-base font-bold lg:text-lg">{hero?.name}</span>
            <span className="shrink-0 text-xs font-semibold text-glow">Lv {d.level.level}</span>
            <span className="hidden shrink-0 rounded border border-gold/50 px-1 text-[10px] font-bold text-gold sm:inline">{d.rank}</span>
            <span className="ml-auto hidden shrink-0 text-[11px] text-mute tabular-nums sm:inline">
              {d.level.into} / {d.level.needed} XP
            </span>
          </div>
          <div className="relative overflow-hidden rounded-full">
            <Bar value={d.level.into} max={d.level.needed} className="h-1.5 lg:h-2" />
            {xpGained > 0 && <span key={xpGained} className="animate-shine pointer-events-none absolute inset-0" />}
          </div>
        </div>

        {goal && (
          <button
            type="button"
            onClick={onToday}
            title={`Today’s main goal${goal.done ? ' (achieved)' : ''}: ${goal.title}`}
            className="hidden max-w-72 shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-raise xl:flex"
          >
            <span
              key={String(goal.done)}
              className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${
                goal.done ? 'animate-goal border-gold bg-gold text-void' : 'border-gold/70 text-gold'
              }`}
            >
              {goal.done ? <Check size={14} strokeWidth={3} /> : <Target size={13} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] leading-none font-semibold tracking-wide text-mute uppercase">Main goal</span>
              <span className={`mt-0.5 block truncate text-sm leading-tight font-medium ${goal.done ? 'text-gold' : ''}`}>{goal.title}</span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onToday}
          title={`Today: ${day.done} of ${day.total} habits done, ${questsDone} of ${day.quests.length} daily quests`}
          aria-label={`Today: ${day.done} of ${day.total} habits done, ${questsDone} of ${day.quests.length} daily quests. Go to Today.`}
          className="flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-raise"
        >
          <Ring value={day.done} max={day.total} size={40} stroke={4} color={allDone ? 'var(--color-gold)' : 'var(--color-glow)'}>
            <span className="text-[10px] font-bold tabular-nums">
              {day.done}/{day.total}
            </span>
          </Ring>
          {day.quests.length > 0 && (
            <span className="hidden flex-col gap-1 sm:flex">
              <span className="text-[10px] leading-none font-semibold tracking-wide text-mute uppercase">Quests</span>
              <span className="flex gap-1">
                {day.quests.map((q) => (
                  <span
                    key={`${q.slot}-${q.done}`}
                    className={`size-2.5 rotate-45 rounded-[2px] border ${q.done ? 'animate-goal border-gold bg-gold' : 'border-mute/70'}`}
                  />
                ))}
              </span>
            </span>
          )}
        </button>

        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gold tabular-nums" title="Gold">
          <Coins size={15} /> {gold.toLocaleString()}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-glow tabular-nums" title="Streak shields">
          <Shield size={15} /> {d.shieldsLeft}
        </span>
        <button
          type="button"
          onClick={onSettings}
          aria-label={needsAttention ? 'Settings (sync needs attention)' : 'Settings'}
          aria-pressed={settingsOpen}
          className={`relative flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-raise ${
            settingsOpen ? 'bg-raise text-glow' : 'text-mute hover:text-ink'
          }`}
        >
          <SettingsIcon size={19} className="transition-transform duration-300 hover:rotate-45" />
          {needsAttention && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-gold ring-2 ring-void" />}
        </button>
      </div>
    </header>
  );
}
