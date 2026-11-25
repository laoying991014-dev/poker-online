const assert = require('node:assert/strict');
const {
  calculateSidePots,
  determineWinners,
  evaluateHand,
  compareHandEvaluations,
} = require('../dist/server/common/utils/poker.js');

// 1000 / 1500 / 2200 contributions: the unmatched top 700 is returned, not raked.
const example = calculateSidePots([
  { userId: 'A', seat: 0, betAmount: 1000, isFolded: false, isAllIn: true },
  { userId: 'B', seat: 1, betAmount: 1500, isFolded: false, isAllIn: true },
  { userId: 'C', seat: 2, betAmount: 2200, isFolded: false, isAllIn: true },
]);
assert.deepEqual(example.sidePots, [
  { amount: 3000, eligibleSeats: [0, 1, 2] },
  { amount: 1000, eligibleSeats: [1, 2] },
]);
assert.deepEqual(example.uncalledReturns, [{ userId: 'C', seat: 2, amount: 700 }]);
assert.equal(example.mainPot, 4000);

// A folded player's contribution stays in the contestable pot; only a unique top contribution is returned.
const foldedMoney = calculateSidePots([
  { userId: 'A', seat: 0, betAmount: 100, isFolded: false, isAllIn: false },
  { userId: 'B', seat: 1, betAmount: 100, isFolded: false, isAllIn: false },
  { userId: 'C', seat: 2, betAmount: 200, isFolded: true, isAllIn: false },
]);
assert.deepEqual(foldedMoney.sidePots, [{ amount: 300, eligibleSeats: [0, 1] }]);
assert.deepEqual(foldedMoney.uncalledReturns, [{ userId: 'C', seat: 2, amount: 100 }]);

const foldedDeadMoney = calculateSidePots([
  { userId: 'A', seat: 0, betAmount: 100, isFolded: false, isAllIn: false },
  { userId: 'B', seat: 1, betAmount: 200, isFolded: true, isAllIn: false },
  { userId: 'C', seat: 2, betAmount: 200, isFolded: true, isAllIn: false },
]);
assert.deepEqual(foldedDeadMoney.sidePots, [{ amount: 500, eligibleSeats: [0] }]);
assert.deepEqual(foldedDeadMoney.uncalledReturns, []);

// A > B > C: each pot is raked independently at 5%, then awarded to its best eligible hand.
const settled = determineWinners([
  { userId: 'A', seat: 0, holeCards: ['AS', '5D'], isFolded: false, isAllIn: true, betAmount: 1000 },
  { userId: 'B', seat: 1, holeCards: ['KS', 'QD'], isFolded: false, isAllIn: true, betAmount: 1500 },
  { userId: 'C', seat: 2, holeCards: ['JS', 'TD'], isFolded: false, isAllIn: true, betAmount: 2200 },
], ['2C', '3D', '4H', '8S', '9C'], 4000, example.sidePots, 0.05);
assert.equal(settled.rakeAmount, 200);
assert.deepEqual(settled.settledSidePots.map(p => [p.amount, p.rakeAmount, p.netAmount, p.winnerIds]), [
  [3000, 150, 2850, ['A']],
  [1000, 50, 950, ['B']],
]);
assert.deepEqual(settled.winners, [
  { userId: 'A', amount: 2850 },
  { userId: 'B', amount: 950 },
]);

// Board royal flush is a tie: rake the pool once, then split the net pool.
const split = determineWinners([
  { userId: 'A', seat: 0, holeCards: ['2S', '3D'], isFolded: false, isAllIn: false, betAmount: 501 },
  { userId: 'B', seat: 1, holeCards: ['4C', '5D'], isFolded: false, isAllIn: false, betAmount: 500 },
], ['TH', 'JH', 'QH', 'KH', 'AH'], 1001, [{ amount: 1001, eligibleSeats: [0, 1] }], 0.05);
assert.equal(split.rakeAmount, 50);
assert.deepEqual(split.winners, [
  { userId: 'A', amount: 476 },
  { userId: 'B', amount: 475 },
]);

// Wheel straight (A-2-3-4-5) is valid and loses to a 6-high straight.
const wheel = evaluateHand(['AS', '2D'], ['3H', '4C', '5S', 'KD', 'QC']);
const sixHigh = evaluateHand(['6S', '2D'], ['3H', '4C', '5S', 'KD', 'QC']);
assert.equal(wheel.rank, 'straight');
assert.equal(wheel.tieBreakers[0], 5);
assert.equal(compareHandEvaluations(sixHigh, wheel) > 0, true);

process.stdout.write('Poker rules regression tests passed.\n');
