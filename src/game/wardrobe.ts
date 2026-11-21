import type { DateStr, Purchase, SaveData } from '../data/types';
import { bossesDefeated } from './boss';

/**
 * The heroine's wardrobe: things bought with gold in the Shop that change how she is
 * drawn. What is owned is worked out from the purchases; what she has on is one small
 * record. The drawing itself is in components/Heroine.tsx.
 */
export type Slot = 'hair' | 'clip' | 'cape' | 'skirt';

export const SLOTS: { slot: Slot; name: string }[] = [
  { slot: 'hair', name: 'Hair' },
  { slot: 'clip', name: 'Hair piece' },
  { slot: 'cape', name: 'Cape' },
  { slot: 'skirt', name: 'Skirt' },
];

/** The shapes a hair piece can have. */
export type ClipKind = 'leaf' | 'star' | 'blossom' | 'ribbon' | 'ears' | 'tiara' | 'horns';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  /** In gold. The piece of each slot that costs nothing is the one she starts with. */
  cost: number;
  /** A trophy: it can't be bought, and is hers once this many weekly bosses are beaten. */
  bosses?: number;
  /** Colours, lightest first: hair (fringe, back, brows), cape (cloth, fold, lining), skirt (cloth, pleats). 'class' is the hero's class colour. */
  colors: string[];
  clip?: ClipKind;
}

export const ITEMS: Item[] = [
  { id: 'hair-silver', slot: 'hair', name: 'Silver', cost: 0, colors: ['#eceef6', '#c3c8da', '#8f96ae'] },
  { id: 'hair-gold', slot: 'hair', name: 'Golden', cost: 180, colors: ['#ffe9a8', '#e8bf62', '#b88a2e'] },
  { id: 'hair-rose', slot: 'hair', name: 'Rose', cost: 180, colors: ['#ffd6e2', '#f2a0ba', '#c96a8c'] },
  { id: 'hair-sky', slot: 'hair', name: 'Sky', cost: 180, colors: ['#cfe9ff', '#8fc4f0', '#5a93c8'] },
  { id: 'hair-night', slot: 'hair', name: 'Midnight', cost: 180, colors: ['#666ca6', '#454a80', '#2c305c'] },
  { id: 'hair-ember', slot: 'hair', name: 'Ember', cost: 0, bosses: 6, colors: ['#ff9a66', '#e2603f', '#a83a26'] },

  { id: 'clip-leaf', slot: 'clip', name: 'Gold leaf', cost: 0, colors: [], clip: 'leaf' },
  { id: 'clip-star', slot: 'clip', name: 'Star', cost: 60, colors: [], clip: 'star' },
  { id: 'clip-blossom', slot: 'clip', name: 'Blossom', cost: 60, colors: [], clip: 'blossom' },
  { id: 'clip-ribbon', slot: 'clip', name: 'Red ribbon', cost: 60, colors: [], clip: 'ribbon' },
  { id: 'clip-ears', slot: 'clip', name: 'Cat ears', cost: 250, colors: [], clip: 'ears' },
  { id: 'clip-tiara', slot: 'clip', name: 'Tiara', cost: 300, colors: [], clip: 'tiara' },
  { id: 'clip-horns', slot: 'clip', name: 'Trophy horns', cost: 0, bosses: 1, colors: [], clip: 'horns' },

  { id: 'cape-crimson', slot: 'cape', name: 'Crimson', cost: 0, colors: ['#c9303f', '#9c2232', '#2a428f'] },
  { id: 'cape-azure', slot: 'cape', name: 'Azure', cost: 120, colors: ['#2f6fd6', '#2152a8', '#e9b949'] },
  { id: 'cape-forest', slot: 'cape', name: 'Forest', cost: 120, colors: ['#2f8f5b', '#1f6b42', '#6b4a36'] },
  { id: 'cape-violet', slot: 'cape', name: 'Royal violet', cost: 150, colors: ['#7a4fd0', '#5a36a6', '#2d2f3a'] },
  { id: 'cape-snow', slot: 'cape', name: 'Snow', cost: 150, colors: ['#f1f3fa', '#cfd5e6', '#58b9e6'] },
  { id: 'cape-guild', slot: 'cape', name: 'Guild colours', cost: 200, colors: ['class', 'class', '#2d2f3a'] },
  { id: 'cape-shadow', slot: 'cape', name: 'Shadow cloak', cost: 0, bosses: 3, colors: ['#3a2f4a', '#261d33', '#e23f55'] },

  { id: 'skirt-green', slot: 'skirt', name: 'Green', cost: 0, colors: ['#2e8b78', '#216b5c'] },
  { id: 'skirt-navy', slot: 'skirt', name: 'Navy', cost: 80, colors: ['#3549a0', '#26357a'] },
  { id: 'skirt-wine', slot: 'skirt', name: 'Wine', cost: 80, colors: ['#96304f', '#72223a'] },
  { id: 'skirt-charcoal', slot: 'skirt', name: 'Charcoal', cost: 80, colors: ['#565a6e', '#3f4254'] },
  { id: 'skirt-cream', slot: 'skirt', name: 'Cream', cost: 80, colors: ['#f0e6d2', '#d2c3a2'] },
  { id: 'skirt-royal', slot: 'skirt', name: 'Royal gold', cost: 0, bosses: 10, colors: ['#e9b949', '#c2922c'] },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export const itemById = (id: string): Item | undefined => BY_ID.get(id);
export const itemsFor = (slot: Slot): Item[] => ITEMS.filter((i) => i.slot === slot);
const isStarter = (i: Item) => i.cost === 0 && i.bosses === undefined;
const starter = (slot: Slot): Item => ITEMS.find((i) => i.slot === slot && isStarter(i))!;

/** One piece for each slot. */
export type Outfit = Record<Slot, Item>;

export const STARTER_OUTFIT: Outfit = {
  hair: starter('hair'),
  clip: starter('clip'),
  cape: starter('cape'),
  skirt: starter('skirt'),
};

/** A purchase of a wardrobe piece has a fixed id, so buying it on two devices pays for it once. */
export const purchaseId = (itemId: string) => `item|${itemId}`;

/** Everything she has: the pieces she starts with, the ones bought, and the trophies of the bosses beaten. */
export function ownedItems(data: SaveData): Set<string> {
  const beaten = bossesDefeated(data);
  const owned = new Set(ITEMS.filter((i) => isStarter(i) || (i.bosses !== undefined && i.bosses <= beaten)).map((i) => i.id));
  for (const p of Object.values(data.purchases)) {
    if (p.kind === 'item' && p.item && BY_ID.has(p.item)) owned.add(p.item);
  }
  return owned;
}

/** What she has on. A piece that isn't owned (or no longer exists) falls back to the one she starts with. */
export function outfitOf(data: SaveData): Outfit {
  const owned = ownedItems(data);
  const outfit = { ...STARTER_OUTFIT };
  for (const { slot } of SLOTS) {
    const item = BY_ID.get(data.wardrobe?.worn[slot] ?? '');
    if (item && item.slot === slot && owned.has(item.id)) outfit[slot] = item;
  }
  return outfit;
}

/** Puts on a piece she owns. */
export function wearItem(data: SaveData, itemId: string, now: number): SaveData {
  const item = BY_ID.get(itemId);
  if (!item || !ownedItems(data).has(itemId)) return data;
  if (outfitOf(data)[item.slot].id === itemId && data.wardrobe?.worn[item.slot] === itemId) return data;
  const prev = data.wardrobe;
  return {
    ...data,
    wardrobe: {
      worn: { ...prev?.worn, [item.slot]: itemId },
      updatedAt: Math.max(now, (prev?.updatedAt ?? 0) + 1),
    },
  };
}

/**
 * Buys a piece and puts it on. Returns null when there isn't enough gold.
 * A piece already owned is simply put on.
 */
export function buyItem(data: SaveData, itemId: string, gold: number, date: DateStr, now: number): SaveData | null {
  const item = BY_ID.get(itemId);
  if (!item) return data;
  if (ownedItems(data).has(itemId)) return wearItem(data, itemId, now);
  // A trophy has to be won.
  if (item.bosses !== undefined) return data;
  if (gold < item.cost) return null;
  const slotName = SLOTS.find((s) => s.slot === item.slot)!.name.toLowerCase();
  const purchase: Purchase = {
    id: purchaseId(itemId),
    kind: 'item',
    item: itemId,
    name: `${item.name} (${slotName})`,
    cost: item.cost,
    date,
    updatedAt: now,
  };
  return wearItem({ ...data, purchases: { ...data.purchases, [purchase.id]: purchase } }, itemId, now);
}
