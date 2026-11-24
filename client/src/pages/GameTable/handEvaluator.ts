const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

type HandScore = { value: number; label: string };

function scoreFiveCards(cards: string[]): HandScore {
  const ranks = cards.map(card => RANK_VALUES[card[0]] || 0).sort((a, b) => b - a);
  const unique = [...new Set(ranks)];
  const counts = new Map<number, number>();
  ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = cards.every(card => card[1] === cards[0][1]);
  let straightHigh = 0;

  for (let high = 14; high >= 5; high -= 1) {
    if ([0, 1, 2, 3, 4].every(offset => unique.includes(high - offset))) {
      straightHigh = high;
      break;
    }
  }
  // A-2-3-4-5 is the wheel straight.
  if (!straightHigh && [14, 5, 4, 3, 2].every(rank => unique.includes(rank))) {
    straightHigh = 5;
  }

  if (isFlush && straightHigh === 14) return { value: 9, label: '皇家同花顺' };
  if (isFlush && straightHigh > 0) return { value: 8, label: '同花顺' };
  if (groups[0]?.[1] === 4) return { value: 7, label: '四条' };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { value: 6, label: '葫芦' };
  if (isFlush) return { value: 5, label: '同花' };
  if (straightHigh > 0) return { value: 4, label: '顺子' };
  if (groups[0]?.[1] === 3) return { value: 3, label: '三条' };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return { value: 2, label: '两对' };
  if (groups[0]?.[1] === 2) return { value: 1, label: '一对' };
  return { value: 0, label: `高牌 ${RANK_LABELS[ranks[0]] || ''}` };
}

function combinationsOfFive(cards: string[]): string[][] {
  const result: string[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return result;
}

/** 仅使用自己的底牌和公共牌，计算目前已经组成的最佳牌型。 */
export function describeBestHand(holeCards: string[], communityCards: string[]): string {
  const cards = [...holeCards, ...communityCards].filter(card => card && card.length >= 2);
  if (cards.length < 2) return '等待发牌';

  if (cards.length < 5) {
    const counts = new Map<number, number>();
    cards.forEach(card => {
      const rank = RANK_VALUES[card[0]] || 0;
      counts.set(rank, (counts.get(rank) || 0) + 1);
    });
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

    if (groups[0]?.[1] === 4) return '四条';
    if (groups[0]?.[1] === 3) return '三条';
    if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return '两对';
    if (groups[0]?.[1] === 2) {
      const pocketPair = holeCards.length === 2
        && holeCards[0]?.[0] === holeCards[1]?.[0]
        && communityCards.length === 0;
      return pocketPair ? '口袋对子' : '一对';
    }
    const highCards = groups.slice(0, 2).map(([rank]) => RANK_LABELS[rank]).join('-');
    return `高牌 ${highCards}`;
  }

  return combinationsOfFive(cards).reduce<HandScore>((best, combo) => {
    const next = scoreFiveCards(combo);
    return next.value > best.value ? next : best;
  }, { value: -1, label: '高牌' }).label;
}
