import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { moneyDue } from '../plan/plan';
import * as money from './actions';
import type { SubscriptionInput } from './actions';
import { fixedCosts, floatingCharges, subscriptionTotals, upcomingCharges } from './subscriptions';

const TODAY = '2026-11-20';
const T0 = Date.parse('2026-11-01T09:00:00');

function start(): SaveData {
  const d = actions.createHero(emptySave(), 'Tester', 'mage', [], '2026-11-01', T0);
  return money.setupMoney(d, 100_000, null, 'BRL', '2026-11-01', T0);
}

const bill = (over: Partial<SubscriptionInput>): SubscriptionInput => ({
  name: 'Bill',
  amount: 10_000,
  cycle: 'monthly',
  anchor: TODAY,
  paidWith: 'manual',
  active: true,
  note: '',
  type: 'bill',
  ...over,
});

const only = (d: SaveData) => Object.values(d.subscriptions)[0];

describe('a monthly expense with no set day', () => {
  it('counts in the totals but has no due date', () => {
    let d = start();
    d = money.saveSubscription(d, bill({ name: 'Cleaner', amount: 30_000, floating: true }), undefined, TODAY, T0 + 1);
    d = money.saveSubscription(d, bill({ name: 'Gym', amount: 12_000, anchor: '2026-11-25' }), undefined, TODAY, T0 + 2);

    expect(subscriptionTotals(d, 'bill')).toMatchObject({ count: 2, perMonth: 42_000 });
    expect(fixedCosts(d, TODAY).perMonth).toBe(42_000);
    expect(upcomingCharges(d, TODAY, 'bill').map((u) => u.sub.name)).toEqual(['Gym']);
    expect(floatingCharges(d, 'bill').map((s) => s.name)).toEqual(['Cleaner']);
    expect(floatingCharges(d, 'subscription')).toEqual([]);
  });

  it('never adds an entry by itself, and is not shown on a day of the plan', () => {
    let d = start();
    // Asked to add the entry, but there is no day to add it on: it becomes "just track".
    d = money.saveSubscription(d, bill({ name: 'Cleaner', floating: true, paidWith: 'bank' }), undefined, TODAY, T0 + 1);
    expect(only(d)).toMatchObject({ floating: true, paidWith: 'manual' });

    const later = money.housekeep(d, '2027-03-01', T0 + 2);
    expect(Object.values(later.transactions)).toEqual([]);
    // The day it was added on is not a due date.
    expect(moneyDue(d, TODAY)).toEqual([]);
    expect(moneyDue(d, '2026-12-20')).toEqual([]);
  });

  it('can be given a day later, and a dated one can lose its day', () => {
    let d = start();
    d = money.saveSubscription(d, bill({ name: 'Cleaner', floating: true }), undefined, TODAY, T0 + 1);
    const id = only(d).id;

    d = money.saveSubscription(d, bill({ name: 'Cleaner', floating: false, anchor: '2026-11-28', paidWith: 'bank' }), id, TODAY, T0 + 2);
    expect(only(d).floating).toBeUndefined();
    expect(only(d).paidWith).toBe('bank');
    expect(upcomingCharges(d, TODAY, 'bill').map((u) => u.date)).toEqual(['2026-11-28']);
    expect(moneyDue(d, '2026-11-28').map((m) => m.name)).toEqual(['Cleaner']);

    d = money.saveSubscription(d, bill({ name: 'Cleaner', floating: true, paidWith: 'bank' }), id, TODAY, T0 + 3);
    expect(upcomingCharges(d, TODAY, 'bill')).toEqual([]);
    expect(floatingCharges(d, 'bill')).toHaveLength(1);
  });

  it('lists the monthly ones before the yearly ones, and survives the save file', () => {
    let d = start();
    d = money.saveSubscription(d, bill({ name: 'Car tax', cycle: 'yearly', amount: 120_000, floating: true }), undefined, TODAY, T0 + 1);
    d = money.saveSubscription(d, bill({ name: 'Water', floating: true }), undefined, TODAY, T0 + 2);
    d = money.saveSubscription(d, bill({ name: 'Barber', floating: true }), undefined, TODAY, T0 + 3);
    expect(floatingCharges(d).map((s) => s.name)).toEqual(['Barber', 'Water', 'Car tax']);
    // A yearly one is still spread over twelve months.
    expect(subscriptionTotals(d, 'bill').perMonth).toBe(10_000 + 10_000 + 10_000);

    const back = parseSave(serializeSave(d));
    expect(sameSave(back, d)).toBe(true);
    expect(floatingCharges(back)).toHaveLength(3);
  });
});
