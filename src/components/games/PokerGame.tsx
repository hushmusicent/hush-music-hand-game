import React, { useState } from 'react';
import { Card, User } from '../../types';
import {
  createDeck,
  evaluatePokerHand,
  comparePokerScores,
  POKER_HAND_NAMES,
} from '../../utils/cards';
import { CardComponent } from '../CardComponent';
import { BetWidget } from '../BetWidget';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';

interface PokerGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export const PokerGame: React.FC<PokerGameProps> = ({ user, onUpdateUser }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [cpuHand, setCpuHand] = useState<Card[]>([]);
  const [heldCards, setHeldCards] = useState<number[]>([]);
  const [bet, setBet] = useState(25);
  const [gameState, setGameState] = useState<'betting' | 'draw_phase' | 'showdown'>('betting');
  const [message, setMessage] = useState<{ text: string; type: 'win' | 'lose' | 'push' | 'info' }>({
    text: 'Place your bet. Five cards dealt to you and the house.',
    type: 'info',
  });

  const dealInitialHand = (wager: number) => {
    setBet(wager);
    const updatedUser = Backend.updatePoints(user, -wager, 'poker_bet');
    onUpdateUser(updatedUser);

    const newDeck = createDeck();
    const pHand = [
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
    ];
    const cHand = [
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
      newDeck.pop()!,
    ];

    setDeck(newDeck);
    setPlayerHand(pHand);
    setCpuHand(cHand);
    setHeldCards([]);
    setGameState('draw_phase');
    Sound.cardDeal();

    const pScore = evaluatePokerHand(pHand);
    setMessage({
      text: `Dealt: ${POKER_HAND_NAMES[pScore[0]]}. Tap cards you wish to HOLD, then press DRAW.`,
      type: 'info',
    });
  };

  const toggleHold = (idx: number) => {
    if (gameState !== 'draw_phase') return;
    Sound.click();
    if (heldCards.includes(idx)) {
      setHeldCards(heldCards.filter((i) => i !== idx));
    } else {
      setHeldCards([...heldCards, idx]);
    }
  };

  const executeDraw = () => {
    if (gameState !== 'draw_phase') return;

    const currentDeck = [...deck];
    // Replace unheld player cards
    const newPlayerHand = playerHand.map((card, idx) => {
      if (heldCards.includes(idx)) return card;
      return currentDeck.pop()!;
    });

    // Computer bot heuristic: holds pairs or high cards
    const cpuScore = evaluatePokerHand(cpuHand);
    const cpuRanks: Record<string, number[]> = {};
    cpuHand.forEach((c, idx) => {
      cpuRanks[c.r] = (cpuRanks[c.r] || []).concat(idx);
    });

    const cpuHoldIndices = new Set<number>();
    if (cpuScore[0] >= 1) {
      // hold pairs, triplets, etc.
      Object.values(cpuRanks).forEach((indices) => {
        if (indices.length >= 2) indices.forEach((i) => cpuHoldIndices.add(i));
      });
    } else {
      // high card hold (A, K, Q, J)
      cpuHand.forEach((c, idx) => {
        if (['A', 'K', 'Q', 'J'].includes(c.r)) cpuHoldIndices.add(idx);
      });
    }

    const newCpuHand = cpuHand.map((card, idx) => {
      if (cpuHoldIndices.has(idx)) return card;
      return currentDeck.pop()!;
    });

    setDeck(currentDeck);
    setPlayerHand(newPlayerHand);
    setCpuHand(newCpuHand);
    setGameState('showdown');
    Sound.cardDeal();

    const finalPlayerScore = evaluatePokerHand(newPlayerHand);
    const finalCpuScore = evaluatePokerHand(newCpuHand);
    const cmp = comparePokerScores(finalPlayerScore, finalCpuScore);

    const playerHandName = POKER_HAND_NAMES[finalPlayerScore[0]];
    const cpuHandName = POKER_HAND_NAMES[finalCpuScore[0]];

    if (cmp > 0) {
      // Multipliers based on strength
      const multipliers = [1, 2, 3, 4, 5, 7, 10, 25, 50];
      const mult = multipliers[finalPlayerScore[0]] || 2;
      const payout = bet * mult;
      const winUser = Backend.updatePoints(user, payout, 'poker_win');
      onUpdateUser(winUser);
      Sound.win();
      setMessage({
        text: `🎉 You win with ${playerHandName} vs Computer's ${cpuHandName}! Won ${payout} ⭐!`,
        type: 'win',
      });
    } else if (cmp < 0) {
      Sound.lose();
      setMessage({
        text: `Computer wins with ${cpuHandName} vs your ${playerHandName}. (-${bet} ⭐)`,
        type: 'lose',
      });
    } else {
      const pushUser = Backend.updatePoints(user, bet, 'poker_push');
      onUpdateUser(pushUser);
      setMessage({
        text: `Tie with matching ${playerHandName}! Bet returned.`,
        type: 'push',
      });
    }
  };

  const pScore = playerHand.length > 0 ? evaluatePokerHand(playerHand) : [0];
  const cScore = cpuHand.length > 0 ? evaluatePokerHand(cpuHand) : [0];

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Computer Hand */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <PlayerBadge
              name="Computer AI"
              isRobot={true}
              subtitle="House Dealer"
              size="sm"
            />
            <span className="text-xs text-slate-400 font-semibold">
              {gameState === 'showdown' ? POKER_HAND_NAMES[cScore[0]] : 'Cards Face Down'}
            </span>
          </div>
          <div className="flex gap-1.5 justify-center">
            {cpuHand.map((card, idx) => (
              <CardComponent
                key={idx}
                card={card}
                hidden={gameState !== 'showdown'}
                small
              />
            ))}
          </div>
        </div>

        <div className="border-t border-slate-800" />

        {/* Player Hand */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <PlayerBadge
              name={user.username}
              avatar={user.avatar}
              subtitle="Player"
              size="sm"
            />
            <span className="text-amber-400 font-bold text-xs">
              {playerHand.length > 0 ? POKER_HAND_NAMES[pScore[0]] : ''}
            </span>
          </div>
          <div className="flex gap-1.5 justify-center">
            {playerHand.map((card, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <CardComponent
                  card={card}
                  selected={heldCards.includes(idx)}
                  onClick={() => toggleHold(idx)}
                />
                {gameState === 'draw_phase' && (
                  <span
                    className={`text-[10px] font-bold mt-1 uppercase ${
                      heldCards.includes(idx) ? 'text-amber-400' : 'text-slate-600'
                    }`}
                  >
                    {heldCards.includes(idx) ? 'HELD' : 'DRAW'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Message */}
        <div
          className={`text-center text-xs md:text-sm font-semibold p-2.5 rounded-lg border ${
            message.type === 'win'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : message.type === 'lose'
              ? 'bg-rose-950/40 border-rose-800 text-rose-300'
              : message.type === 'push'
              ? 'bg-amber-950/40 border-amber-800 text-amber-300'
              : 'bg-slate-950/60 border-slate-800 text-slate-300'
          }`}
        >
          {message.text}
        </div>

        {/* Action button */}
        {gameState === 'draw_phase' && (
          <button
            type="button"
            onClick={executeDraw}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl transition-all shadow-md active:scale-95"
          >
            DRAW CARDS ({5 - heldCards.length} Replacement
            {5 - heldCards.length === 1 ? '' : 's'})
          </button>
        )}

        {gameState === 'showdown' && (
          <button
            type="button"
            onClick={() => setGameState('betting')}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl transition-all shadow-md active:scale-95"
          >
            NEXT POKER HAND
          </button>
        )}
      </div>

      {gameState === 'betting' && (
        <BetWidget balance={user.points} onBet={dealInitialHand} />
      )}
    </div>
  );
};
