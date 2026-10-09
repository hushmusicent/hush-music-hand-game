import React, { useState } from 'react';
import { Card, User } from '../../types';
import { createDeck, calculateBlackjackValue } from '../../utils/cards';
import { CardComponent } from '../CardComponent';
import { BetWidget } from '../BetWidget';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';

interface BlackjackGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ user, onUpdateUser }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [bet, setBet] = useState(25);
  const [gameState, setGameState] = useState<'betting' | 'playing' | 'dealer_turn' | 'game_over'>('betting');
  const [message, setMessage] = useState<{ text: string; type: 'win' | 'lose' | 'push' | 'info' }>({
    text: 'Place your bet to start the hand. Dealer stands on 17.',
    type: 'info',
  });

  const startHand = (betAmount: number) => {
    setBet(betAmount);
    const updatedUser = Backend.updatePoints(user, -betAmount, 'blackjack_bet');
    onUpdateUser(updatedUser);

    const newDeck = createDeck();
    const pHand = [newDeck.pop()!, newDeck.pop()!];
    const dHand = [newDeck.pop()!, newDeck.pop()!];

    setDeck(newDeck);
    setPlayerHand(pHand);
    setDealerHand(dHand);
    Sound.cardDeal();

    const pVal = calculateBlackjackValue(pHand);
    const dVal = calculateBlackjackValue(dHand);

    if (pVal === 21) {
      if (dVal === 21) {
        // Push
        const pushedUser = Backend.updatePoints(updatedUser, betAmount, 'blackjack_push');
        onUpdateUser(pushedUser);
        setGameState('game_over');
        setMessage({ text: 'Both players have Blackjack! Push (Bet returned).', type: 'push' });
      } else {
        // Natural Blackjack payout (3:2 = 2.5x total returned)
        const payout = Math.floor(betAmount * 2.5);
        const winUser = Backend.updatePoints(updatedUser, payout, 'blackjack_natural');
        onUpdateUser(winUser);
        setGameState('game_over');
        Sound.jackpot();
        setMessage({ text: `🎉 NATURAL BLACKJACK! Won ${payout} ⭐!`, type: 'win' });
      }
    } else {
      setGameState('playing');
      setMessage({ text: 'Hit to take another card or Stand with your total.', type: 'info' });
    }
  };

  const handleHit = () => {
    if (gameState !== 'playing') return;
    const currentDeck = [...deck];
    const nextCard = currentDeck.pop();
    if (!nextCard) return;

    const newHand = [...playerHand, nextCard];
    setDeck(currentDeck);
    setPlayerHand(newHand);
    Sound.cardDeal();

    const val = calculateBlackjackValue(newHand);
    if (val > 21) {
      setGameState('game_over');
      Sound.lose();
      setMessage({ text: `Bust! You exceeded 21 (${val}). Dealer wins.`, type: 'lose' });
    } else if (val === 21) {
      handleStand(newHand);
    }
  };

  const handleStand = (pHand = playerHand) => {
    if (gameState !== 'playing') return;
    setGameState('dealer_turn');

    const currentDeck = [...deck];
    const currentDealer = [...dealerHand];

    while (calculateBlackjackValue(currentDealer) < 17) {
      const card = currentDeck.pop();
      if (card) currentDealer.push(card);
    }

    setDeck(currentDeck);
    setDealerHand(currentDealer);
    setGameState('game_over');

    const pScore = calculateBlackjackValue(pHand);
    const dScore = calculateBlackjackValue(currentDealer);

    if (dScore > 21) {
      const winPayout = bet * 2;
      const winUser = Backend.updatePoints(user, winPayout, 'blackjack_win');
      onUpdateUser(winUser);
      Sound.win();
      setMessage({ text: `Dealer busts with ${dScore}! You win ${winPayout} ⭐!`, type: 'win' });
    } else if (dScore > pScore) {
      Sound.lose();
      setMessage({ text: `Dealer wins with ${dScore} vs your ${pScore}.`, type: 'lose' });
    } else if (pScore > dScore) {
      const winPayout = bet * 2;
      const winUser = Backend.updatePoints(user, winPayout, 'blackjack_win');
      onUpdateUser(winUser);
      Sound.win();
      setMessage({ text: `You win with ${pScore} vs dealer's ${dScore}! (+${winPayout} ⭐)`, type: 'win' });
    } else {
      const pushUser = Backend.updatePoints(user, bet, 'blackjack_push');
      onUpdateUser(pushUser);
      setMessage({ text: `Push with matching scores (${pScore}). Bet returned.`, type: 'push' });
    }
  };

  const resetHand = () => {
    setGameState('betting');
    setMessage({ text: 'Place your bet to start the hand.', type: 'info' });
  };

  const pScore = calculateBlackjackValue(playerHand);
  const dScore = calculateBlackjackValue(dealerHand);
  const hideHole = gameState === 'playing';

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Table Surface */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative">
        {/* Dealer Zone */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <PlayerBadge
              name="Dealer Bot"
              isRobot={true}
              subtitle="Casino House AI"
              size="sm"
            />
            <span className="text-xs text-slate-400 font-semibold">
              {hideHole ? '(Hole Card Hidden)' : `Total: ${dScore}`}
            </span>
          </div>
          <div className="flex gap-2 min-h-24 items-center">
            {dealerHand.map((card, idx) => (
              <CardComponent key={idx} card={card} hidden={hideHole && idx === 1} />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800/80 my-4" />

        {/* Player Zone */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <PlayerBadge
              name={user.username}
              avatar={user.avatar}
              subtitle="Player"
              size="sm"
            />
            <span className="text-amber-400 font-bold text-xs md:text-sm">
              {playerHand.length > 0 ? `Total: ${pScore}` : ''}
            </span>
          </div>
          <div className="flex gap-2 min-h-24 items-center">
            {playerHand.map((card, idx) => (
              <CardComponent key={idx} card={card} />
            ))}
          </div>
        </div>

        {/* Status Message */}
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

        {/* Active Hand Action Buttons */}
        {gameState === 'playing' && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={handleHit}
              className="py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all shadow-md"
            >
              HIT
            </button>
            <button
              type="button"
              onClick={() => handleStand()}
              className="py-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold rounded-xl transition-all border border-slate-700"
            >
              STAND
            </button>
          </div>
        )}

        {gameState === 'game_over' && (
          <button
            type="button"
            onClick={resetHand}
            className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all shadow-md"
          >
            PLAY NEXT HAND
          </button>
        )}
      </div>

      {/* Betting widget when between hands */}
      {gameState === 'betting' && (
        <BetWidget balance={user.points} onBet={startHand} />
      )}
    </div>
  );
};
