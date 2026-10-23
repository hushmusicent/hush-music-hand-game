import React, { useState, useEffect, useRef } from 'react';
import { Card, User, Room } from '../../types';
import { createDeck, getRankValue, SUITS } from '../../utils/cards';
import { CardComponent } from '../CardComponent';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import { ChatBox } from '../ChatBox';
import { useVoiceChat } from '../../hooks/useVoiceChat';

interface PlayedCard {
  seat: number;
  card: Card;
}

interface SpadesState {
  hands: Card[][];
  bids: (number | null)[];
  tricks: number[];
  trick: PlayedCard[];
  handLeader?: number; // Starting leader/dealer for the hand, rotates clockwise each hand
  leader: number;     // Leader of the current trick
  turn: number;
  phase: 'bid' | 'play';
  scores: number[];
  handNumber: number;
  broken: boolean;
  over: boolean;
}

function computeBotBid(hand: Card[]): number {
  let est = 0;
  (hand || []).forEach((c) => {
    if (c.s === '♠' && getRankValue(c.r) >= 11) est++;
    if (c.r === 'A') est++;
    if (c.s === '♠' && getRankValue(c.r) >= 14) est++;
  });
  return Math.max(1, Math.min(6, est || 1));
}

function initSpadesHand(
  scores: number[] = [0, 0, 0, 0],
  handNumber: number = 1,
  handLeader?: number,
  botSeatCheck?: (seatIdx: number) => boolean
): SpadesState {
  const deck = createDeck();
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < 13; i++) {
    for (let s = 0; s < 4; s++) {
      hands[s].push(deck.pop()!);
    }
  }

  // Sort each hand by suit and rank
  hands.forEach((h) => {
    h.sort((a, b) => {
      const sOrder = SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
      if (sOrder !== 0) return sOrder;
      return getRankValue(b.r) - getRankValue(a.r);
    });
  });

  const nextHandLeader = typeof handLeader === 'number' ? handLeader : (handNumber - 1) % 4;
  const bids: (number | null)[] = [null, null, null, null];
  if (botSeatCheck) {
    for (let s = 0; s < 4; s++) {
      if (botSeatCheck(s)) {
        bids[s] = computeBotBid(hands[s]);
      }
    }
  }

  return {
    hands,
    bids,
    tricks: [0, 0, 0, 0],
    trick: [],
    handLeader: nextHandLeader,
    leader: nextHandLeader,
    turn: nextHandLeader,
    phase: 'bid',
    scores: [...scores],
    handNumber,
    broken: false,
    over: false,
  };
}

function evaluateTrickWinner(trick: PlayedCard[], ledSuit: Card['s']): number {
  let winner = trick[0];
  for (const play of trick) {
    if (play.card.s === '♠' && winner.card.s !== '♠') {
      winner = play;
    } else if (play.card.s === winner.card.s) {
      if (getRankValue(play.card.r) > getRankValue(winner.card.r)) {
        winner = play;
      }
    }
  }
  return winner.seat;
}

interface SpadesGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
  pvpRoom?: Room | null;
}

export const SpadesGame: React.FC<SpadesGameProps> = ({
  user,
  onUpdateUser,
  pvpRoom,
}) => {
  // Robust seat index lookup for user across potential prefix/suffix variations
  const mySeat = (() => {
    if (!pvpRoom?.seats || !Array.isArray(pvpRoom.seats)) return 0;
    const clean = (u: any) => String(u || '').trim().replace(/^[@#]/, '').toLowerCase();
    const targetUid = clean(user.uid);
    const targetUsername = clean(user.username);

    // 1. Exact UID match
    let idx = pvpRoom.seats.findIndex((s) => clean(s) === targetUid);
    if (idx >= 0) return idx;

    // 2. Check with _p2 or without _p2
    idx = pvpRoom.seats.findIndex(
      (s) =>
        clean(s) === `${targetUid}_p2` ||
        clean(s).replace(/_p2$/, '') === targetUid
    );
    if (idx >= 0) return idx;

    // 3. Fallback check by username in names mapping
    if (pvpRoom.names) {
      idx = pvpRoom.seats.findIndex((s) => clean(pvpRoom.names[s]) === targetUsername);
      if (idx >= 0) return idx;
    }

    // 4. Default: If user is the host, seat 0; otherwise opponent in seat 1
    return clean(pvpRoom.host) === targetUid ? 0 : 1;
  })();

  const isBotSeat = (seatIdx: number): boolean => {
    if (!pvpRoom || !pvpRoom.seats || !Array.isArray(pvpRoom.seats)) {
      // In Solo / Vs Bot mode, any seat other than mySeat is a bot
      return seatIdx !== mySeat;
    }
    // In PvP mode, human player sitting at this client is never a bot
    if (seatIdx === mySeat) return false;

    const seatOccupant = pvpRoom.seats[seatIdx];
    // If seat has no assigned player (e.g. seats 2 and 3 in a 2-player room), it is a bot
    if (!seatOccupant) return true;

    // If assigned player is a bot or test opponent
    if (
      typeof seatOccupant === 'string' &&
      (seatOccupant.startsWith('bot_') || seatOccupant.includes('_p2') || seatOccupant.includes('test'))
    ) {
      return true;
    }

    // Real human opponent
    return false;
  };

  const [state, setState] = useState<SpadesState>(() => initSpadesHand([0, 0, 0, 0], 1, 0, isBotSeat));
  const [message, setMessage] = useState('Bidding Phase — place your trick bid');
  const { participants: voiceParticipants } = useVoiceChat(pvpRoom ?? null, user);

  const isMyTurn = !state?.over && state?.turn === mySeat;

  const normalizeBids = (raw: any): (number | null)[] => {
    if (!raw) return [null, null, null, null];
    return [0, 1, 2, 3].map((idx) => {
      const v = Array.isArray(raw) ? raw[idx] : (raw[String(idx)] ?? raw[idx]);
      return typeof v === 'number' && !isNaN(v) ? v : null;
    });
  };

  const recordedWinRef = useRef(false);
  const botTurnRunningRef = useRef(false);

  useEffect(() => {
    if (pvpRoom && pvpRoom.game === 'spades' && pvpRoom.state) {
      const s = pvpRoom.state;
      setState({
        hands: Array.isArray(s.hands) ? s.hands.map((h: any) => Array.isArray(h) ? h : []) : [[], [], [], []],
        bids: normalizeBids(s.bids),
        tricks: Array.isArray(s.tricks) ? s.tricks : [0, 0, 0, 0],
        trick: Array.isArray(s.trick) ? s.trick : [],
        handLeader: typeof s.handLeader === 'number' ? s.handLeader : (typeof s.handNumber === 'number' ? (s.handNumber - 1) % 4 : 0),
        leader: typeof s.leader === 'number' ? s.leader : 0,
        turn: typeof s.turn === 'number' ? s.turn : 0,
        phase: s.phase === 'play' ? 'play' : 'bid',
        scores: Array.isArray(s.scores) ? s.scores : [0, 0, 0, 0],
        handNumber: typeof s.handNumber === 'number' ? s.handNumber : 1,
        broken: !!s.broken,
        over: !!s.over,
      });

      if (s.over && !recordedWinRef.current) {
        const scores = Array.isArray(s.scores) ? s.scores : [0, 0, 0, 0];
        if (scores[mySeat] === Math.max(...scores)) {
          recordedWinRef.current = true;
          const { user: updatedUser } = Backend.recordWin(user, 'spades');
          onUpdateUser(updatedUser);
        }
      }
    } else if (pvpRoom && pvpRoom.game === 'spades' && !pvpRoom.state && pvpRoom.host === user.uid) {
      // Host syncs initial state to server room so all players share the exact same hand & deck
      Backend.updateRoom({
        ...pvpRoom,
        state,
        turn: state.turn,
      });
    }
  }, [pvpRoom, mySeat]);

  const safeScores = Array.isArray(state?.scores) ? state.scores : [0, 0, 0, 0];
  const safeBids = normalizeBids(state?.bids);
  const safeTricks = Array.isArray(state?.tricks) ? state.tricks : [0, 0, 0, 0];
  const safeHands = Array.isArray(state?.hands) ? state.hands : [[], [], [], []];
  const safeTrick = Array.isArray(state?.trick) ? state.trick : [];
  const myHand = safeHands[mySeat] || [];

  // Dedicated reactive bot runner for Spades:
  // Automatically triggers whenever it is a bot's turn during 'play' phase.
  // In PvP, Host executes at a snappy 220ms; non-host has a safety fallback at 900ms.
  // In solo play, user executes at 220ms.
  useEffect(() => {
    if (state.phase !== 'play' || state.over || !isBotSeat(state.turn)) {
      return;
    }
    // Do not play if a 4-card trick is currently showing on table
    if (state.trick && state.trick.length >= 4) {
      return;
    }

    const isHost = !pvpRoom || pvpRoom.host === user.uid;
    const delay = isHost ? 220 : 900;

    const timer = setTimeout(() => {
      if (
        state.phase === 'play' &&
        !state.over &&
        isBotSeat(state.turn) &&
        (!state.trick || state.trick.length < 4)
      ) {
        executeBotTurn(state);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [state.phase, state.turn, state.trick?.length, state.over, pvpRoom?.host, user.uid, mySeat]);

  // Ensure bot bids are auto-filled promptly in both Vs Bot and Online PvP modes
  // Does NOT assume seat 0 is human, works for any seat mySeat is in!
  useEffect(() => {
    if (state.phase !== 'bid' || state.over) return;
    const isHost = !pvpRoom || pvpRoom.host === user.uid;
    if (!isHost) return;

    const bids = normalizeBids(state.bids);
    const missingBotSeats = [0, 1, 2, 3].filter((s) => isBotSeat(s) && bids[s] === null);

    if (missingBotSeats.length > 0) {
      const nextBids = [...bids];
      for (const s of missingBotSeats) {
        nextBids[s] = computeBotBid(safeHands[s] || []);
      }
      const allPlaced = nextBids.every((b) => typeof b === 'number');
      const leaderSeat = typeof state.handLeader === 'number' ? state.handLeader : state.leader;
      const nextState: SpadesState = {
        ...state,
        bids: nextBids,
        phase: allPlaced ? 'play' : 'bid',
        turn: allPlaced ? leaderSeat : state.turn,
      };
      setState(nextState);
      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: nextState,
          turn: nextState.turn,
        });
      }
      if (allPlaced && isBotSeat(leaderSeat) && (!pvpRoom || pvpRoom.host === user.uid)) {
        setTimeout(() => executeBotTurn(nextState), 220);
      }
    }
  }, [state.phase, state.bids, state.over, pvpRoom?.host, user.uid, mySeat]);

  const handlePlaceBid = (bid: number) => {
    if (state.phase !== 'bid' || safeBids[mySeat] !== null) return;
    Sound.chipBet();

    const nextBids = [...safeBids];
    nextBids[mySeat] = bid;

    // Fill bot bids for any bot seats that haven't bid yet
    for (let s = 0; s < 4; s++) {
      if (nextBids[s] === null && isBotSeat(s)) {
        nextBids[s] = computeBotBid(safeHands[s] || []);
      }
    }

    const allPlaced = nextBids.every((b) => typeof b === 'number');
    const nextPhase = allPlaced ? 'play' : 'bid';
    const leaderSeat = typeof state.handLeader === 'number' ? state.handLeader : state.leader;

    const nextState: SpadesState = {
      ...state,
      bids: nextBids,
      phase: nextPhase,
      turn: allPlaced ? leaderSeat : state.turn,
    };

    setState(nextState);
    if (allPlaced) {
      const leaderInfo = getPlayerInfo(leaderSeat);
      setMessage(leaderSeat === mySeat ? 'Bids placed! Lead your card.' : `Bids placed! ${leaderInfo.name} has the lead.`);
    } else {
      setMessage(`Your bid placed (${bid}). Waiting for other player to bid...`);
    }

    if (pvpRoom) {
      Backend.updateRoom({
        ...pvpRoom,
        state: nextState,
        turn: nextState.turn,
      });
    }

    if (allPlaced && isBotSeat(leaderSeat) && (!pvpRoom || pvpRoom.host === user.uid)) {
      setTimeout(() => executeBotTurn(nextState), 220);
    }
  };

  const handlePlayCard = (cardIdx: number) => {
    if (state.phase !== 'play' || !isMyTurn || state.over) return;
    const card = myHand[cardIdx];
    if (!card) return;

    // Check legal lead
    if (safeTrick.length === 0) {
      if (card.s === '♠' && !state.broken) {
        const onlySpades = myHand.every((c) => c.s === '♠');
        if (!onlySpades) {
          setMessage('Spades are not broken yet! Lead another suit.');
          Sound.lose();
          return;
        }
      }
    } else {
      // Must follow suit if able
      const ledSuit = safeTrick[0].card.s;
      const hasLed = myHand.some((c) => c.s === ledSuit);
      if (hasLed && card.s !== ledSuit) {
        setMessage(`You must follow suit with ${ledSuit}.`);
        Sound.lose();
        return;
      }
    }

    const nextHands = safeHands.map((h) => [...h]);
    nextHands[mySeat].splice(cardIdx, 1);

    const isBroken = state.broken || card.s === '♠';
    const nextTrick = [...safeTrick, { seat: mySeat, card }];
    Sound.cardDeal();

    if (nextTrick.length === 4) {
      const interimState: SpadesState = {
        ...state,
        hands: nextHands,
        trick: nextTrick,
        broken: isBroken,
      };
      setState(interimState);
      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: interimState,
          turn: -1,
        });
      }
      setTimeout(() => {
        resolveCompletedTrick(nextHands, nextTrick, isBroken, interimState);
      }, 550);
    } else {
      const nextTurn = (state.turn + 1) % 4;
      const nextState: SpadesState = {
        ...state,
        hands: nextHands,
        trick: nextTrick,
        broken: isBroken,
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
      if (isBotSeat(nextTurn) && (!pvpRoom || pvpRoom.host === user.uid)) {
        setTimeout(() => executeBotTurn(nextState), 220);
      }
    }
  };

  const executeBotTurn = (s: SpadesState) => {
    if (botTurnRunningRef.current) return;
    botTurnRunningRef.current = true;
    try {
      const curHand = s.hands?.[s.turn] || [];
      if (curHand.length === 0) return;
      const ledSuit = s.trick && s.trick.length > 0 ? s.trick[0].card.s : null;

      let playableCards = curHand;
      if (!ledSuit) {
        // Leading
        playableCards = curHand.filter((c) => c.s !== '♠' || s.broken);
        if (playableCards.length === 0) playableCards = curHand;
      } else {
        const follow = curHand.filter((c) => c.s === ledSuit);
        if (follow.length > 0) playableCards = follow;
      }

      // Pick a card
      const chosen = playableCards[0] || curHand[0];
      const chosenIdx = curHand.indexOf(chosen);

      const nextHands = s.hands.map((h) => [...h]);
      nextHands[s.turn].splice(chosenIdx, 1);

      const isBroken = s.broken || chosen.s === '♠';
      const nextTrick = [...(s.trick || []), { seat: s.turn, card: chosen }];
      Sound.cardDeal();

      if (nextTrick.length === 4) {
        const interimState: SpadesState = {
          ...s,
          hands: nextHands,
          trick: nextTrick,
          broken: isBroken,
        };
        setState(interimState);
        if (pvpRoom) {
          Backend.updateRoom({
            ...pvpRoom,
            state: interimState,
            turn: -1,
          });
        }
        setTimeout(() => {
          resolveCompletedTrick(nextHands, nextTrick, isBroken, interimState);
        }, 550);
      } else {
        const nextTurn = (s.turn + 1) % 4;
        const nextState: SpadesState = {
          ...s,
          hands: nextHands,
          trick: nextTrick,
          broken: isBroken,
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
        if (isBotSeat(nextTurn) && (!pvpRoom || pvpRoom.host === user.uid)) {
          setTimeout(() => executeBotTurn(nextState), 220);
        }
      }
    } finally {
      botTurnRunningRef.current = false;
    }
  };

  const resolveCompletedTrick = (
    hands: Card[][],
    trick: PlayedCard[],
    broken: boolean,
    prevState?: SpadesState
  ) => {
    const winnerSeat = evaluateTrickWinner(trick, trick[0].card.s);
    const prevTricks = Array.isArray(prevState?.tricks || state?.tricks)
      ? [...(prevState?.tricks || state.tricks)]
      : [0, 0, 0, 0];
    const nextTricks = [...prevTricks];
    nextTricks[winnerSeat]++;

    // A hand is complete when all cards from all hands have been played
    const isHandComplete = hands.every((h) => !h || h.length === 0);

    if (isHandComplete) {
      // Calculate hand scores using the scores and bids from the completed hand
      const safeScoresAtEnd = Array.isArray(prevState?.scores || state?.scores)
        ? [...(prevState?.scores || state.scores)]
        : [0, 0, 0, 0];
      const safeBidsAtEnd = normalizeBids(prevState?.bids || state?.bids);

      const nextScores = [...safeScoresAtEnd];
      for (let s = 0; s < 4; s++) {
        const bid = safeBidsAtEnd[s] || 1;
        const won = nextTricks[s];
        if (won >= bid) {
          nextScores[s] += bid * 10 + (won - bid);
        } else {
          nextScores[s] -= bid * 10;
        }
      }

      const matchWon = nextScores.some((sc) => sc >= 250);
      const nextState: SpadesState = {
        ...state,
        hands,
        tricks: nextTricks,
        trick: [],
        scores: nextScores,
        broken,
        over: matchWon,
      };

      if (matchWon) {
        setState(nextState);
        if (nextScores[mySeat] === Math.max(...nextScores)) {
          recordedWinRef.current = true;
          const { user: updatedUser } = Backend.recordWin(user, 'spades');
          onUpdateUser(updatedUser);
          setMessage(`🎉 Spades Champion! You won with ${nextScores[mySeat]} points!`);
        } else {
          Sound.lose();
          setMessage('Spades match ended. Opponent reached 250 first.');
        }
        if (pvpRoom) {
          Backend.updateRoom({
            ...pvpRoom,
            state: nextState,
            status: 'done',
          });
        }
      } else {
        // Automatically deal hand N+1 with scores carried over!
        // The hand leader rotates clockwise: Hand 1 -> 0, Hand 2 -> 1, Hand 3 -> 2, Hand 4 -> 3
        const prevHandNum = (prevState?.handNumber ?? state.handNumber) || 1;
        const nextHandNumber = prevHandNum + 1;
        const nextHandLeader = (nextHandNumber - 1) % 4;

        const fresh = initSpadesHand(nextScores, nextHandNumber, nextHandLeader, isBotSeat);

        setState(fresh);
        if (pvpRoom) {
          Backend.updateRoom({
            ...pvpRoom,
            state: fresh,
            turn: fresh.turn,
          });
        }
        const leaderInfo = getPlayerInfo(nextHandLeader);
        setMessage(
          `Hand #${prevHandNum} finished! Dealing hand #${fresh.handNumber}... Scores carried over. ${leaderInfo.name} has the lead.`
        );
      }
    } else {
      const nextState: SpadesState = {
        ...state,
        hands,
        tricks: nextTricks,
        trick: [],
        broken,
        turn: winnerSeat,
        leader: winnerSeat,
      };
      setState(nextState);
      const winnerInfo = getPlayerInfo(winnerSeat);
      setMessage(`${winnerInfo.name} won the trick.`);

      if (pvpRoom) {
        Backend.updateRoom({
          ...pvpRoom,
          state: nextState,
          turn: nextState.turn,
        });
      }
      if (isBotSeat(winnerSeat) && (!pvpRoom || pvpRoom.host === user.uid)) {
        setTimeout(() => executeBotTurn(nextState), 220);
      }
    }
  };

  const getPlayerInfo = (s: number) => {
    if (pvpRoom && pvpRoom.seats && pvpRoom.seats[s]) {
      const uid = pvpRoom.seats[s];
      return {
        name: (pvpRoom.names && pvpRoom.names[uid]) || `Player ${s + 1}`,
        avatar: pvpRoom.avatars?.[uid] || (uid === user.uid ? user.avatar : undefined),
        isRobot:
          typeof uid === 'string' &&
          (uid.startsWith('bot_') || uid.includes('_p2') || uid.includes('test')),
      };
    }
    if (s === mySeat) {
      return {
        name: user.username,
        avatar: user.avatar,
        isRobot: false,
      };
    }
    const botNames = ['South Bot', 'East Bot', 'North Bot', 'West Bot'];
    return {
      name: botNames[s] || `Bot ${s + 1}`,
      avatar: undefined,
      isRobot: true,
    };
  };

  let displayMessage = message;
  if (!state.over) {
    if (state.phase === 'bid') {
      if (safeBids[mySeat] === null || safeBids[mySeat] === undefined) {
        displayMessage = `Hand #${state.handNumber || 1} Bidding — Select your trick bid (1 - 6)`;
      } else {
        const remainingHumans = [0, 1, 2, 3].filter((s) => !isBotSeat(s) && safeBids[s] === null);
        if (remainingHumans.length > 0) {
          const names = remainingHumans.map((s) => getPlayerInfo(s).name).join(', ');
          displayMessage = `Your bid placed (${safeBids[mySeat]}). Waiting for ${names} to bid...`;
        } else {
          displayMessage = `Your bid placed (${safeBids[mySeat]}). Starting play...`;
        }
      }
    } else if (state.phase === 'play') {
      if (isMyTurn) {
        displayMessage =
          safeTrick.length === 0
            ? 'Your lead! Select a card to play.'
            : 'Your turn! Follow suit if possible.';
      } else {
        const turnInfo = getPlayerInfo(state.turn);
        displayMessage = `Waiting for ${turnInfo.name} to play...`;
      }
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-4">
        {/* Hand & Match Status Header */}
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-400 font-semibold border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              Hand #{state.handNumber || 1}
            </span>
            <span>Target: 250 pts</span>
          </div>
          <span className={state.broken ? 'text-amber-400 font-bold' : 'text-slate-500'}>
            Spades {state.broken ? 'Broken ♠' : 'Unbroken'}
          </span>
        </div>

        {/* Scoreboard */}
        <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800 text-center">
          {[0, 1, 2, 3].map((s) => {
            const info = getPlayerInfo(s);
            const isTurn = state.turn === s;
            const seatUid = pvpRoom?.seats?.[s];
            const voiceUser = voiceParticipants.find(
              (p) => p.uid === seatUid || (s === mySeat && p.uid === user.uid)
            );
            const isSpeaking = !info.isRobot && !!voiceUser?.isSpeaking;
            const isMuted = !info.isRobot && !!voiceUser?.isMuted;

            return (
              <div
                key={s}
                className={`flex flex-col items-center p-1 rounded-lg ${
                  isTurn ? 'bg-amber-500/10 border border-amber-500/30' : ''
                }`}
              >
                <PlayerBadge
                  name={info.name}
                  avatar={info.avatar}
                  isRobot={info.isRobot}
                  isTurn={isTurn}
                  isSpeaking={isSpeaking}
                  isMuted={isMuted}
                  size="sm"
                  align="center"
                />
                <span className="text-sm font-black text-amber-400 mt-1">{safeScores[s] ?? 0}</span>
                <span className="text-[9px] text-slate-500">
                  Bid: {safeBids[s] ?? '-'} | {safeTricks[s] ?? 0}
                </span>
                {s !== mySeat && (
                  <div
                    className="flex items-center gap-1 mt-1 text-[10px] text-amber-400/80 font-bold"
                    title={`${safeHands[s]?.length || 0} cards in hand`}
                  >
                    <CardComponent hidden small className="w-4 h-5.5 p-0! pointer-events-none" />
                    <span>{safeHands[s]?.length || 0}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Current Table Trick */}
        <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-center space-y-2">
          <div className="text-xs font-semibold text-emerald-400">
            {safeTrick.length === 0 ? 'Table ready for lead card' : `Current Trick (${safeTrick.length}/4)`}
          </div>
          <div className="flex gap-2 justify-center min-h-16 items-center">
            {safeTrick.map((play, idx) => {
              const info = getPlayerInfo(play.seat);
              return (
                <div key={idx} className="flex flex-col items-center">
                  <CardComponent card={play.card} small />
                  <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[60px]">
                    {info.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status Message */}
        <div className="text-center text-xs font-bold text-amber-300">{displayMessage}</div>

        {/* Bidding Buttons */}
        {state.phase === 'bid' && (safeBids[mySeat] === null || safeBids[mySeat] === undefined) && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-400 block text-center">
              Select Your Trick Bid:
            </span>
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 3, 4, 5, 6].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handlePlaceBid(b)}
                  className="py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs cursor-pointer"
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Player's Hand */}
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1.5">
            YOUR HAND ({myHand.length} cards)
          </span>
          <div className="flex flex-wrap gap-1 justify-center max-h-56 overflow-y-auto p-1 bg-slate-950 rounded-lg border border-slate-800">
            {myHand.map((card, idx) => (
              <CardComponent
                key={idx}
                card={card}
                small
                onClick={() => handlePlayCard(idx)}
              />
            ))}
          </div>
        </div>
      </div>

      {pvpRoom && <ChatBox channel={`room_${pvpRoom.code}`} currentUser={user} />}
    </div>
  );
};
