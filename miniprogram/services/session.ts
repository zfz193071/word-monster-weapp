import { CONTENT_ASSETS } from '../content/assets';
import { FRUIT_LEVEL } from '../content/levels';
import { WORDS } from '../content/words';
import { createSession } from '../game/engine';
import type { GameState } from '../game/engine';
import { createRounds } from '../game/rounds';

// Only memory is used: a new process never restores an unfinished game.
export function createSessionStore() {
  let active: GameState | undefined;
  let claimed = false;
  let sequence = 0;
  return {
    start(): GameState {
      if (active) return active;
      const rounds = createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, Math.random);
      active = createSession(`session-${Date.now()}-${++sequence}`, FRUIT_LEVEL, rounds);
      claimed = false;
      return active;
    },
    claim(sessionId: string): GameState | undefined {
      if (!active || active.sessionId !== sessionId || claimed) return undefined;
      claimed = true;
      return active;
    },
    release(sessionId: string): void {
      if (active?.sessionId === sessionId) { active = undefined; claimed = false; }
    },
  };
}

export const sessionStore = createSessionStore();
