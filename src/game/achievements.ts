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
  ];
  return list.map(([id, title, description, earned]) => ({ id, title, description, earned }));
}
