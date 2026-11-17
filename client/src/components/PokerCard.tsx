import React from 'react';

interface PokerCardProps {
  rank: string;
  suit: string;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-8 h-12 text-xs',
  md: 'w-12 h-18 text-sm',
  lg: 'w-16 h-24 text-base',
};

const suitColors: Record<string, string> = {
  S: 'text-gray-900',
  H: 'text-red-600',
  D: 'text-red-600',
  C: 'text-gray-900',
};

const suitSymbols: Record<string, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const PokerCard: React.FC<PokerCardProps> = ({
  rank,
  suit,
  faceDown = false,
  size = 'md',
}) => {
  if (faceDown) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-md bg-gradient-to-br from-[#0d7a3e] to-[#0a5c2e] border-2 border-[#f5c518] flex items-center justify-center shadow-md`}
      >
        <div className="w-3/4 h-3/4 border border-[#f5c518]/50 rounded-sm flex items-center justify-center">
          <span className="text-[#f5c518] font-bold">♠♥</span>
        </div>
      </div>
    );
  }

  const color = suitColors[suit] || 'text-gray-900';
  const symbol = suitSymbols[suit] || suit;

  return (
    <div
      className={`${sizeClasses[size]} bg-white rounded-md border border-gray-300 shadow-md flex flex-col items-center justify-between py-1 px-1 ${color}`}
    >
      <div className="self-start leading-none font-bold">
        {rank}
      </div>
      <div className="text-lg leading-none">
        {symbol}
      </div>
      <div className="self-end leading-none font-bold rotate-180">
        {rank}
      </div>
    </div>
  );
};

export default PokerCard;
