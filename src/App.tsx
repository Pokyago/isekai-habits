import {
  Coins,
  HeartPulse,
  RefreshCw,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  Store,
  Swords,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LevelUpOverlay, Toasts } from './components/Fx';
import { useManualDirty } from './components/SyncPanel';
import { Bar, Button, Segmented } from './components/ui';
import { useGame } from './data/store';
import { useDerived, useToday } from './hooks';
import { Chronicle } from './screens/Chronicle';
import { Habits } from './screens/Habits';
import { Health } from './screens/Health';
import { Hero } from './screens/Hero';
import { Money } from './screens/money/Money';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Today } from './screens/Today';
import { initSync, reconnectSaveFile, syncMode, useSync } from './sync';

type Tab = 'today' | 'habits' | 'health' | 'money' | 'shop' | 'hero' | 'settings';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: Swords },
  { id: 'habits', label: 'Habits', icon: ScrollText },
  { id: 'health', label: 'Health', icon: HeartPulse },
  { id: 'money', label: 'Money', icon: Wallet },
  { id: 'shop', label: 'Shop', icon: Store },
  { id: 'hero', label: 'Hero', icon: User },
];

export default function App() {
  const loaded = useGame((s) => s.loaded);
  const hasHero = useGame((s) => s.data.hero !== null);
  const [tab, setTab] = useState<Tab>('today');

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
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pt-[env(safe-area-inset-top)] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <Header onSettings={() => setTab(tab === 'settings' ? 'today' : 'settings')} settingsOpen={tab === 'settings'} />
      {tab !== 'settings' && <SyncNotice onOpenSettings={() => setTab('settings')} />}
      <main key={tab} className="animate-fade">
        {tab === 'today' && <Today onManageHabits={() => setTab('habits')} />}
        {tab === 'hero' && <HeroPage />}
        {tab === 'health' && <Health />}
        {tab === 'habits' && <Habits />}
        {tab === 'money' && <Money />}
        {tab === 'shop' && <Shop />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-3xl">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-medium transition-colors sm:text-[11px] ${
                    on ? 'text-glow' : 'text-mute hover:text-ink'
                  }`}
                >
                  <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
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

/** The Hero tab: the character sheet, and the chronicle of what has been done. */
function HeroPage() {
  const [view, setView] = useState<'status' | 'chronicle'>('status');
  return (
    <div className="space-y-4">
      <Segmented<'status' | 'chronicle'>
        label="Hero section"
        value={view}
        onChange={setView}
        options={[
          { value: 'status', label: 'Status' },
          { value: 'chronicle', label: 'Chronicle' },
        ]}
      />
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

function Header({ onSettings, settingsOpen }: { onSettings(): void; settingsOpen: boolean }) {
  const hero = useGame((s) => s.data.hero);
  const d = useDerived();
  const syncStatus = useSync((s) => s.status);
  const manualDirty = useManualDirty();
  const needsAttention =
    syncMode === 'manual' ? manualDirty : syncStatus === 'needs-permission' || syncStatus === 'error';

  return (
    <header className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="truncate font-display text-base font-bold">{hero?.name}</span>
          <span className="shrink-0 text-xs font-semibold text-glow">Lv {d.level.level}</span>
          <span className="shrink-0 rounded border border-gold/50 px-1 text-[10px] font-bold text-gold">{d.rank}</span>
        </div>
        <Bar value={d.level.into} max={d.level.needed} className="h-1.5" />
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gold tabular-nums" title="Gold">
        <Coins size={15} /> {d.gold.toLocaleString()}
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
        <SettingsIcon size={19} />
        {needsAttention && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-gold ring-2 ring-void" />}
      </button>
    </header>
  );
}
