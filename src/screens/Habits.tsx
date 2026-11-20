import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { HabitForm } from '../components/HabitForm';
import { Button, Chip, Empty, IconButton, Modal, Panel, StatIcon } from '../components/ui';
import { DIFFICULTIES, STATS, STAT_ORDER, statColor } from '../data/meta';
import { useGame } from '../data/store';
import type { Habit } from '../data/types';
import { scheduleLabel } from '../game/schedule';

export function Habits() {
  const habits = useGame((s) => s.data.habits);
  const saveHabit = useGame((s) => s.saveHabit);
  const setArchived = useGame((s) => s.setArchived);
  const deleteHabit = useGame((s) => s.deleteHabit);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const all = Object.values(habits).filter((h) => !h.deleted);
  const active = all.filter((h) => h.archivedOn === null);
  const archived = all.filter((h) => h.archivedOn !== null).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Habits</h1>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> New habit
        </Button>
      </div>

      {active.length === 0 && (
        <Panel>
          <Empty>No habits yet. Create one to start training your hero.</Empty>
        </Panel>
      )}

      {STAT_ORDER.map((stat) => {
        const group = active.filter((h) => h.stat === stat).sort((a, b) => a.name.localeCompare(b.name));
        if (group.length === 0) return null;
        return (
          <Panel
            key={stat}
            title={STATS[stat].name}
            right={<StatIcon stat={stat} />}
          >
            <ul className="space-y-2">
              {group.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-xl border border-edge bg-raise/60 py-1.5 pr-1 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Chip color={statColor(h.stat)}>{DIFFICULTIES[h.difficulty].name}</Chip>
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
