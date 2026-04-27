// RuleForge Chess engine — wraps chess.js with custom rule layers.
// Supported rule keys: 'classic', 'king_dash', 'power_pawns', 'swap_move'.
import { Chess, Square, PieceSymbol, Color } from 'chess.js';

export type RuleKey = 'classic' | 'king_dash' | 'power_pawns' | 'swap_move';

export type SquareName = Square;

export type LegalTarget = {
  to: SquareName;
  type: 'normal' | 'dash' | 'sideways';
  promotion?: 'q' | 'r' | 'b' | 'n';
};

export type RuleFlags = {
  whiteKingDashUsed: boolean;
  blackKingDashUsed: boolean;
  whiteSwapUsed: boolean;
  blackSwapUsed: boolean;
};

export type HistoryEntry = {
  san: string;
  fenBefore: string;
  fenAfter: string;
  flagsBefore: RuleFlags;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function sq(file: number, rank: number): SquareName | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return (FILES[file] + rank) as SquareName;
}

function fileOf(s: SquareName): number {
  return FILES.indexOf(s[0] as any);
}
function rankOf(s: SquareName): number {
  return parseInt(s[1], 10);
}

export class RuleChess {
  private game: Chess;
  ruleKey: RuleKey;
  flags: RuleFlags;
  history: HistoryEntry[] = [];
  // Pending swap state (UI helper) — engine itself doesn't track partial swap
  // Last move (for highlight)
  lastMove: { from: SquareName; to: SquareName } | null = null;

  constructor(ruleKey: RuleKey, fen?: string) {
    this.ruleKey = ruleKey;
    this.game = fen ? new Chess(fen) : new Chess();
    this.flags = {
      whiteKingDashUsed: false,
      blackKingDashUsed: false,
      whiteSwapUsed: false,
      blackSwapUsed: false,
    };
  }

  fen() {
    return this.game.fen();
  }
  turn(): Color {
    return this.game.turn();
  }
  inCheck() {
    return this.game.inCheck();
  }
  isGameOver() {
    return this.game.isGameOver();
  }
  isCheckmate() {
    return this.game.isCheckmate();
  }
  isStalemate() {
    return this.game.isStalemate();
  }
  isDraw() {
    return this.game.isDraw();
  }
  board() {
    return this.game.board();
  }
  pgn() {
    return this.game.pgn();
  }
  historySAN(): string[] {
    return this.history.map((h) => h.san);
  }

  pieceAt(s: SquareName) {
    return this.game.get(s);
  }

  // ------- Legal moves -------
  legalTargets(from: SquareName): LegalTarget[] {
    const piece = this.game.get(from);
    if (!piece || piece.color !== this.game.turn()) return [];

    const targets: LegalTarget[] = [];
    // Standard moves via chess.js
    const moves = this.game.moves({ square: from, verbose: true }) as any[];
    for (const m of moves) {
      const t: LegalTarget = { to: m.to, type: 'normal' };
      if (m.promotion) t.promotion = m.promotion;
      targets.push(t);
    }

    // Rule extensions
    if (this.ruleKey === 'king_dash' && piece.type === 'k') {
      const usedFlag = piece.color === 'w' ? this.flags.whiteKingDashUsed : this.flags.blackKingDashUsed;
      if (!usedFlag) {
        for (const dx of [-2, -1, 0, 1, 2]) {
          for (const dy of [-2, -1, 0, 1, 2]) {
            if (Math.abs(dx) !== 2 && Math.abs(dy) !== 2) continue; // need at least one ±2 component
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
            // Restrict to straight 2-square dashes (horizontal, vertical, diagonal)
            const isLine =
              (dx === 0 && Math.abs(dy) === 2) ||
              (dy === 0 && Math.abs(dx) === 2) ||
              (Math.abs(dx) === 2 && Math.abs(dy) === 2);
            if (!isLine) continue;
            const target = sq(fileOf(from) + dx, rankOf(from) + dy);
            if (!target) continue;
            // Path cannot be attacked. We approximate: simulate by moving king to mid square first.
            const midFile = fileOf(from) + dx / 2;
            const midRank = rankOf(from) + dy / 2;
            const mid = sq(midFile, midRank);
            if (!mid) continue;
            // Mid square must be empty (king passes through it)
            if (this.game.get(mid)) continue;
            // Target square: empty, OR enemy piece (capture).
            const targetPiece = this.game.get(target);
            if (targetPiece && targetPiece.color === piece.color) continue;
            // King may not be in check now or after dash; moving through mid must also be safe.
            if (!this.dashIsSafe(from, mid, target, piece.color)) continue;
            targets.push({ to: target, type: 'dash' });
          }
        }
      }
    }

    if (this.ruleKey === 'power_pawns' && piece.type === 'p') {
      const r = rankOf(from);
      const isPower = (piece.color === 'w' && r >= 5) || (piece.color === 'b' && r <= 4);
      if (isPower) {
        for (const dx of [-1, 1]) {
          const target = sq(fileOf(from) + dx, r);
          if (!target) continue;
          if (this.game.get(target)) continue; // sideways is non-capturing
          // Check legality: simulate by moving pawn (no chess.js support for this), so we apply manually and verify own king isn't in check
          if (this.simulateLegal(() => this.applySidewaysPawn(from, target))) {
            // Avoid duplicates if standard moves already include this (they won't for sideways pawn moves)
            if (!targets.some((t) => t.to === target && t.type === 'normal')) {
              targets.push({ to: target, type: 'sideways' });
            }
          }
        }
      }
    }

    return targets;
  }

  private dashIsSafe(from: SquareName, mid: SquareName, to: SquareName, color: Color): boolean {
    // Use chess.js to check attacks. We mutate FEN: place king on mid, ensure not attacked. Then on to, ensure not attacked.
    const originalFen = this.game.fen();
    try {
      // King currently in check? Then the dash must end out of check; we still allow only if final pos resolves it.
      // Test mid:
      const midOk = this.simulateBoard(originalFen, (g) => {
        const piece = g.remove(from);
        if (!piece) return false;
        g.put({ type: 'k', color }, mid);
        return !g.isAttacked(mid, color === 'w' ? 'b' : 'w');
      });
      if (!midOk) return false;
      const finalOk = this.simulateBoard(originalFen, (g) => {
        const piece = g.remove(from);
        if (!piece) return false;
        // remove any enemy capture target
        if (g.get(to)) g.remove(to);
        g.put({ type: 'k', color }, to);
        return !g.isAttacked(to, color === 'w' ? 'b' : 'w');
      });
      return finalOk;
    } catch {
      return false;
    }
  }

  private simulateBoard(fen: string, fn: (g: Chess) => boolean): boolean {
    try {
      const g = new Chess(fen);
      return fn(g);
    } catch {
      return false;
    }
  }

  private simulateLegal(applyFn: () => void): boolean {
    const before = this.game.fen();
    const beforeFlags = { ...this.flags };
    try {
      applyFn();
      const myColor = this.game.turn(); // after applying, turn flips, so opposite is mover
      const moverColor: Color = myColor === 'w' ? 'b' : 'w';
      const board = this.game.board();
      let kingSq: SquareName | null = null;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = board[r][f];
          if (cell && cell.type === 'k' && cell.color === moverColor) {
            kingSq = (FILES[f] + (8 - r)) as SquareName;
          }
        }
      }
      const inCheck = kingSq ? this.game.isAttacked(kingSq, myColor) : false;
      // rollback
      this.game.load(before);
      this.flags = beforeFlags;
      return !inCheck;
    } catch {
      this.game.load(before);
      this.flags = beforeFlags;
      return false;
    }
  }

  private applySidewaysPawn(from: SquareName, to: SquareName) {
    // Manually: remove pawn, place pawn at to, flip turn, increment fullmove if black moved
    const piece = this.game.get(from);
    if (!piece) throw new Error('no piece');
    // Use FEN manipulation to flip turn properly.
    this.game.remove(from);
    this.game.put({ type: 'p', color: piece.color }, to);
    // Build new FEN: chess.js preserves position but turn must flip.
    const fen = this.game.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-'; // clear en passant
    // Halfmove clock resets on pawn move
    parts[4] = '0';
    if (piece.color === 'b') {
      parts[5] = String(parseInt(parts[5], 10) + 1);
    }
    this.game.load(parts.join(' '));
  }

  // ------- Moves -------
  /** Returns true on success. `to` may include promotion via { promotion } argument. */
  move(from: SquareName, to: SquareName, options?: { promotion?: 'q' | 'r' | 'b' | 'n' }): boolean {
    const piece = this.game.get(from);
    if (!piece || piece.color !== this.game.turn()) return false;
    const targets = this.legalTargets(from);
    const target = targets.find((t) => t.to === to);
    if (!target) return false;

    const fenBefore = this.game.fen();
    const flagsBefore = { ...this.flags };

    if (target.type === 'normal') {
      try {
        const moveResult = this.game.move({ from, to, promotion: options?.promotion || target.promotion || 'q' });
        if (!moveResult) return false;
        this.history.push({ san: moveResult.san, fenBefore, fenAfter: this.game.fen(), flagsBefore });
        this.lastMove = { from, to };
        return true;
      } catch {
        return false;
      }
    }
    if (target.type === 'dash') {
      // Apply manually
      this.applyKingDash(from, to);
      const san = `K~${to}`;
      this.history.push({ san, fenBefore, fenAfter: this.game.fen(), flagsBefore });
      this.lastMove = { from, to };
      return true;
    }
    if (target.type === 'sideways') {
      this.applySidewaysPawn(from, to);
      const san = `${from[0]}->${to}`;
      this.history.push({ san, fenBefore, fenAfter: this.game.fen(), flagsBefore });
      this.lastMove = { from, to };
      return true;
    }
    return false;
  }

  private applyKingDash(from: SquareName, to: SquareName) {
    const piece = this.game.get(from);
    if (!piece || piece.type !== 'k') throw new Error('not a king');
    // Capture target if any
    if (this.game.get(to)) this.game.remove(to);
    this.game.remove(from);
    this.game.put({ type: 'k', color: piece.color }, to);
    if (piece.color === 'w') this.flags.whiteKingDashUsed = true;
    else this.flags.blackKingDashUsed = true;
    const fen = this.game.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[2] = '-'; // king moved -> lose castling rights
    parts[3] = '-';
    parts[4] = '0';
    if (piece.color === 'b') {
      parts[5] = String(parseInt(parts[5], 10) + 1);
    }
    this.game.load(parts.join(' '));
  }

  /** Swap two of the current side's non-king pieces. Once per game per side. */
  swap(s1: SquareName, s2: SquareName): boolean {
    if (this.ruleKey !== 'swap_move') return false;
    const turn = this.game.turn();
    const used = turn === 'w' ? this.flags.whiteSwapUsed : this.flags.blackSwapUsed;
    if (used) return false;
    const p1 = this.game.get(s1);
    const p2 = this.game.get(s2);
    if (!p1 || !p2) return false;
    if (p1.color !== turn || p2.color !== turn) return false;
    if (p1.type === 'k' || p2.type === 'k') return false;
    if (s1 === s2) return false;

    const fenBefore = this.game.fen();
    const flagsBefore = { ...this.flags };

    this.game.remove(s1);
    this.game.remove(s2);
    this.game.put({ type: p1.type, color: p1.color }, s2);
    this.game.put({ type: p2.type, color: p2.color }, s1);

    const fen = this.game.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    parts[4] = String(parseInt(parts[4], 10) + 1);
    if (turn === 'b') parts[5] = String(parseInt(parts[5], 10) + 1);
    this.game.load(parts.join(' '));

    if (turn === 'w') this.flags.whiteSwapUsed = true;
    else this.flags.blackSwapUsed = true;
    const san = `↔${s1}${s2}`;
    this.history.push({ san, fenBefore, fenAfter: this.game.fen(), flagsBefore });
    this.lastMove = { from: s1, to: s2 };
    return true;
  }

  undo(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.game.load(last.fenBefore);
    this.flags = last.flagsBefore;
    const prev = this.history[this.history.length - 1];
    this.lastMove = prev
      ? { from: prev.fenBefore !== prev.fenAfter ? ('a1' as SquareName) : ('a1' as SquareName), to: 'a1' as SquareName }
      : null;
    // We don't reconstruct lastMove squares for undo highlight; clear it instead.
    this.lastMove = null;
    return true;
  }

  // Internal raw access for AI:
  rawGame(): Chess {
    return this.game;
  }

  rulesSummary(): string {
    return {
      classic: 'Standard chess.',
      king_dash: 'King may dash 2 squares once per game.',
      power_pawns: 'Pawns on 5th rank+ slide sideways one square (non-capturing).',
      swap_move: 'Once per game, swap two of your own non-king pieces.',
    }[this.ruleKey];
  }
}
