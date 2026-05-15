import { Chess, Move } from 'chess.js';
import { RuleChess } from './engine';

export type AILevel = 1 | 2 | 3 | 4 | 5 | 6;

export type AIProfile = {
  level: AILevel;
  name: string;
  title: string;
  avatar: string;
  rating: number;
  depth: number;
  noise: number;
};

export const AI_PROFILES: Record<AILevel, AIProfile> = {
  1: { level: 1, name: 'Nova', title: 'Beginner', avatar: 'N', rating: 400, depth: 1, noise: 0.65 },
  2: { level: 2, name: 'Pip', title: 'Casual', avatar: 'P', rating: 800, depth: 2, noise: 0.32 },
  3: { level: 3, name: 'Rook', title: 'Club', avatar: 'R', rating: 1200, depth: 3, noise: 0.14 },
  4: { level: 4, name: 'Vera', title: 'Advanced', avatar: 'V', rating: 1600, depth: 3, noise: 0.04 },
  5: { level: 5, name: 'Magnus', title: 'Master', avatar: 'M', rating: 2100, depth: 4, noise: 0.01 },
  6: { level: 6, name: 'Oracle', title: 'Grandmaster', avatar: 'O', rating: 2600, depth: 4, noise: 0 },
};

const PIECE_VAL: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PAWN = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK = [
  [0, 0, 0, 5, 5, 0, 0, 0],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const QUEEN = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING = [
  [20, 30, 10, 0, 0, 10, 30, 20],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
];

const TABLES: Record<string, number[][]> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};

const MATE = 100000;

function tableScore(type: string, color: 'w' | 'b', row: number, file: number): number {
  const table = TABLES[type];
  if (!table) return 0;
  return color === 'w' ? table[row][file] : table[7 - row][file];
}

function evaluate(g: Chess): number {
  if (g.isCheckmate()) return g.turn() === 'w' ? -MATE : MATE;
  if (g.isDraw() || g.isStalemate()) return 0;

  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  const board = g.board();
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      const value = PIECE_VAL[piece.type] + tableScore(piece.type, piece.color, row, file);
      const mult = piece.color === 'w' ? 1 : -1;
      score += mult * value;
      if (piece.type === 'b') {
        if (piece.color === 'w') whiteBishops += 1;
        else blackBishops += 1;
      }
    }
  }

  if (whiteBishops >= 2) score += 35;
  if (blackBishops >= 2) score -= 35;
  if (g.inCheck()) score += g.turn() === 'w' ? -30 : 30;

  const side = g.turn();
  const mobility = g.moves().length;
  score += side === 'w' ? mobility * 2 : -mobility * 2;
  return score;
}

function orderedMoves(g: Chess): Move[] {
  const moves = g.moves({ verbose: true }) as Move[];
  return moves.sort((a: any, b: any) => movePriority(b) - movePriority(a));
}

function movePriority(move: any): number {
  let score = 0;
  if (move.captured) score += 10 * (PIECE_VAL[move.captured] || 0) - (PIECE_VAL[move.piece] || 0);
  if (move.promotion) score += PIECE_VAL[move.promotion] || 0;
  if (move.san?.includes('+')) score += 45;
  if (move.san?.includes('#')) score += MATE;
  return score;
}

function minimax(g: Chess, depth: number, alpha: number, beta: number, maximizing: boolean, ply: number): number {
  if (g.isGameOver()) {
    const terminal = evaluate(g);
    if (Math.abs(terminal) >= MATE) return terminal + (terminal > 0 ? -ply : ply);
    return terminal;
  }
  if (depth === 0) return evaluate(g);

  const moves = orderedMoves(g);
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      g.move(move);
      const score = minimax(g, depth - 1, alpha, beta, false, ply + 1);
      g.undo();
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    g.move(move);
    const score = minimax(g, depth - 1, alpha, beta, true, ply + 1);
    g.undo();
    best = Math.min(best, score);
    beta = Math.min(beta, score);
    if (beta <= alpha) break;
  }
  return best;
}

export function getAIProfile(level: AILevel = 2): AIProfile {
  return AI_PROFILES[level] || AI_PROFILES[2];
}

/** Choose a move for the bot. Returns null if no move available. */
export function chooseAIMove(rc: RuleChess, level: AILevel = 2): { from: string; to: string; promotion?: string } | null {
  const profile = getAIProfile(level);
  const g = new Chess(rc.fen());
  const moves = orderedMoves(g);
  if (!moves.length) return null;

  const forcedMate = moves.find((move: any) => move.san?.includes('#'));
  if (forcedMate && level >= 3) {
    return { from: forcedMate.from, to: forcedMate.to, promotion: forcedMate.promotion };
  }

  if (Math.random() < profile.noise) {
    const pool = moves.slice(0, Math.max(1, Math.ceil(moves.length * 0.55)));
    const move = pool[Math.floor(Math.random() * pool.length)] as any;
    return { from: move.from, to: move.to, promotion: move.promotion };
  }

  const maximizing = g.turn() === 'w';
  let bestMoves: Move[] = [];
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    g.move(move);
    const score = minimax(g, profile.depth - 1, -Infinity, Infinity, !maximizing, 1);
    g.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  const choice = bestMoves[Math.floor(Math.random() * bestMoves.length)] as any;
  return { from: choice.from, to: choice.to, promotion: choice.promotion };
}
