import { get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { todayStr } from '../game/dates';
import * as wardrobe from '../game/wardrobe';
import { derive } from '../game/derive';
import type { DayChoice } from '../game/schedule';
import { STATS, STAT_ORDER } from './meta';
import * as actions from './actions';
import type { HabitInput } from './actions';
import { useFx } from './fx';
import { emptySave, parseSave, serializeSave } from './merge';
import * as health from '../health/health';
import type { CheckInInput } from '../health/health';
import * as meals from '../plan/meals';
import * as plan from '../plan/plan';
import type { PlanInput } from '../plan/plan';
import * as money from '../money/actions';
import type { DebtInput, GoalInput, RecurringInput, SubscriptionInput, TxInput } from '../money/actions';
import * as cards from '../money/cardActions';
import type { CardInput, PurchaseInput } from '../money/cardActions';
import type { ImportRow } from '../money/statement';
import type { HabitTemplate } from './templates';
import type { DateStr, Difficulty, HeroClass, MealSlot, MonthStr, SaveData, StatKey } from './types';

const DB_KEY = 'isekai-habits-save';

interface GameState {
  data: SaveData;
  loaded: boolean;
  load(): Promise<void>;
  /** Swaps in a whole save, e.g. after merging with the sync file. */
  replaceData(data: SaveData): void;
  createHero(name: string, heroClass: HeroClass, templates: HabitTemplate[]): void;
  renameHero(name: string): void;
  saveHabit(input: HabitInput, id?: string): void;
  addTemplates(templates: HabitTemplate[]): void;
  setArchived(id: string, archived: boolean): void;
  deleteHabit(id: string): void;
  setHabitCount(habitId: string, date: DateStr, count: number): void;
  addQuest(title: string, stat: StatKey, difficulty: Difficulty): void;
  toggleQuest(id: string, date: DateStr): void;
  deleteQuest(id: string): void;
  saveReward(name: string, cost: number, id?: string): void;
  deleteReward(id: string): void;
  buyReward(id: string): void;
  buyShield(): void;
  /** Buys a piece of the heroine's wardrobe and puts it on. */
  buyItem(itemId: string): void;
  wearItem(itemId: string): void;
  resetAll(): void;

  // Money
  setupMoney(openingBalance: number, budget: number | null, currency: string): void;
  updateMoney(patch: { budget?: number | null; currency?: string }): void;
  saveTransaction(input: TxInput, id?: string): void;
  deleteTransaction(id: string): void;
  correctBalance(actual: number, date?: DateStr): void;
  saveRecurring(input: RecurringInput, id?: string): void;
  deleteRecurring(id: string): void;
  saveSubscription(input: SubscriptionInput, id?: string): void;
  deleteSubscription(id: string): void;
  saveGoal(input: GoalInput, id?: string): void;
  deleteGoal(id: string): void;
  saveDebt(input: DebtInput, id?: string): void;
  deleteDebt(id: string): void;
  importRows(rows: ImportRow[]): void;
  // Credit cards
  saveCard(input: CardInput, id?: string): void;
  deleteCard(id: string): void;
  /** Something bought on a card, in one or more monthly parts. */
  addPurchase(input: PurchaseInput): void;
  /** Removes every part of a purchase made in instalments. */
  deletePlan(planId: string): void;
  payBill(cardId: string, month: MonthStr, amount: number, date: DateStr): void;
  // Health
  saveCheckIn(input: CheckInInput): void;
  deleteCheckIn(id: string): void;
  saveHealthProfile(profile: { heightCm: number | null; goalWeight: number | null }): void;
  saveSleep(date: DateStr, hours: number): void;
  deleteSleep(date: DateStr): void;
  // Planning
  setMainGoal(date: DateStr, title: string): void;
  addPlanItem(date: DateStr, input: PlanInput): void;
  updatePlanItem(id: string, input: PlanInput): void;
  togglePlanItem(id: string): void;
  deletePlanItem(id: string): void;
  movePlanItem(id: string, toDate: DateStr): void;
  saveDay(date: DateStr, patch: { wake?: string | null; bed?: string | null; note?: string }): void;
  setHabitChoice(habitId: string, date: DateStr, choice: DayChoice | null): void;
  planQuest(questId: string, date: DateStr | null): void;
  setMeal(date: DateStr, slot: MealSlot, text: string): void;
  toggleMeal(id: string): void;
  /** Fills the empty meals of one day with those of another. */
  copyMeals(from: DateStr, to: DateStr): void;

  /** Adds monthly items that have come due and settles rewards. Called on start and when the day changes. */
  tick(): void;
}

/** Applies a change, then announces any XP, gold, stat levels or hero levels it earned. */
function withFeedback(before: SaveData, after: SaveData): void {
  if (before === after) return;
  const today = todayStr();
  const a = derive(before, today);
  const b = derive(after, today);
  const fx = useFx.getState();

  const xp = b.heroXp - a.heroXp;
  const gold = b.goldEarned - a.goldEarned;
  if (xp > 0 || gold > 0) fx.toast(`+${xp} XP   +${gold} gold`, 'reward');

  for (const s of STAT_ORDER) {
    if (b.stats[s].level > a.stats[s].level) fx.toast(`${STATS[s].name} rose to level ${b.stats[s].level}`, 'info');
  }
  const earned = new Set(a.achievements.filter((x) => x.earned).map((x) => x.id));
  for (const x of b.achievements) {
    if (x.earned && !earned.has(x.id)) fx.toast(`Title earned: ${x.title}`, 'info');
  }
  if (b.level.level > a.level.level) {
    fx.showLevelUp({ level: b.level.level, rank: b.rank, rankUp: b.rank !== a.rank });
  }
}

export const useGame = create<GameState>((set, get) => {
  const apply = (fn: (data: SaveData) => SaveData, feedback = false) => {
    const before = get().data;
    const after = fn(before);
    if (after === before) return;
    set({ data: after });
    if (feedback) withFeedback(before, after);
  };
  /** A money change, followed by anything it makes due (monthly items, rewards). */
  const applyMoney = (fn: (data: SaveData) => SaveData) =>
    apply((d) => money.housekeep(fn(d), todayStr(), Date.now()), true);

  return {
    data: emptySave(),
    loaded: false,

    async load() {
      let data = emptySave();
      try {
        const stored = await idbGet<string>(DB_KEY);
        if (typeof stored === 'string') data = parseSave(stored);
      } catch (err) {
        console.error('Could not read the saved game', err);
      }
      set({ data: money.housekeep(data, todayStr(), Date.now()), loaded: true });
      // Ask the browser not to clear this site's storage when space runs low.
      void navigator.storage?.persist?.().catch(() => undefined);
    },

    replaceData(data) {
      set({ data: money.housekeep(data, todayStr(), Date.now()) });
    },

    createHero(name, heroClass, templates) {
      apply((d) => actions.createHero(d, name, heroClass, templates, todayStr(), Date.now()));
    },
    renameHero(name) {
      apply((d) => actions.renameHero(d, name, Date.now()));
    },
    saveHabit(input, id) {
      apply((d) => actions.saveHabit(d, input, id, todayStr(), Date.now()));
    },
    addTemplates(templates) {
      apply((d) => actions.addTemplates(d, templates, todayStr(), Date.now()));
    },
    setArchived(id, archived) {
      apply((d) => actions.setArchived(d, id, archived, todayStr(), Date.now()));
    },
    deleteHabit(id) {
      apply((d) => actions.deleteHabit(d, id, Date.now()));
    },
    setHabitCount(habitId, date, count) {
      apply((d) => actions.setHabitCount(d, habitId, date, count, Date.now()), true);
    },
    addQuest(title, stat, difficulty) {
      apply((d) => actions.addQuest(d, title, stat, difficulty, Date.now()));
    },
    toggleQuest(id, date) {
      apply((d) => actions.toggleQuest(d, id, date, Date.now()), true);
    },
    deleteQuest(id) {
      apply((d) => actions.deleteQuest(d, id, Date.now()));
    },
    saveReward(name, cost, id) {
      apply((d) => actions.saveReward(d, name, cost, id, Date.now()));
    },
    deleteReward(id) {
      apply((d) => actions.deleteReward(d, id, Date.now()));
    },
    buyReward(id) {
      const d = get().data;
      const next = actions.buyReward(d, id, derive(d, todayStr()).gold, todayStr(), Date.now());
      if (!next) return useFx.getState().toast('Not enough gold', 'warn');
      set({ data: next });
      useFx.getState().toast(`Enjoy: ${d.rewards[id].name}`, 'reward');
    },
    buyShield() {
      const d = get().data;
      const next = actions.buyShield(d, derive(d, todayStr()).gold, todayStr(), Date.now());
      if (!next) return useFx.getState().toast('Not enough gold', 'warn');
      set({ data: next });
      useFx.getState().toast('Streak shield acquired', 'reward');
    },
    buyItem(itemId) {
      const d = get().data;
      const next = wardrobe.buyItem(d, itemId, derive(d, todayStr()).gold, todayStr(), Date.now());
      if (!next) return useFx.getState().toast('Not enough gold', 'warn');
      if (next === d) return;
      set({ data: next });
      useFx.getState().toast(`A new look: ${wardrobe.itemById(itemId)?.name ?? ''}`, 'reward');
    },
    wearItem(itemId) {
      apply((d) => wardrobe.wearItem(d, itemId, Date.now()));
    },
    resetAll() {
      set({ data: emptySave() });
    },

    setupMoney(openingBalance, budget, currency) {
      applyMoney((d) => money.setupMoney(d, openingBalance, budget, currency, todayStr(), Date.now()));
    },
    updateMoney(patch) {
      applyMoney((d) => money.updateMoney(d, patch, Date.now()));
    },
    saveTransaction(input, id) {
      applyMoney((d) => money.saveTransaction(d, input, id, todayStr(), Date.now()));
    },
    deleteTransaction(id) {
      applyMoney((d) => money.deleteTransaction(d, id, Date.now()));
    },
    correctBalance(actual, date) {
      applyMoney((d) => money.correctBalance(d, actual, date ?? todayStr(), Date.now()));
    },
    saveRecurring(input, id) {
      applyMoney((d) => money.saveRecurring(d, input, id, Date.now()));
    },
    deleteRecurring(id) {
      applyMoney((d) => money.deleteRecurring(d, id, Date.now()));
    },
    saveSubscription(input, id) {
      applyMoney((d) => money.saveSubscription(d, input, id, todayStr(), Date.now()));
    },
    deleteSubscription(id) {
      applyMoney((d) => money.deleteSubscription(d, id, Date.now()));
    },
    saveGoal(input, id) {
      applyMoney((d) => money.saveGoal(d, input, id, Date.now()));
    },
    deleteGoal(id) {
      applyMoney((d) => money.deleteGoal(d, id, Date.now()));
    },
    saveDebt(input, id) {
      applyMoney((d) => money.saveDebt(d, input, id, Date.now()));
    },
    deleteDebt(id) {
      applyMoney((d) => money.deleteDebt(d, id, Date.now()));
    },
    saveCard(input, id) {
      applyMoney((d) => cards.saveCard(d, input, id, Date.now()));
    },
    deleteCard(id) {
      apply((d) => cards.deleteCard(d, id, Date.now()));
    },
    addPurchase(input) {
      applyMoney((d) => cards.addPurchase(d, input, todayStr(), Date.now()));
    },
    deletePlan(planId) {
      applyMoney((d) => cards.deletePlan(d, planId, Date.now()));
    },
    payBill(cardId, month, amount, date) {
      applyMoney((d) => cards.payBill(d, cardId, month, amount, date, todayStr(), Date.now()));
    },
    importRows(rows) {
      applyMoney((d) => money.importRows(d, rows, todayStr(), Date.now()));
    },
    saveCheckIn(input) {
      apply((d) => health.saveCheckIn(d, input, todayStr(), Date.now()), true);
    },
    deleteCheckIn(id) {
      apply((d) => health.deleteCheckIn(d, id, Date.now()));
    },
    saveHealthProfile(profile) {
      apply((d) => health.saveHealthProfile(d, profile, Date.now()));
    },
    saveSleep(date, hours) {
      apply((d) => health.saveSleep(d, date, hours, todayStr(), Date.now()), true);
    },
    deleteSleep(date) {
      apply((d) => health.deleteSleep(d, date, Date.now()));
    },
    setMainGoal(date, title) {
      apply((d) => plan.setMainGoal(d, date, title, todayStr(), Date.now()), true);
    },
    addPlanItem(date, input) {
      apply((d) => plan.addPlanItem(d, date, input, Date.now()));
    },
    updatePlanItem(id, input) {
      apply((d) => plan.updatePlanItem(d, id, input, Date.now()));
    },
    togglePlanItem(id) {
      apply((d) => plan.togglePlanItem(d, id, todayStr(), Date.now()), true);
    },
    deletePlanItem(id) {
      apply((d) => plan.deletePlanItem(d, id, Date.now()));
    },
    movePlanItem(id, toDate) {
      apply((d) => plan.movePlanItem(d, id, toDate, Date.now()));
    },
    saveDay(date, patch) {
      apply((d) => plan.saveDay(d, date, patch, Date.now()));
    },
    setHabitChoice(habitId, date, choice) {
      apply((d) => plan.setHabitChoice(d, habitId, date, choice, todayStr(), Date.now()));
    },
    planQuest(questId, date) {
      apply((d) => plan.planQuest(d, questId, date, Date.now()));
    },
    setMeal(date, slot, text) {
      apply((d) => meals.setMeal(d, date, slot, text, todayStr(), Date.now()));
    },
    toggleMeal(id) {
      apply((d) => meals.toggleMeal(d, id, todayStr(), Date.now()), true);
    },
    copyMeals(from, to) {
      apply((d) => meals.copyMeals(d, from, to, todayStr(), Date.now()));
    },
    tick() {
      applyMoney((d) => d);
    },
  };
});

// Save to the device after every change.
useGame.subscribe((state, prev) => {
  if (!state.loaded || state.data === prev.data) return;
  idbSet(DB_KEY, serializeSave(state.data)).catch((err) => console.error('Could not save the game', err));
});
