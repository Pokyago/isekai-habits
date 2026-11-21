import { PLAN_AHEAD_REWARD, REWARDED_GOALS } from '../plan/plan';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { BackupList, ReminderPanel } from '../components/DesktopPanels';
import { SyncPanel } from '../components/SyncPanel';
import { Button, Modal, Panel, inputClass } from '../components/ui';
import { useFx } from '../data/fx';
import { SHIELD_COST } from '../data/meta';
import { useGame } from '../data/store';
import { HEALTH_REWARD, SLEEP_REWARD } from '../health/health';
import { useToday } from '../hooks';
import { BUDGET_GRACE_DAYS, BUDGET_REWARD, LEDGER_REWARD, MILESTONE_REWARD } from '../money/actions';
import { disconnectSaveFile, downloadBackup, retireSaveFile, syncMode } from '../sync';

export function Settings() {
  const hero = useGame((s) => s.data.hero);
  const renameHero = useGame((s) => s.renameHero);
  const resetAll = useGame((s) => s.resetAll);
  const toast = useFx((s) => s.toast);
  const today = useToday();
  const [name, setName] = useState(hero?.name ?? '');
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <Panel title={syncMode === 'desktop' ? 'Save file' : 'Sync with iCloud Drive'}>
        <SyncPanel />
      </Panel>

      {syncMode === 'desktop' && (
        <Panel title="Evening reminder">
          <ReminderPanel />
        </Panel>
      )}

      <Panel title={syncMode === 'desktop' ? 'Backups' : 'Backup'}>
        {syncMode === 'desktop' && (
          <div className="mb-4 border-b border-edge/60 pb-4">
            <BackupList />
          </div>
        )}
        <p className="mb-3 text-sm text-mute">
          {syncMode === 'desktop'
            ? 'You can also download a copy of your save as it is right now, to keep anywhere you like.'
            : 'Download a dated copy of your save for safekeeping. To restore one, load it as a save file; it is merged with what you have.'}
        </p>
        <Button onClick={() => downloadBackup(today)}>
          <Download size={16} /> Download backup
        </Button>
      </Panel>

      <Panel title="Hero name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            renameHero(name);
          }}
        >
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Hero name"
            maxLength={30}
          />
          <Button type="submit" disabled={!name.trim() || name.trim() === hero?.name}>
            Rename
          </Button>
        </form>
      </Panel>

      <Panel title="How the game works">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-mute">
          <li>Completing a habit gives XP to your hero and to the habit’s stat, plus gold worth half the XP.</li>
          <li>Trivial, Easy, Medium and Hard habits are worth 5, 10, 20 and 40 XP.</li>
          <li>
            Every habit has its own streak: how many of its scheduled days in a row you have done it. A habit set for
            Monday, Wednesday and Friday keeps its streak through the days in between. A times-per-week habit counts
            weeks in a row that reached its number.
          </li>
          <li>
            A habit’s streak adds bonus XP to that habit only, growing evenly to +50% at 30 in a row. Your class adds 10%
            on its own stat.
          </li>
          <li>
            Missing a scheduled day resets that one habit’s streak; other habits are not affected and nothing else is
            lost. Doing every scheduled habit in a day is a separate thing, a flawless day.
          </li>
          <li>A streak shield ({SHIELD_COST} gold) is spent automatically to cover one missed day.</li>
          <li>Guild rank rises with level: E at 5, D at 10, C at 15, B at 20, A at 30, S at 40.</li>
          <li>
            Money: the first entry you record each day gives +{LEDGER_REWARD.xp} Fortune XP and +{LEDGER_REWARD.gold}{' '}
            gold. A month that ends inside your budget gives +{BUDGET_REWARD.xp} XP and +{BUDGET_REWARD.gold} gold; it is
            judged {BUDGET_GRACE_DAYS} days into the next month. Reaching a savings goal or clearing a debt gives +
            {MILESTONE_REWARD.xp} XP and +{MILESTONE_REWARD.gold} gold. Game gold and real money are never mixed.
          </li>
          <li>
            Credit card: what you buy on it counts against the budget on the day you buy it (each instalment in its
            own month), and your bank balance only changes when you pay the bill. Paying the bill is not counted as
            spending again.
          </li>
          <li>
            Health: the first check-in of each week gives +{HEALTH_REWARD.xp} Vitality XP and +{HEALTH_REWARD.gold}{' '}
            gold, and logging last night’s sleep gives +{SLEEP_REWARD.xp} XP and +{SLEEP_REWARD.gold} gold. Nothing depends on
            what the numbers are.
          </li>
          <li>
            Planning: setting tomorrow’s main goal the day before gives +{PLAN_AHEAD_REWARD.xp} Focus XP. Achieving a
            day’s main goal is worth as much as a Medium quest, and each of the first {REWARDED_GOALS} other goals you
            finish that day as much as an Easy one. Nothing is lost for a goal left undone; it can be moved to another
            day.
          </li>
          <li>
            On the Plan page, a habit skipped for a day is passed over: that day neither adds to its streak nor breaks
            it, and it doesn’t count against a flawless day. A habit added for one day only adds to its streak if you
            do it and costs nothing if you don’t. Picking a habit as a priority only changes where it is listed.
          </li>
          <li>
            The week: up to three goals for the week, each worth as much as a Medium quest in Focus XP. Planning a week
            before its Monday is over (a goal for the week and a main goal on at least three days) earns +30 Focus XP
            and +15 gold.
          </li>
          <li>
            Weekly boss: each habit you do in a week hurts it: Trivial 1, Easy 2, Medium 3, Hard 5. It has 70% of
            what the week’s habits could do, so it falls without a perfect week. Beating it by Sunday gives +60 XP and
            +80 gold; if it survives, nothing is lost. Bosses beaten unlock trophies for your heroine in the Shop.
          </li>
          <li>
            Routines only put your habits in an order to run through; they earn nothing of their own.
          </li>
          <li>
            Meals: each meal you planned and then tick as eaten is worth as much as a Trivial quest, in Vitality XP.
            A meal that went differently costs nothing.
          </li>
          <li>
            Your heroine: her mood is the share of habits you did over the last 7 days, the recent days counting most.
            A missed day costs her about one mood and a good day wins one back; today only counts in her favour until
            it is over. She changes nothing about XP, gold or streaks. Click her to see the days she remembers.
          </li>
          <li>
            Her wardrobe, in the Shop: hair, hair pieces, capes and skirts cost gold once and then stay yours. They
            only change how she looks.
          </li>
        </ul>
      </Panel>

      <Panel title="Danger zone">
        <p className="mb-3 text-sm text-mute">Erase the hero and all progress on this device and start again.</p>
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
          Erase everything on this device
        </Button>
      </Panel>

      {confirmReset && (
        <Modal title="Erase everything" onClose={() => setConfirmReset(false)}>
          {syncMode === 'desktop' ? (
            <>
              <p className="text-sm">
                This erases your hero, habits and history from <strong>this PC</strong> and starts a new game.
              </p>
              <p className="mt-2 text-sm text-mute">
                Your save file is not deleted: it is renamed (with “erased” and today’s date in its name) and left in
                the same folder, so you can go back to it. Another device that still has the old game will bring it
                back the next time it syncs to the same file.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                This erases your hero, habits and history from <strong>this device</strong> and stops syncing. It can’t
                be undone here.
              </p>
              <p className="mt-2 text-sm text-mute">
                Your iCloud Drive save file is not touched. If you load it again, your progress comes back; delete that
                file yourself if you want a completely fresh start.
              </p>
            </>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const detach = syncMode === 'desktop' ? retireSaveFile() : disconnectSaveFile();
                void detach.then(resetAll, (err) => toast(err instanceof Error ? err.message : String(err), 'warn'));
                setConfirmReset(false);
              }}
            >
              Erase
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
