import { evaluateHand, type HandEvaluation } from '../../common/utils/poker';

/** 固定电脑人账号 ID，方便前端识别和数据库初始化 */
export const BOT_USER_ID = '11111111-1111-4111-8111-111111111111';
export const BOT_USERNAME = 'bot_pro';
export const BOT_NICKNAME = '电脑人·职业';

export interface BotView {
  holeCards: string[];
  communityCards: string[];
  pot: number;
  currentBet: number;
  roundBet: number;
  stack: number;
  bigBlind: number;
  activePlayers: number;
}

export interface BotDecision {
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin';
  amount?: number;
}

/** 翻牌前起手牌强度（0-1，职业选手风格的起手牌范围） */
function preflopStrength(holeCards: string[]): number {
  if (holeCards.length < 2) return 0;

  const ranks = holeCards.map(c => '23456789TJQKA'.indexOf(c[0]) + 2);
  const high = Math.max(...ranks);
  const low = Math.min(...ranks);
  const suited = holeCards[0][1] === holeCards[1][1];
  const gap = high - low;

  if (high === low) {
    // 口袋对子：AA 最强，22 仍可打
    return Math.min(0.98, 0.52 + high / 30);
  }

  let score = 0.15 + (high / 14) * 0.45 + (low / 14) * 0.25;
  if (low <= 7) score -= 0.12; // 小牌组合明显减分
  if (suited) score += 0.05;
  if (gap === 1) score += 0.05;
  if (gap === 2) score += 0.025;
  if (high >= 11 && low >= 10) score += 0.06;
  if (high === 14 && low >= 10) score += 0.05;

  return Math.min(0.96, score);
}

/** 翻牌后牌力（0-1），并考虑同花/顺子听牌 */
function postflopStrength(
  holeCards: string[],
  communityCards: string[],
  evaluation: HandEvaluation,
): number {
  const base: Record<string, number> = {
    highCard: 0.2,
    pair: 0.4,
    twoPair: 0.6,
    threeOfAKind: 0.74,
    straight: 0.82,
    flush: 0.87,
    fullHouse: 0.93,
    fourOfAKind: 0.98,
    straightFlush: 0.995,
    royalFlush: 1,
  };

  let strength = base[evaluation.rank] ?? 0.2;

  // 顶对/踢脚越好，牌力略高
  if (evaluation.tieBreakers.length > 0) {
    strength += Math.min(0.05, evaluation.tieBreakers[0] / 300);
  }

  if (communityCards.length >= 3 && communityCards.length < 5) {
    const allCards = [...holeCards, ...communityCards];
    const suitCounts: Record<string, number> = {};
    for (const card of allCards) {
      suitCounts[card[1]] = (suitCounts[card[1]] || 0) + 1;
    }
    if (Object.values(suitCounts).some(n => n === 4)) {
      strength += 0.12;
    }

    const uniqueRanks = [...new Set(allCards.map(c => '23456789TJQKA'.indexOf(c[0]) + 2))].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i <= uniqueRanks.length - 4; i++) {
      if (uniqueRanks[i + 3] - uniqueRanks[i] <= 4) {
        strength += 0.1;
        break;
      }
    }
  }

  return Math.min(1, strength);
}

/**
 * 职业选手风格的决策：
 * - 强牌主动下注/加注，按底池比例控制尺度
 * - 中等牌跟注，弱牌面对下注弃牌
 * - 有同花/顺子听牌时半诈唬
 * - 短筹码时合理全下
 */
export function decideBotAction(view: BotView): BotDecision {
  const toCall = Math.max(0, view.currentBet - view.roundBet);
  const pot = Math.max(1, view.pot);
  const potOdds = toCall / (pot + toCall);
  const street = view.communityCards.length === 0 ? 'preflop' : 'postflop';

  let strength: number;
  if (street === 'preflop') {
    strength = preflopStrength(view.holeCards);
  } else {
    strength = postflopStrength(
      view.holeCards,
      view.communityCards,
      evaluateHand(view.holeCards, view.communityCards),
    );
  }

  const minRaise = view.currentBet + view.bigBlind * 2;
  const canRaise = view.stack + view.roundBet >= minRaise;

  const raiseTo = (fraction: number): BotDecision => {
    const target = Math.max(
      minRaise,
      view.currentBet + Math.round(pot * fraction),
    );
    if (target >= view.stack + view.roundBet) {
      return { action: 'allin' };
    }
    return { action: 'raise', amount: target };
  };

  // 短筹码：强牌直接全下，避免被翻牌后反超
  if (view.stack <= view.bigBlind * 5 && strength >= 0.55) {
    return { action: 'allin' };
  }

  if (toCall <= 0) {
    // 可以过牌
    if (strength >= 0.72 && canRaise) {
      return raiseTo(0.7);
    }
    if (strength >= 0.52 && canRaise && Math.random() < 0.65) {
      return raiseTo(0.5);
    }
    // 少量诈唬，保持职业选手的压迫感
    if (canRaise && view.communityCards.length >= 3 && Math.random() < 0.12) {
      return raiseTo(0.45);
    }
    return { action: 'check' };
  }

  // 面对下注
  if (strength < potOdds - 0.04) {
    // 极短跟注且牌力不算太差时，偶尔防守
    if (toCall <= view.bigBlind && strength >= 0.32 && Math.random() < 0.4) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  if (strength >= 0.8 && canRaise && Math.random() < 0.8) {
    return raiseTo(0.8);
  }

  if (strength >= 0.62 && canRaise && potOdds < 0.35 && Math.random() < 0.45) {
    return raiseTo(0.6);
  }

  if (strength >= 0.5 && toCall >= view.stack) {
    return { action: 'allin' };
  }

  return { action: 'call' };
}
