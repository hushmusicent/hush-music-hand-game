import React, { useState, useEffect } from 'react';
import { Card, User, Room } from '../../types';
import { createDeck, getRankValue } from '../../utils/cards';
import { CardComponent } from '../CardComponent';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';

interface RummyState {
  stock: Card[];
  discard: Card[];
  hands: [Card[], Card[]];
  turn: number;
  phase: 'draw' | 'discard';
  scores: [number, number];
  round: number;
  over: boolean;
}

function initRummyGame(): RummyState {
  const deck = createDeck();
  const hands: [Card[], Card[]] = [
    [
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
    ],
    [
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
      deck.pop()!,
    ],
  ];

  const firstDiscard = deck.pop()!;

  return {
    stock: deck,
    discard: [firstDiscard],
    hands,
    turn: 0,
    phase: 'draw',
    scores: [0, 0],
    round: 1,
    over: false,
  };
}

function checkValidMelds(hand: Card[]): boolean {
  // Simple meld test: at least one 3-set or 3-run
  if (hand.length < 3) return false;
  const ranks: Record<string, number> = {};
  hand.forEach((c) => {
    ranks[c.r] = (ranks[c.r] || 0) + 1;
  });

  // 3-of-a-kind
  const hasSet = Object.values(ranks).some((cnt) => cnt >= 3);
  return hasSet;
}

interface RummyGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const RummyGame: React.FC<RummyGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  const [state, setState] = useState<RummyState>(initRummyGame);
  const [message, setMessage] = useState('Draw a card from the Stock deck or Discard pile');

  const rawSeat = pvpRoom && Array.isArray(pvpRoom.seats) ? pvpRoom.seats.indexOf(user.uid) : 0;
  const mySeat = rawSeat >= 0 ? rawSeat : (pvpRoom && pvpRoom.host === user.uid ? 0 : 1);
  const isMyTurn = !state.over && state.turn === mySeat;

  useEffect(() => {
    if (pvpRoom && pvpRoom.game === 'rummy' && pvpRoom.state && Array.isArray(pvpRoom.state.hands)) {
      setState(pvpRoom.state);
    } else if (pvpRoom && pvpRoom.game === 'rummy' && !pvpRoom.state && pvpRoom.host === user.uid) {
      Backend.updateRoom({
        ...pvpRoom,
        state,
        turn: state.turn,
      });
    }
  }, [pvpRoom]);

  const handleDraw = (source: 'stock' | 'discard') => {
    if (!isMyTurn || state.phase !== 'draw' || state.over) return;

    let nextStock = [...state.stock];
    let nextDiscard = [...state.discard];
    let drawnCard: Card | undefined;

    if (source === 'stock') {
      if (nextStock.length === 0) {
        // Reshuffle discard into stock
        const top = nextDiscard.pop()!;
        nextStock = createDeck();
        nextDiscard = [top];
      }
      drawnCard = nextStock.pop();
    } else {
      if (nextDiscard.length === 0) return;
      drawnCard = nextDiscard.pop();
    }

    if (!drawnCard) return;

    const nextHands: [Card[], Card[]] = [
      [...state.hands[0]],
      [...state.hands[1]],
    ];
    nextHands[mySeat].push(drawnCard);

    Sound.cardDeal();
    const nextState: RummyState = {
      ...state,
      stock: nextStock,
      discard: nextDiscard,
      hands: nextHands,
      phase: 'discard',
    };

    setState(nextState);
    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: nextState,
        turn: mySeat,
      });
    }
    setMessage('Card drawn! Select a card from your hand to discard.');
  };

  const handleDiscard = (idx: number) => {
    if (!isMyTurn || state.phase !== 'discard' || state.over) return;

    const nextHands: [Card[], Card[]] = [
      [...state.hands[0]],
      [...state.hands[1]],
    ];
    const discarded = nextHands[mySeat].splice(idx, 1)[0];
    const nextDiscard = [...state.discard, discarded];

    Sound.cardDeal();

    // Check if player completed full melds
    if (checkValidMelds(nextHands[mySeat])) {
      const nextScores: [number, number] = [...state.scores];
      nextScores[mySeat] += 25;

      if (nextScores[mySeat] >= 100) {
        // Match win
        const { user: updatedUser } = Backend.recordWin(user, 'rummy');
        onUpdateUser(updatedUser);
        const winState = {
          ...state,
          hands: nextHands,
          discard: nextDiscard,
          scores: nextScores,
          over: true,
        };
        setState(winState);
        if (pvpRoom) {
          Backend.updateRoom({
            ...pvpRoom,
            state: winState,
            status: 'done',
          });
        }
        setMessage('🎉 Rummy Champion! You scored 100+ points!');
        return;
      }
    }

    const nextTurn = mySeat === 0 ? 1 : 0;
    const nextState: RummyState = {
      ...state,
      hands: nextHands,
      discard: nextDiscard,
      phase: 'draw',
      turn: nextTurn,
    };

    setState(nextState);
    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: nextState,
        turn: nextTurn,
      });
    }
    if (!pvpRoom && nextTurn === 1) {
      setMessage("Computer's turn...");
      setTimeout(() => executeBotTurn(nextState), 700);
    } else {
      setMessage("Waiting for opponent's move...");
    }
  };

  const executeBotTurn = (s: RummyState) => {
    let nextStock = [...s.stock];
    let nextDiscard = [...s.discard];
    let card = nextStock.pop() || createDeck().pop()!;

    const nextHands: [Card[], Card[]] = [
      [...s.hands[0]],
      [...s.hands[1]],
    ];
    nextHands[1].push(card);

    // Bot discards highest rank
    nextHands[1].sort((a, b) => getRankValue(b.r) - getRankValue(a.r));
    const discarded = nextHands[1].shift()!;
    nextDiscard.push(discarded);

    Sound.cardDeal();

    const nextState: RummyState = {
      ...s,
      stock: nextStock,
      discard: nextDiscard,
      hands: nextHands,
      phase: 'draw',
      turn: 0,
    };

    setState(nextState);
    setMessage('Your turn — draw a card');
  };

  const myHand = (state.hands && state.hands[mySeat]) || [];
  const topDiscard = state.discard[state.discard.length - 1];

  const oppUid = pvpRoom && Array.isArray(pvpRoom.seats) ? pvpRoom.seats.find((s) => s !== user.uid) : null;
  const oppName = oppUid ? pvpRoom?.names?.[oppUid] || 'Opponent' : 'Rummy Bot';
  const oppAvatar = oppUid ? pvpRoom?.avatars?.[oppUid] : undefined;
  const isOppRobot = !pvpRoom;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Score Board */}
        <div className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
          <PlayerBadge
            name={user.username}
            avatar={user.avatar}
            subtitle={`${state.scores[mySeat]} pts`}
            isTurn={isMyTurn}
            size="sm"
          />

          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            ROUND {state.round}
          </span>

          <PlayerBadge
            name={oppName}
            avatar={oppAvatar}
            isRobot={isOppRobot}
            subtitle={`${state.scores[mySeat === 0 ? 1 : 0]} pts`}
            isTurn={!isMyTurn}
            size="sm"
            align="right"
          />
        </div>

        {/* Center Decks */}
        <div className="flex justify-center items-center gap-6 py-2">
          {/* Stock Pile */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-semibold text-slate-400 mb-1">
              Stock ({state.stock.length})
            </span>
            <CardComponent
              hidden
              onClick={() => handleDraw('stock')}
              className={isMyTurn && state.phase === 'draw' ? 'ring-2 ring-amber-400' : ''}
            />
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-semibold text-slate-400 mb-1">Discard</span>
            <CardComponent
              card={topDiscard}
              onClick={() => handleDraw('discard')}
              className={isMyTurn && state.phase === 'draw' ? 'ring-2 ring-amber-400' : ''}
            />
          </div>
        </div>

        {/* Message */}
        <div className="text-center text-xs font-bold text-amber-300">{message}</div>

        {/* Player Hand */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
            <span>YOUR CARDS ({myHand.length})</span>
            {state.phase === 'discard' && isMyTurn && (
              <span className="text-amber-400 animate-pulse">Tap card to discard</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {myHand.map((card, idx) => (
              <CardComponent
                key={idx}
                card={card}
                onClick={() => handleDiscard(idx)}
              />
            ))}
          </div>
        </div>
      </div>

      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
