import { Coins, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Empty, Field, IconButton, Modal, Panel, inputBase, inputClass } from '../components/ui';
import { SHIELD_COST } from '../data/meta';
import { useGame } from '../data/store';
import type { Reward } from '../data/types';
import { useDerived } from '../hooks';
import { formatShort } from '../game/dates';

export function Shop() {
  const rewards = useGame((s) => s.data.rewards);
  const purchases = useGame((s) => s.data.purchases);
  const buyReward = useGame((s) => s.buyReward);
  const buyShield = useGame((s) => s.buyShield);
  const deleteReward = useGame((s) => s.deleteReward);
  const d = useDerived();
  const [editing, setEditing] = useState<Reward | 'new' | null>(null);

  const list = Object.values(rewards)
    .filter((r) => !r.deleted)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  const history = Object.values(purchases)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex items-center justify-between lg:col-span-2">
        <h1 className="font-display text-2xl font-bold">Shop</h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/60 bg-gold/10 px-4 py-1.5 font-display text-xl font-bold text-gold tabular-nums">
          <Coins size={18} /> {d.gold.toLocaleString()}
        </span>
      </div>

      <Panel title="Adventurer’s supplies">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-glow/50 bg-glow/10 text-glow">
            <Shield size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Streak shield <span className="font-normal text-mute">· you hold {d.shieldsLeft}</span>
            </p>
            <p className="text-sm text-mute">
              Used automatically on a day you miss, so your streaks survive. It must be held before the miss.
            </p>
          </div>
          <Button variant="gold" onClick={buyShield} disabled={d.gold < SHIELD_COST}>
            {SHIELD_COST} gold
          </Button>
        </div>
      </Panel>

      <Panel
        title="Rewards"
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setEditing('new')}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        <p className="mb-3 text-sm text-mute">Real-life treats you pay for with the gold your habits earn.</p>
        {list.length === 0 ? (
          <Empty>No rewards yet. Add something worth working for.</Empty>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-xl border border-edge bg-raise/60 py-1.5 pr-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                <IconButton label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton label={`Delete ${r.name}`} onClick={() => deleteReward(r.id)}>
                  <Trash2 size={15} />
                </IconButton>
                <Button variant="gold" className="min-w-24" onClick={() => buyReward(r.id)} disabled={d.gold < r.cost}>
                  {r.cost} gold
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {history.length > 0 && (
        <Panel title="Recent purchases">
          <ul className="divide-y divide-edge/50 text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 text-mute tabular-nums">
                  {formatShort(p.date)} · −{p.cost} gold
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && <RewardForm reward={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RewardForm({ reward, onClose }: { reward?: Reward; onClose(): void }) {
  const saveReward = useGame((s) => s.saveReward);
  const [name, setName] = useState(reward?.name ?? '');
  const [cost, setCost] = useState(reward?.cost ?? 100);
  const valid = name.trim().length > 0 && cost >= 1;

  return (
    <Modal title={reward ? 'Edit reward' : 'New reward'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveReward(name, cost, reward?.id);
          onClose();
        }}
      >
        <Field label="Reward">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Order takeaway"
            maxLength={60}
            autoFocus={!reward}
          />
        </Field>
        <Field label="Price in gold">
          <input
            type="number"
            min={1}
            max={100000}
            className={`${inputBase} w-32`}
            value={cost}
            onChange={(e) => setCost(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
        </Field>
        <p className="text-xs text-mute">A full day of habits earns roughly 50–120 gold, depending on how many you keep.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {reward ? 'Save changes' : 'Add reward'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
