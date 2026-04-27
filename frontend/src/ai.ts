// Simple minimax AI with alpha-beta pruning, using chess.js standard rules
// for the bot's own moves (player gets the rule advantage; bot plays classic).
import { Chess, Move } from 'chess.js';
import { RuleChess } from './engine';

const PIECE_VAL: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CENTER_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function evaluate(g: Chess): number {
  if (g.isCheckmate()) return g.turn() === 'w' ? -100000 : 100000;
  if (g.isDraw() || g.isStalemate()) return 0;
  let score = 0;
  const board = g.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const c = board[r][f];
      if (!c) continue;
      const v = PIECE_VAL[c.type] || 0;
      const center = CENTER_BONUS[r][f];
      const mult = c.color === 'w' ? 1 : -1;
      score += mult * (v + center * 2);
    }
  }
  return score;
}

function minimax(g: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0 || g.isGameOver()) {
    return evaluate(g);
  }
  const moves = g.moves({ verbose: true });
  // Order: captures first
  moves.sort((a: any, b: any) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      g.move(m as Move);
      const score = minimax(g, depth - 1, alpha, beta, false);
      g.undo();
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      g.move(m as Move);
      const score = minimax(g, depth - 1, alpha, beta, true);
      g.undo();
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export type AILevel = 1 | 2 | 3 | 4;
const LEVEL_DEPTH: Record<AILevel, number> = { 1: 1, 2: 2, 3: 3, 4: 3 };
const LEVEL_NOISE: Record<AILevel, number> = { 1: 0.7, 2: 0.3, 3: 0.05, 4: 0 };

/** Choose a move for the bot. Returns null if no move available. */
export function chooseAIMove(rc: RuleChess, level: AILevel = 2): { from: string; to: string; promotion?: string } | null {
  const g = new Chess(rc.fen());
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  const turn = g.turn();
  const maximizing = turn === 'w';

  // Add randomness based on level
  if (Math.random() < LEVEL_NOISE[level]) {
    const m = moves[Math.floor(Math.random() * moves.length)] as any;
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  let bestMoves: any[] = [];
  let bestScore = maximizing ? -Infinity : Infinity;
  const depth = LEVEL_DEPTH[level];
  for (const m of moves) {
    g.move(m as Move);
    const score = minimax(g, depth - 1, -Infinity, Infinity, !maximizing);
    g.undo();
    if (maximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
    }
  }
  const choice = bestMoves[Math.floor(Math.random() * bestMoves.length)] as any;
  return { from: choice.from, to: choice.to, promotion: choice.promotion };
}
