import { create } from 'zustand';
import type { Rank } from '../game/levels';

export interface Toast {
  id: number;
  text: string;
  tone: 'reward' | 'info' | 'warn';
}

export interface LevelUp {
  level: number;
  rank: Rank;
  rankUp: boolean;
}

interface FxState {
  toasts: Toast[];
  levelUp: LevelUp | null;
  toast(text: string, tone?: Toast['tone']): void;
  showLevelUp(levelUp: LevelUp): void;
  clearLevelUp(): void;
}

let nextId = 1;

/** Short-lived feedback: reward pop-ups and the level-up overlay. Never saved. */
export const useFx = create<FxState>((set) => ({
  toasts: [],
  levelUp: null,
  toast(text, tone = 'info') {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
  showLevelUp(levelUp) {
    set({ levelUp });
  },
  clearLevelUp() {
    set({ levelUp: null });
  },
}));
