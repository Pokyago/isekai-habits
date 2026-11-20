import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DIFFICULTIES, statColor } from '../data/meta';
import { TEMPLATE_GROUPS } from '../data/templates';
import { scheduleLabel } from '../game/schedule';
import { Chip, StatIcon, inputClass } from './ui';

/**
 * The habit library as a list of categories that open and close, with a search box.
 * `picked` holds template keys. `taken` holds the lower-case names of habits the
 * user already has, which are shown as added and can't be picked again.
 */
export function TemplatePicker({
  picked,
  onToggle,
  taken,
}: {
  picked: Set<string>;
  onToggle(key: string): void;
  taken?: Set<string>;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      TEMPLATE_GROUPS.map((g) => ({
        ...g,
        shown: q ? g.templates.filter((t) => t.name.toLowerCase().includes(q)) : g.templates,
      })).filter((g) => g.shown.length > 0),
    [q],
  );

  const toggleOpen = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" />
        <input
          className={`${inputClass} pl-9`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search habits"
          aria-label="Search habits"
        />
      </div>

      {groups.length === 0 && <p className="py-3 text-center text-sm text-mute">Nothing matches “{query}”.</p>}

      {groups.map(({ category, templates, shown }) => {
        const count = templates.filter((t) => picked.has(t.key)).length;
        const expanded = q !== '' || open.has(category.id);
        return (
          <section key={category.id} className="rounded-xl border border-edge/70 bg-void/30">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleOpen(category.id)}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left"
            >
              <StatIcon stat={category.stat} size={16} />
              <span className="flex-1 text-sm font-semibold">{category.name}</span>
              <span className={`text-xs tabular-nums ${count > 0 ? 'font-semibold text-glow' : 'text-mute'}`}>
                {count > 0 ? `${count} picked` : templates.length}
              </span>
              <ChevronDown size={16} className={`text-mute transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <ul className="space-y-1.5 px-2 pb-2">
                {shown.map((t) => {
                  const has = taken?.has(t.name.toLowerCase()) ?? false;
                  const on = picked.has(t.key);
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={has || on}
                        disabled={has}
                        onClick={() => onToggle(t.key)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                          has
                            ? 'border-edge/40 opacity-50'
                            : on
                              ? 'border-glow/70 bg-glow/10'
                              : 'border-edge/70 bg-void/40 hover:border-mute'
                        }`}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                            has || on ? 'border-glow bg-glow text-void' : 'border-mute'
                          }`}
                        >
                          {(has || on) && <Check size={14} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{t.name}</span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {has ? (
                            <Chip>added</Chip>
                          ) : (
                            <>
                              <Chip color={statColor(t.stat)}>{DIFFICULTIES[t.difficulty].name}</Chip>
                              <Chip>{scheduleLabel(t.schedule)}</Chip>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
