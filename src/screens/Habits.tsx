import { Archive, ArchiveRestore, Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HabitForm } from '../components/HabitForm';
import { TemplatePicker } from '../components/TemplatePicker';
import { Button, Chip, Empty, IconButton, Modal, Panel, StatIcon } from '../components/ui';
import { HABIT_CATEGORIES } from '../data/habitCategories';
import { DIFFICULTIES, STATS, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { ALL_TEMPLATES, categoryOf } from '../data/templates';
import type { Habit } from '../data/types';
import { scheduleLabel } from '../game/schedule';
import { RoutineManager } from './Routines';

export function Habits() {
  const habits = useGame((s) => s.data.habits);
  const saveHabit = useGame((s) => s.saveHabit);
  const setArchived = useGame((s) => s.setArchived);
  const deleteHabit = useGame((s) => s.deleteHabit);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const all = Object.values(habits).filter((h) => !h.deleted);
  const active = all.filter((h) => h.archivedOn === null);
  const archived = all.filter((h) => h.archivedOn !== null).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Habits</h1>
        <div className="flex gap-2">
          <Button onClick={() => setBrowsing(true)}>
            <Library size={16} /> Library
          </Button>
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> New habit
          </Button>
        </div>
      </div>

      {active.length === 0 && (
        <Panel>
          <Empty>No habits yet. Pick some from the library, or create your own.</Empty>
        </Panel>
      )}

      <RoutineManager />

      <div className="grid items-start gap-4 lg:grid-cols-2 3xl:grid-cols-3">
      {HABIT_CATEGORIES.map((category) => {
        const group = active.filter((h) => categoryOf(h) === category.id).sort((a, b) => a.name.localeCompare(b.name));
        if (group.length === 0) return null;
        return (
          <Panel key={category.id} title={category.name} right={<span className="text-xs text-mute">{group.length}</span>}>
            <ul className="space-y-2">
              {group.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-xl border border-edge bg-raise/60 py-1.5 pr-1 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Chip color={statColor(h.stat)}>
                        <StatIcon stat={h.stat} size={11} />
                        {STATS[h.stat].short}
                      </Chip>
                      <Chip>{DIFFICULTIES[h.difficulty].name}</Chip>
                      <Chip>{scheduleLabel(h.schedule)}</Chip>
                      {h.target > 1 && <Chip>{h.target}× a day</Chip>}
                    </div>
                  </div>
                  <IconButton label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Archive ${h.name}`} onClick={() => setArchived(h.id, true)}>
                    <Archive size={16} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
      </div>

      {archived.length > 0 && (
        <Panel title="Archived">
          <p className="mb-3 text-sm text-mute">Archived habits are paused. Their history and XP are kept.</p>
          <ul className="space-y-2">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-xl border border-edge/60 bg-void/40 py-1.5 pr-1 pl-3">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-mute">
                  <StatIcon stat={h.stat} size={14} />
                  <span className="truncate">{h.name}</span>
                </span>
                <IconButton label={`Restore ${h.name}`} onClick={() => setArchived(h.id, false)}>
                  <ArchiveRestore size={16} />
                </IconButton>
                <IconButton label={`Delete ${h.name}`} onClick={() => setDeleting(h)}>
                  <Trash2 size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <HabitForm
          habit={editing === 'new' ? undefined : editing}
          onSave={(input) => saveHabit(input, editing === 'new' ? undefined : editing.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {browsing && <LibraryDialog active={active} onClose={() => setBrowsing(false)} />}

      {deleting && (
        <Modal title="Delete habit" onClose={() => setDeleting(null)}>
          <p className="text-sm">
            Delete <strong>{deleting.name}</strong> for good? It can’t be restored afterwards. The XP it already earned
            is kept.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteHabit(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The habit library: tick any number of ready-made habits and add them in one go. */
function LibraryDialog({ active, onClose }: { active: Habit[]; onClose(): void }) {
  const addTemplates = useGame((s) => s.addTemplates);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const taken = useMemo(() => new Set(active.map((h) => h.name.toLowerCase())), [active]);

  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Modal title="Habit library" onClose={onClose}>
      <p className="mb-3 text-sm text-mute">
        {ALL_TEMPLATES.length} ready-made habits. Tick the ones you want; you can change any of them afterwards. A few
        you keep beat many you drop.
      </p>
      <TemplatePicker picked={picked} onToggle={toggle} taken={taken} />
      <div className="sticky bottom-0 -mx-4 mt-3 flex items-center justify-end gap-2 border-t border-edge/70 bg-panel px-4 pt-3 pb-1">
        <span className="flex-1 text-sm text-mute">{picked.size} picked</span>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={picked.size === 0}
          onClick={() => {
            addTemplates(ALL_TEMPLATES.filter((t) => picked.has(t.key)));
            onClose();
          }}
        >
          Add {picked.size > 0 ? picked.size : ''} {picked.size === 1 ? 'habit' : 'habits'}
        </Button>
      </div>
    </Modal>
  );
}
