import { Card } from '../types';

export const SUITS: Card['s'][] = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ r, s });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getRankValue(r: string): number {
  if (r === 'A') return 14;
  if (r === 'K') return 13;
  if (r === 'Q') return 12;
  if (r === 'J') return 11;
  return parseInt(r, 10);
}

export function calculateBlackjackValue(hand: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.r === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(card.r)) {
      total += 10;
    } else {
      total += parseInt(card.r, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export const POKER_HAND_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

export function evaluatePokerHand(hand: Card[]): number[] {
  const values = hand.map((c) => getRankValue(c.r)).sort((a, b) => b - a);
  const isFlush = hand.every((c) => c.s === hand[0].s);
  const uniqueVals = [...new Set(values)];

  let straightHigh: number | null = null;
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      straightHigh = uniqueVals[0];
    } else if (JSON.stringify(uniqueVals) === JSON.stringify([14, 5, 4, 3, 2])) {
      straightHigh = 5; // A-2-3-4-5 wheel
    }
  }

  const counts: Record<number, number> = {};
  values.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });

  const groups = Object.entries(counts)
    .map(([v, count]) => ({ val: Number(v), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  // Straight Flush
  if (straightHigh !== null && isFlush) {
    return [8, straightHigh];
  }
  // Four of a Kind
  if (groups[0].count === 4) {
    return [7, groups[0].val, groups[1].val];
  }
  // Full House
  if (groups[0].count === 3 && groups[1].count === 2) {
    return [6, groups[0].val, groups[1].val];
  }
  // Flush
  if (isFlush) {
    return [5, ...values];
  }
  // Straight
  if (straightHigh !== null) {
    return [4, straightHigh];
  }
  // Three of a Kind
  if (groups[0].count === 3) {
    return [3, groups[0].val, ...groups.slice(1).map((g) => g.val)];
  }
  // Two Pair
  if (groups[0].count === 2 && groups[1].count === 2) {
    return [2, groups[0].val, groups[1].val, groups[2].val];
  }
  // One Pair
  if (groups[0].count === 2) {
    return [1, groups[0].val, ...groups.slice(1).map((g) => g.val)];
  }
  // High Card
  return [0, ...values];
}

export function comparePokerScores(a: number[], b: number[]): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
