export type CardSuit = 'S' | 'H' | 'D' | 'C';
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export const SUITS: CardSuit[] = ['S', 'H', 'D', 'C'];
export const RANKS: CardRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES: Record<CardRank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export type HandRank =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush'
  | 'royalFlush';

export const HAND_RANK_VALUES: Record<HandRank, number> = {
  highCard: 0,
  pair: 1,
  twoPair: 2,
  threeOfAKind: 3,
  straight: 4,
  flush: 5,
  fullHouse: 6,
  fourOfAKind: 7,
  straightFlush: 8,
  royalFlush: 9,
};

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  highCard: '高牌',
  pair: '一对',
  twoPair: '两对',
  threeOfAKind: '三条',
  straight: '顺子',
  flush: '同花',
  fullHouse: '葫芦',
  fourOfAKind: '四条',
  straightFlush: '同花顺',
  royalFlush: '皇家同花顺',
};

export interface HandEvaluation {
  rank: HandRank;
  value: number;
  tieBreakers: number[];
  description: string;
}

export function createDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

export function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function parseCard(card: string): { rank: CardRank; suit: CardSuit } {
  const rank = card[0] as CardRank;
  const suit = card[1] as CardSuit;
  return { rank, suit };
}

function getRankValue(card: string): number {
  return RANK_VALUES[card[0] as CardRank];
}

export function evaluateHand(holeCards: string[], communityCards: string[]): HandEvaluation {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return { rank: 'highCard', value: 0, tieBreakers: [], description: '高牌' };
  }

  const bestEval = findBestHand(allCards);
  return bestEval;
}

function findBestHand(cards: string[]): HandEvaluation {
  let best: HandEvaluation | null = null;
  const combinations = getCombinations(cards, 5);

  for (const combo of combinations) {
    const handEval = evaluateFiveCards(combo);
    if (!best || compareHandEvaluations(handEval, best) > 0) {
      best = handEval;
    }
  }

  return best!;
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  if (k > n) return result;

  function backtrack(start: number, current: T[]): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < n; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

function evaluateFiveCards(cards: string[]): HandEvaluation {
  const rankValues = cards.map(getRankValue).sort((a, b) => b - a);
  const suits = cards.map(c => c[1]);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = isStraightRanks(rankValues);

  const rankCounts = getRankCounts(rankValues);
  const countsDesc = Object.values(rankCounts).sort((a, b) => b - a);
  const uniqueRanks = Object.keys(rankCounts)
    .map(Number)
    .sort((a, b) => {
      const countDiff = rankCounts[b] - rankCounts[a];
      if (countDiff !== 0) return countDiff;
      return b - a;
    });

  if (isFlush && isStraight) {
    const highCard = getStraightHigh(rankValues);
    if (highCard === 14) {
      return { rank: 'royalFlush', value: 9, tieBreakers: [], description: '皇家同花顺' };
    }
    return { rank: 'straightFlush', value: 8, tieBreakers: [highCard], description: `同花顺 (${cardName(highCard)}高)` };
  }

  if (countsDesc[0] === 4) {
    const quadRank = uniqueRanks[0];
    const kicker = uniqueRanks[1];
    return { rank: 'fourOfAKind', value: 7, tieBreakers: [quadRank, kicker], description: `四条 (${cardName(quadRank)})` };
  }

  if (countsDesc[0] === 3 && countsDesc[1] === 2) {
    const threeRank = uniqueRanks[0];
    const pairRank = uniqueRanks[1];
    return { rank: 'fullHouse', value: 6, tieBreakers: [threeRank, pairRank], description: `葫芦 (${cardName(threeRank)}葫芦)` };
  }

  if (isFlush) {
    return { rank: 'flush', value: 5, tieBreakers: rankValues, description: '同花' };
  }

  if (isStraight) {
    const highCard = getStraightHigh(rankValues);
    return { rank: 'straight', value: 4, tieBreakers: [highCard], description: `顺子 (${cardName(highCard)}高)` };
  }

  if (countsDesc[0] === 3) {
    const threeRank = uniqueRanks[0];
    const kickers = uniqueRanks.slice(1);
    return { rank: 'threeOfAKind', value: 3, tieBreakers: [threeRank, ...kickers], description: `三条 (${cardName(threeRank)})` };
  }

  if (countsDesc[0] === 2 && countsDesc[1] === 2) {
    const highPair = uniqueRanks[0];
    const lowPair = uniqueRanks[1];
    const kicker = uniqueRanks[2];
    return { rank: 'twoPair', value: 2, tieBreakers: [highPair, lowPair, kicker], description: `两对 (${cardName(highPair)}对${cardName(lowPair)})` };
  }

  if (countsDesc[0] === 2) {
    const pairRank = uniqueRanks[0];
    const kickers = uniqueRanks.slice(1);
    return { rank: 'pair', value: 1, tieBreakers: [pairRank, ...kickers], description: `一对 (${cardName(pairRank)})` };
  }

  return { rank: 'highCard', value: 0, tieBreakers: rankValues, description: `高牌 (${cardName(rankValues[0])})` };
}

function getRankCounts(rankValues: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const v of rankValues) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

function isStraightRanks(sortedDesc: number[]): boolean {
  const unique = [...new Set(sortedDesc)].sort((a, b) => b - a);
  if (unique.length < 5) return false;

  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return true;
  }

  if (unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
    return true;
  }

  return false;
}

function getStraightHigh(sortedDesc: number[]): number {
  const unique = [...new Set(sortedDesc)].sort((a, b) => b - a);
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  if (unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
    return 5;
  }
  return 0;
}

function cardName(value: number): string {
  const names: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };
  return names[value] || String(value);
}

export function compareHandEvaluations(a: HandEvaluation, b: HandEvaluation): number {
  if (a.value !== b.value) return a.value - b.value;
  for (let i = 0; i < Math.max(a.tieBreakers.length, b.tieBreakers.length); i++) {
    const aTie = a.tieBreakers[i] ?? 0;
    const bTie = b.tieBreakers[i] ?? 0;
    if (aTie !== bTie) return aTie - bTie;
  }
  return 0;
}

export interface SettledSidePot {
  amount: number;
  eligibleSeats: number[];
  rakeAmount: number;
  netAmount: number;
  winnerIds: string[];
  payouts: { userId: string; amount: number }[];
}

export function determineWinners(
  players: { userId: string; holeCards: string[]; isFolded: boolean; isAllIn: boolean; seat: number; betAmount: number }[],
  communityCards: string[],
  pot: number,
  sidePots: { amount: number; eligibleSeats: number[] }[],
  rakeRate = 0.05,
): { winners: { userId: string; amount: number }[]; playerEvals: Map<string, HandEvaluation>; settledSidePots: SettledSidePot[]; rakeAmount: number } {
  const playerEvals = new Map<string, HandEvaluation>();
  const activePlayers = players.filter(p => !p.isFolded);
  for (const player of activePlayers) {
    playerEvals.set(player.userId, evaluateHand(player.holeCards, communityCards));
  }

  const totalWon = new Map<string, number>();
  const settledSidePots: SettledSidePot[] = [];
  let rakeAmount = 0;
  const pots = sidePots.length > 0
    ? sidePots
    : [{ amount: pot, eligibleSeats: activePlayers.map(player => player.seat) }];

  for (const sidePot of pots) {
    const eligiblePlayers = activePlayers.filter(player => sidePot.eligibleSeats.includes(player.seat));
    if (eligiblePlayers.length === 0 || sidePot.amount <= 0) continue;

    let bestEval: HandEvaluation | null = null;
    let potWinners: typeof eligiblePlayers = [];
    for (const player of eligiblePlayers) {
      const evaluation = playerEvals.get(player.userId)!;
      const comparison = bestEval ? compareHandEvaluations(evaluation, bestEval) : 1;
      if (comparison > 0) {
        bestEval = evaluation;
        potWinners = [player];
      } else if (comparison === 0) {
        potWinners.push(player);
      }
    }

    // 每个主池/边池独立向赢家所得总额抽取5%，再分配净奖池。
    const potRake = Math.floor(sidePot.amount * rakeRate);
    const netAmount = sidePot.amount - potRake;
    rakeAmount += potRake;
    const share = Math.floor(netAmount / potWinners.length);
    let remainder = netAmount - share * potWinners.length;
    potWinners.sort((a, b) => a.seat - b.seat);
    const payouts = potWinners.map(player => {
      const amount = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      totalWon.set(player.userId, (totalWon.get(player.userId) ?? 0) + amount);
      return { userId: player.userId, amount };
    });
    settledSidePots.push({
      amount: sidePot.amount,
      eligibleSeats: [...sidePot.eligibleSeats],
      rakeAmount: potRake,
      netAmount,
      winnerIds: potWinners.map(player => player.userId),
      payouts,
    });
  }

  const winners = [...totalWon.entries()].map(([userId, amount]) => ({ userId, amount }));
  return { winners, playerEvals, settledSidePots, rakeAmount };
}

export function calculateSidePots(
  players: { userId: string; seat: number; betAmount: number; isFolded: boolean; isAllIn: boolean }[],
): { mainPot: number; sidePots: { amount: number; eligibleSeats: number[] }[] } {
  const levels = [...new Set(players.map(player => Math.max(0, player.betAmount)).filter(amount => amount > 0))]
    .sort((a, b) => a - b);
  if (levels.length === 0) return { mainPot: 0, sidePots: [] };

  const sidePots: { amount: number; eligibleSeats: number[] }[] = [];
  let previousLevel = 0;
  let mainPot = 0;

  for (const level of levels) {
    const contributors = players.filter(player => player.betAmount >= level);
    const eligibleSeats = contributors.filter(player => !player.isFolded).map(player => player.seat);
    const amount = (level - previousLevel) * contributors.length;
    previousLevel = level;
    if (amount <= 0) continue;

    // 若某层没有仍在牌局中的贡献者，该层不形成可争夺奖池（正常摊牌路径不会出现）。
    if (eligibleSeats.length === 0) continue;
    sidePots.push({ amount, eligibleSeats });
    mainPot += amount;
  }

  return { mainPot, sidePots };
}
