import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Heroine } from '../components/Heroine';
import { Button, Panel } from '../components/ui';
import { CLASSES, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { ITEMS, SLOTS, itemById, itemsFor, outfitOf, ownedItems, type Item, type Outfit } from '../game/wardrobe';
import { useDerived } from '../hooks';

/**
 * The heroine's wardrobe: pieces bought with gold that change how she looks on every
 * screen. A piece that isn't owned yet can be tried on before buying.
 */
export function WardrobePanel() {
  const data = useGame((s) => s.data);
  const buyItem = useGame((s) => s.buyItem);
  const wearItem = useGame((s) => s.wearItem);
  const d = useDerived();
  // A piece not owned yet that she is trying on.
  const [trying, setTrying] = useState<string | null>(null);

  const owned = useMemo(() => ownedItems(data), [data]);
  const outfit = useMemo(() => outfitOf(data), [data]);
  const accent = statColor(data.hero ? CLASSES[data.hero.heroClass].stat : 'spi');
  const tried = trying && !owned.has(trying) ? itemById(trying) : undefined;
  const shown: Outfit = tried ? { ...outfit, [tried.slot]: tried } : outfit;

  return (
    <Panel
      title="Her wardrobe"
      className="lg:col-span-2"
      right={
        <span className="text-xs text-mute tabular-nums">
          {owned.size}/{ITEMS.length} pieces
        </span>
      }
    >
      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div>
          <div className="mx-auto h-64 max-w-52 overflow-hidden rounded-xl border border-edge bg-void/50">
            <Heroine mood="cheerful" accent={accent} tone="var(--color-glow)" outfit={shown} className="size-full" />
          </div>
          <div className="mt-3 min-h-20 text-center" aria-live="polite">
            {tried ? (
              <>
                <p className="text-sm">
                  Trying on: <strong>{tried.name}</strong>
                </p>
                <Button
                  variant="gold"
                  className="mt-2 w-full"
                  disabled={d.gold < tried.cost}
                  onClick={() => {
                    buyItem(tried.id);
                    setTrying(null);
                  }}
                >
                  Buy for {tried.cost} gold
                </Button>
                {d.gold < tried.cost && (
                  <p className="mt-1.5 text-xs text-mute">You need {(tried.cost - d.gold).toLocaleString()} more gold.</p>
                )}
              </>
            ) : (
              <p className="text-xs text-mute">
                Click a piece to try it on. What you own is put on at once, and she wears it on every screen.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {SLOTS.map(({ slot, name }) => (
            <section key={slot} aria-label={name}>
              <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-mute uppercase">{name}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
                {itemsFor(slot).map((item) => {
                  const has = owned.has(item.id);
                  const on = outfit[slot].id === item.id;
                  const isTried = tried?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (has) {
                            wearItem(item.id);
                            setTrying(null);
                          } else setTrying(isTried ? null : item.id);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                          on
                            ? 'border-glow bg-glow/10'
                            : isTried
                              ? 'border-gold bg-gold/10'
                              : 'border-edge bg-raise/50 hover:border-mute'
                        }`}
                      >
                        <Swatch item={item} outfit={outfit} accent={accent} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className={`flex items-center gap-1 text-[11px] ${on ? 'text-glow' : has ? 'text-mute' : 'text-gold'}`}>
                            {on && <Check size={11} strokeWidth={3} />}
                            {on ? 'Wearing' : has ? 'Owned' : `${item.cost} gold`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** A small picture of a piece: her face for hair and hair pieces, the cloth for a cape or skirt. */
function Swatch({ item, outfit, accent }: { item: Item; outfit: Outfit; accent: string }) {
  if (item.slot === 'hair' || item.slot === 'clip') {
    return (
      <span className="block size-10 shrink-0 overflow-hidden rounded-full border border-edge bg-void/60">
        <Heroine mood="steady" accent={accent} tone="transparent" outfit={{ ...outfit, [item.slot]: item }} portrait className="size-full" />
      </span>
    );
  }
  const color = (c: string) => (c === 'class' ? accent : c);
  const second = item.slot === 'cape' ? item.colors[2] : item.colors[1];
  return (
    <span
      className="block size-10 shrink-0 rounded-full border border-edge"
      style={{ background: `linear-gradient(135deg, ${color(item.colors[0])} 0 62%, ${color(second)} 62%)` }}
    />
  );
}
