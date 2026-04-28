import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { colors } from '../theme';
import type { RuleChess, SquareName, LegalTarget } from '../engine';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Solid (filled) Unicode chess glyphs - we color them ourselves
const GLYPH: Record<string, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

type Props = {
  rc: RuleChess;
  /** Optional override of board orientation. Default 'w' = white at bottom. */
  orientation?: 'w' | 'b';
  /** Currently selected square (for highlighting). */
  selected?: SquareName | null;
  /** Legal target squares for current selection. */
  targets?: LegalTarget[];
  /** Pending swap state — first square selected. */
  swapFirst?: SquareName | null;
  /** Block all input (e.g. game over or AI thinking). */
  disabled?: boolean;
  /** Width of the board in px. */
  size: number;
  /** Tap handler — called for every square. */
  onSquarePress: (sq: SquareName) => void;
};

export default function Chessboard({
  rc,
  orientation = 'w',
  selected,
  targets,
  swapFirst,
  disabled,
  size,
  onSquarePress,
}: Props) {
  const squareSize = Math.floor(size / 8);
  // Note: do NOT useMemo on rc.board() — rc is a ref-stable object whose
  // internal state mutates in place. Memoising would freeze the rendered
  // position to the starting board even though moves are made. Recomputing
  // 64 squares on each render is cheap.
  const board = rc.board();
  const lastMove = rc.lastMove;
  const targetMap = useMemo(() => {
    const m: Record<string, LegalTarget> = {};
    (targets || []).forEach((t) => (m[t.to] = t));
    return m;
  }, [targets]);

  const orderedRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const orderedFiles = orientation === 'w' ? FILES : [...FILES].slice().reverse();

  return (
    <View
      style={[styles.board, { width: size, height: size }]}
      testID="chessboard"
    >
      {orderedRanks.map((rank) => (
        <View key={rank} style={styles.row}>
          {orderedFiles.map((file) => {
            const sqName = (file + rank) as SquareName;
            const fileIdx = FILES.indexOf(file);
            const rankIdx = 8 - rank;
            const isLight = (fileIdx + rankIdx) % 2 === 0;
            const piece = board[rankIdx][fileIdx];
            const isSelected = selected === sqName || swapFirst === sqName;
            const isTarget = !!targetMap[sqName];
            const targetType = targetMap[sqName]?.type;
            const isLastMove =
              lastMove && (lastMove.from === sqName || lastMove.to === sqName);
            const isCheck =
              piece && piece.type === 'k' && piece.color === rc.turn() && rc.inCheck();

            const bg = isLight ? colors.boardLight : colors.boardDark;

            return (
              <Pressable
                key={sqName}
                testID={`sq-${sqName}`}
                onPress={() => !disabled && onSquarePress(sqName)}
                style={[
                  styles.square,
                  { width: squareSize, height: squareSize, backgroundColor: bg },
                ]}
              >
                {/* Coordinates (file letter on rank 1, rank number on file a) */}
                {((orientation === 'w' && rank === 1) || (orientation === 'b' && rank === 8)) && (
                  <Text
                    style={[
                      styles.coordFile,
                      { color: isLight ? colors.boardDark : colors.boardLight },
                    ]}
                  >
                    {file}
                  </Text>
                )}
                {((orientation === 'w' && file === 'a') || (orientation === 'b' && file === 'h')) && (
                  <Text
                    style={[
                      styles.coordRank,
                      { color: isLight ? colors.boardDark : colors.boardLight },
                    ]}
                  >
                    {rank}
                  </Text>
                )}

                {/* Highlights */}
                {isLastMove && <View style={[styles.overlay, { backgroundColor: colors.boardLastMove }]} />}
                {isSelected && <View style={[styles.overlay, { backgroundColor: colors.boardHighlight }]} />}
                {isCheck && <View style={[styles.overlay, { backgroundColor: colors.boardCheck }]} />}

                {/* Piece */}
                {piece && (
                  <Text
                    style={[
                      styles.piece,
                      {
                        fontSize: squareSize * 0.75,
                        color: piece.color === 'w' ? '#FFFFFF' : '#0A0A0B',
                        textShadowColor: piece.color === 'w' ? '#0A0A0B' : '#FFFFFF',
                      },
                    ]}
                  >
                    {GLYPH[piece.type.toUpperCase()]}
                  </Text>
                )}

                {/* Legal-move dot or capture ring */}
                {isTarget && !piece && (
                  <View
                    style={[
                      styles.dot,
                      {
                        width: squareSize * 0.28,
                        height: squareSize * 0.28,
                        borderRadius: (squareSize * 0.28) / 2,
                        backgroundColor:
                          targetType === 'dash'
                            ? colors.info
                            : targetType === 'sideways'
                            ? colors.danger
                            : 'rgba(0,0,0,0.35)',
                      },
                    ]}
                  />
                )}
                {isTarget && piece && (
                  <View
                    style={[
                      styles.captureRing,
                      {
                        width: squareSize - 6,
                        height: squareSize - 6,
                        borderRadius: (squareSize - 6) / 2,
                        borderColor:
                          targetType === 'dash' ? colors.info : 'rgba(0,0,0,0.5)',
                      },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'column',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0A0A0B',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  piece: {
    fontWeight: '900',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }),
  },
  dot: {
    position: 'absolute',
    alignSelf: 'center',
  },
  captureRing: {
    position: 'absolute',
    borderWidth: 3,
  },
  coordFile: {
    position: 'absolute',
    bottom: 1,
    right: 3,
    fontSize: 9,
    fontWeight: '700',
    opacity: 0.6,
  },
  coordRank: {
    position: 'absolute',
    top: 1,
    left: 3,
    fontSize: 9,
    fontWeight: '700',
    opacity: 0.6,
  },
});
