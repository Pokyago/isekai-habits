import { ArrowDown, ArrowUp, ListOrdered, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field, IconButton, Modal, Panel, StatIcon, inputClass } from '../components/ui';
import { useGame } from '../data/store';
import type { Routine } from '../data/types';
import { routines } from '../game/routines';

/**
 * Routines on the Habits page: make one, change its habits or their order, or remove it.
 * They are run through from the Today page.
 */
export function RoutineManager() {
  const data = useGame((s) => s.data);
  const list = useMemo(() => routines(data), [data]);
  const [form, setForm] = useState<Routine | 'new' | null>(null);
  const hasHabits = Object.values(data.habits).some((h) => !h.deleted && h.archivedOn === null);
  if (!hasHabits) return null;

  return (
    <>
      <Panel
        title="Routines"
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setForm('new')}>
            <Plus size={16} /> New routine
          </Button>
        }
      >
        {list.length === 0 ? (
          <p className="text-sm text-mute">
            A routine is a few of your habits done one after another, like what you do after waking up. Start it on
            Today and it walks you through them, one at a time.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 3xl:grid-cols-3">
            {list.map((r) => {
              const names = r.habitIds.map((id) => data.habits[id]).filter((h) => h && !h.deleted);
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-xl border border-edge bg-raise/60 py-1.5 pr-1 pl-3">
                  <ListOrdered size={16} className="shrink-0 text-mute" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-[11px] text-mute">{names.map((h) => h.name).join(' → ')}</p>
                  </div>
                  <IconButton label={`Edit ${r.name}`} onClick={() => setForm(r)}>
                    <Pencil size={16} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {form && <RoutineForm routine={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </>
  );
}

function RoutineForm({ routine, onClose }: { routine?: Routine; onClose(): void }) {
  const habits = useGame((s) => s.data.habits);
  const saveRoutine = useGame((s) => s.saveRoutine);
  const deleteRoutine = useGame((s) => s.deleteRoutine);
  const [name, setName] = useState(routine?.name ?? '');
  const [ids, setIds] = useState<string[]>(() => (routine?.habitIds ?? []).filter((id) => habits[id] && !habits[id].deleted));

  const available = Object.values(habits)
    .filter((h) => !h.deleted && h.archivedOn === null && !ids.includes(h.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const valid = name.trim() !== '' && ids.length > 0;
  const move = (i: number, by: number) =>
    setIds((cur) => {
      const next = [...cur];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item);
      return next;
    });

  return (
    <Modal title={routine ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveRoutine({ name, habitIds: ids }, routine?.id);
          onClose();
        }}
      >
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning, Before bed" maxLength={40} autoFocus={!routine} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Habits, in the order you do them</span>
          {ids.length === 0 ? (
            <p className="rounded-lg border border-dashed border-edge px-3 py-3 text-sm text-mute">Add the first habit below.</p>
          ) : (
            <ol className="space-y-1.5">
              {ids.map((id, i) => {
                const h = habits[id];
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg border border-edge bg-raise/60 py-1 pr-1 pl-3">
                    <span className="w-4 shrink-0 text-xs text-mute tabular-nums">{i + 1}</span>
                    <StatIcon stat={h.stat} size={14} />
                    <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                    <IconButton label={`Move ${h.name} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label={`Move ${h.name} down`} onClick={() => move(i, 1)} disabled={i === ids.length - 1}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton label={`Take ${h.name} out`} onClick={() => setIds((cur) => cur.filter((x) => x !== id))}>
                      <X size={14} />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          )}
          {available.length > 0 && (
            <select
              className={`${inputClass} mt-2`}
              aria-label="Add a habit to the routine"
              value=""
              onChange={(e) => e.target.value && setIds((cur) => [...cur, e.target.value])}
            >
              <option value="">Add a habit…</option>
              {available.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1.5 text-xs text-mute">
            On a day when one of them isn’t scheduled, the routine simply leaves it out.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {routine && (
            <Button
              variant="danger"
              onClick={() => {
                deleteRoutine(routine.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> Remove
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {routine ? 'Save changes' : 'Add routine'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
