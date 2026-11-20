export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface AchievementInput {
  completions: number;
  bestDayStreak: number;
  heroLevel: number;
  topStatLevel: number;
  perfectDays: number;
  goldEarned: number;
  rewardsBought: number;
  questsDone: number;
  /** Days on which spending was logged. */
  ledgerDays: number;
  budgetsKept: number;
  goalsReached: number;
  debtsCleared: number;
}

export function achievements(a: AchievementInput): Achievement[] {
  const list: [string, string, string, boolean][] = [
    ['first-step', 'First Step', 'Complete your first habit', a.completions >= 1],
    ['apprentice', 'Apprentice', 'Complete 10 habits', a.completions >= 10],
    ['seasoned', 'Seasoned Adventurer', 'Complete 100 habits', a.completions >= 100],
    ['veteran', 'Veteran', 'Complete 500 habits', a.completions >= 500],
    ['streak-7', 'Week of Resolve', 'Reach a 7-day streak', a.bestDayStreak >= 7],
    ['streak-30', 'Unbroken Moon', 'Reach a 30-day streak', a.bestDayStreak >= 30],
    ['streak-100', 'Hundred Days’ Vow', 'Reach a 100-day streak', a.bestDayStreak >= 100],
    ['flawless', 'Flawless Day', 'Complete every scheduled habit in a day', a.perfectDays >= 1],
    ['flawless-10', 'Disciplined', 'Have 10 flawless days', a.perfectDays >= 10],
    ['level-5', 'E-Rank Adventurer', 'Reach level 5', a.heroLevel >= 5],
    ['level-10', 'D-Rank Adventurer', 'Reach level 10', a.heroLevel >= 10],
    ['level-20', 'B-Rank Adventurer', 'Reach level 20', a.heroLevel >= 20],
    ['specialist', 'Specialist', 'Raise any stat to level 5', a.topStatLevel >= 5],
    ['master', 'Master', 'Raise any stat to level 10', a.topStatLevel >= 10],
    ['quest', 'Guild Member', 'Finish a quest from your quest log', a.questsDone >= 1],
    ['hoard', 'Coin Hoarder', 'Earn 1,000 gold in total', a.goldEarned >= 1000],
    ['rest', 'Well-Earned Rest', 'Buy a reward from the shop', a.rewardsBought >= 1],
    ['bookkeeper', 'Bookkeeper', 'Log your spending on 7 different days', a.ledgerDays >= 7],
    ['treasurer', 'Royal Treasurer', 'Log your spending on 60 different days', a.ledgerDays >= 60],
    ['within-means', 'Within Your Means', 'Finish a month inside your budget', a.budgetsKept >= 1],
    ['hoard-goal', 'Dragon’s Hoard', 'Reach a savings goal', a.goalsReached >= 1],
    ['debt-slayer', 'Debt Slayer', 'Clear a debt completely', a.debtsCleared >= 1],
  ];
  return list.map(([id, title, description, earned]) => ({ id, title, description, earned }));
}
