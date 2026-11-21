import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { derive } from './derive';
import { reminderBrief } from './reminder';
import { ITEMS, SLOTS, STARTER_OUTFIT, buyItem, itemsFor, outfitOf, ownedItems, purchaseId, wearItem } from './wardrobe';

const TODAY = '2026-11-20';
const T0 = Date.parse('2026-11-20T09:00:00');
const start = (): SaveData => actions.createHero(emptySave(), 'Tester', 'mage', [], TODAY, T0);
const ids = (d: SaveData) => Object.fromEntries(SLOTS.map(({ slot }) => [slot, outfitOf(d)[slot].id]));

describe('the wardrobe', () => {
  it('has one free piece for every part of her outfit, and unique ids', () => {
    for (const { slot } of SLOTS) expect(itemsFor(slot).filter((i) => i.cost === 0 && i.bosses === undefined)).toHaveLength(1);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('starts with the clothes she arrived in', () => {
    const d = start();
    expect(outfitOf(d)).toEqual(STARTER_OUTFIT);
    expect([...ownedItems(d)].sort()).toEqual(['cape-crimson', 'clip-leaf', 'hair-silver', 'skirt-green']);
  });

  it('buys a piece with gold and puts it on', () => {
    const d = buyItem(start(), 'cape-azure', 500, TODAY, T0 + 1)!;
    expect(ownedItems(d).has('cape-azure')).toBe(true);
    expect(ids(d).cape).toBe('cape-azure');
    expect(d.purchases[purchaseId('cape-azure')]).toMatchObject({ kind: 'item', item: 'cape-azure', cost: 120, date: TODAY });
    // The gold comes off the balance like any other purchase.
    expect(derive(d, TODAY).gold).toBe(-120);
  });

  it('refuses when there is not enough gold', () => {
    expect(buyItem(start(), 'clip-tiara', 299, TODAY, T0 + 1)).toBeNull();
    expect(buyItem(start(), 'clip-tiara', 300, TODAY, T0 + 1)).not.toBeNull();
  });

  it('never charges twice for the same piece', () => {
    let d = buyItem(start(), 'skirt-navy', 500, TODAY, T0 + 1)!;
    d = wearItem(d, 'skirt-green', T0 + 2);
    expect(ids(d).skirt).toBe('skirt-green');
    // Buying it again, even with no gold left, only puts it back on.
    d = buyItem(d, 'skirt-navy', 0, TODAY, T0 + 3)!;
    expect(ids(d).skirt).toBe('skirt-navy');
    expect(Object.keys(d.purchases)).toHaveLength(1);
  });

  it('cannot put on what she does not own, or what does not exist', () => {
    const d = start();
    expect(wearItem(d, 'hair-rose', T0 + 1)).toBe(d);
    expect(wearItem(d, 'no-such-thing', T0 + 1)).toBe(d);
    expect(buyItem(d, 'no-such-thing', 999, TODAY, T0 + 1)).toBe(d);
  });

  it('falls back to her own clothes when the save names a piece she does not own', () => {
    const d: SaveData = { ...start(), wardrobe: { worn: { hair: 'hair-rose', cape: 'gone' }, updatedAt: T0 } };
    expect(outfitOf(d)).toEqual(STARTER_OUTFIT);
  });

  it('survives the save file, and a save from before the wardrobe opens without one', () => {
    const d = buyItem(start(), 'hair-gold', 500, TODAY, T0 + 1)!;
    const back = parseSave(serializeSave(d));
    expect(sameSave(back, d)).toBe(true);
    expect(ids(back).hair).toBe('hair-gold');

    const old = JSON.parse(serializeSave(start()));
    delete old.wardrobe;
    old.version = 8;
    const opened = parseSave(JSON.stringify(old));
    expect(opened.version).toBe(11);
    expect(opened.wardrobe).toBeNull();
    expect(outfitOf(opened)).toEqual(STARTER_OUTFIT);
  });

  it('merges two devices: both purchases are kept, one is paid once, and the latest outfit wins', () => {
    const base = start();
    const pc = buyItem(buyItem(base, 'cape-azure', 999, TODAY, T0 + 100)!, 'clip-star', 999, TODAY, T0 + 110)!;
    const tablet = buyItem(base, 'cape-azure', 999, TODAY, T0 + 200)!;
    const merged = mergeSaves(pc, tablet);
    expect(sameSave(merged, mergeSaves(tablet, pc))).toBe(true);
    expect(ownedItems(merged).has('clip-star')).toBe(true);
    expect(derive(merged, TODAY).gold).toBe(-(120 + 60));
    // The tablet changed her outfit last, and it had not put the star on.
    expect(ids(merged)).toMatchObject({ cape: 'cape-azure', clip: 'clip-leaf' });
  });
});

describe('the reminder notes', () => {
  const EVERY_DAY = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] } as const;
  const withHabits = () => {
    let d = start();
    for (const name of ['Run', 'Read']) {
      d = actions.saveHabit(
        d,
        { name, category: '', stat: 'str', difficulty: 'easy', schedule: { ...EVERY_DAY, days: [...EVERY_DAY.days] }, target: 1 },
        undefined,
        TODAY,
        T0,
      );
    }
    return d;
  };

  it('say what is left today, and cover the days after in case the app stays closed', () => {
    let d = withHabits();
    let brief = reminderBrief(d, TODAY);
    expect(brief.days[TODAY]).toMatchObject({ left: 2, title: '2 habits left today' });
    expect(Object.keys(brief.days)).toHaveLength(8);
    expect(brief.days['2026-11-21']).toMatchObject({ left: 2, title: '2 habits waiting today' });

    d = actions.setHabitCount(d, Object.keys(d.habits)[0], TODAY, 1, T0 + 1);
    brief = reminderBrief(d, TODAY);
    expect(brief.days[TODAY]).toMatchObject({ left: 1, title: '1 habit left today' });

    d = actions.setHabitCount(d, Object.keys(d.habits)[1], TODAY, 1, T0 + 2);
    expect(reminderBrief(d, TODAY).days[TODAY]).toMatchObject({ left: 0, title: 'All done today' });
  });

  it('stay quiet on a day with nothing to do, and before there is a hero', () => {
    expect(reminderBrief(start(), TODAY).days[TODAY]).toMatchObject({ left: 0, title: 'Nothing to do today' });
    expect(reminderBrief(emptySave(), TODAY).days).toEqual({});
  });
});
