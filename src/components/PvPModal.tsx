import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  LogIn,
  X,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Sparkles,
  Share2,
  Bot,
  Play,
  Trash2,
} from 'lucide-react';
import { GameId, User, Room } from '../types';
import { Backend } from '../utils/backend';
import { Sound } from '../utils/sound';

interface PvPModalProps {
  gameId?: GameId;
  currentUser: User;
  seatsNeeded?: number;
  isOpen: boolean;
  onClose: () => void;
  onRoomJoined: (room: Room) => void;
}

const PVP_GAMES: { id: GameId; name: string; icon: string; seats: number }[] = [
  { id: 'checkers', name: 'Checkers', icon: '🔴', seats: 2 },
  { id: 'chess', name: 'Chess', icon: '♟️', seats: 2 },
  { id: 'dominoes', name: 'Dominoes', icon: '🀄', seats: 2 },
  { id: 'spades', name: 'Spades', icon: '♠️', seats: 2 },
  { id: 'rummy', name: 'Rummy', icon: '🃏', seats: 2 },
  { id: 'backgammon', name: 'Backgammon', icon: '🎲', seats: 2 },
];

export const PvPModal: React.FC<PvPModalProps> = ({
  gameId: initialGameId = 'checkers',
  currentUser,
  seatsNeeded: initialSeatsNeeded = 2,
  isOpen,
  onClose,
  onRoomJoined,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<GameId>(initialGameId);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [openRooms, setOpenRooms] = useState<Room[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [playerJoinedNotice, setPlayerJoinedNotice] = useState(false);
  const [filterGame, setFilterGame] = useState<string>('all');

  const [friends, setFriends] = useState<{ uid: string; username: string; avatar?: string }[]>([]);
  const [invitedFriends, setInvitedFriends] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialGameId) {
      setSelectedGameId(initialGameId);
    }
  }, [initialGameId]);

  // Load all active waiting rooms & friends
  const loadOpenRooms = async () => {
    setIsRefreshingRooms(true);
    try {
      const [list, fList] = await Promise.all([
        Backend.getOpenRooms(),
        Backend.getFriendsListAsync(currentUser.uid),
      ]);
      setOpenRooms(list.filter((r) => r.status !== 'done'));
      setFriends(fList);
    } catch {
      // ignore
    } finally {
      setIsRefreshingRooms(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setCreatedRoom(null);
      setError('');
      setJoinCode('');
      setPlayerJoinedNotice(false);
      return;
    }

    loadOpenRooms();
    const interval = setInterval(loadOpenRooms, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // When Host creates a room: realtime Firebase listener & polling until player 2 joins
  useEffect(() => {
    if (!createdRoom) return;

    let isSubscribed = true;
    let hasJoinedHandled = false;
    let pollInterval: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      isSubscribed = false;
      if (pollInterval) clearInterval(pollInterval);
      if (unsubscribe) unsubscribe();
    };

    const handleRoomCheck = (latest: Room | null) => {
      if (!latest || !isSubscribed || hasJoinedHandled) return;

      // Check if opponent has joined
      const hasJoined =
        latest.seats.length >= 2 ||
        latest.status === 'playing' ||
        (latest.seats.length > 1 && !latest.seats.every((s) => s === currentUser.uid));

      if (hasJoined) {
        hasJoinedHandled = true;
        cleanup();
        setPlayerJoinedNotice(true);
        Sound.cardDeal();
        setTimeout(() => {
          setCreatedRoom(null);
          onRoomJoined(latest);
          onClose();
        }, 800);
      } else {
        setCreatedRoom(latest);
      }
    };

    unsubscribe = Backend.subscribeToRoom(createdRoom.code, handleRoomCheck);

    pollInterval = setInterval(async () => {
      if (hasJoinedHandled || !isSubscribed) return;
      try {
        const latest = await Backend.getRoom(createdRoom.code);
        handleRoomCheck(latest);
      } catch {
        // ignore poll error
      }
    }, 1200);

    return () => {
      cleanup();
    };
  }, [createdRoom?.code, currentUser.uid, onClose, onRoomJoined]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    try {
      setError('');
      setIsLoading(true);
      const chosenConfig = PVP_GAMES.find((g) => g.id === selectedGameId);
      const seats = chosenConfig ? chosenConfig.seats : initialSeatsNeeded;

      const room = await Backend.createRoom(currentUser, selectedGameId, seats);
      setCreatedRoom(room);
      Sound.click();
      // DO NOT close modal or call onRoomJoined yet! Stay on the waiting screen with the room code!
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (codeToJoin?: string) => {
    const raw = (codeToJoin || joinCode).trim();
    if (!raw) {
      setError('Please enter a valid 4-digit room code (e.g. 9925)');
      return;
    }

    let targetCode = raw.replace(/^[@#]/, '').trim();
    const urlMatch = raw.match(/(?:room|join|code)[=:\s#]+([a-zA-Z0-9]+)/i);
    const digitMatch = raw.match(/\b\d{4,6}\b/) || raw.match(/\d{4,6}/);

    if (urlMatch) {
      targetCode = urlMatch[1].trim();
    } else if (digitMatch) {
      targetCode = digitMatch[0];
    }

    if (!targetCode) {
      setError('Please enter a valid 4-digit room code (e.g. 9925)');
      return;
    }

    try {
      setError('');
      setIsLoading(true);
      // Support same-device testing across two browser tabs if needed
      const room = await Backend.joinRoom(currentUser, targetCode, true);
      Sound.click();
      onRoomJoined(room);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || `Room #${targetCode} could not be joined`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(true);
    Sound.click();
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getInviteLink = (code: string) => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    return `${origin}${path}?room=${code}`;
  };

  const handleShareInviteLink = async (code: string) => {
    const link = getInviteLink(code);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Hush Music Hand Game - Online Match',
          text: `Join my game room #${code}!`,
          url: link,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedLink(true);
    Sound.click();
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAddTestBot = async () => {
    if (!createdRoom) return;
    try {
      setIsLoading(true);
      const updated = await Backend.addTestBotToRoom(createdRoom.code);
      Sound.cardDeal();
      setPlayerJoinedNotice(true);
      setTimeout(() => {
        setCreatedRoom(null);
        onRoomJoined(updated);
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to add test opponent');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteFriend = async (friendUid: string, friendName: string) => {
    if (!createdRoom) return;
    try {
      // Send chat message in direct channel or room channel
      const channel = `direct_${[currentUser.uid, friendUid].sort().join('_')}`;
      await Backend.sendMessage(
        channel,
        currentUser,
        `🎮 Hey ${friendName}! Join my ${getGameLabel(createdRoom.game)} match! Room code: #${createdRoom.code}`
      );
      setInvitedFriends((prev) => ({ ...prev, [friendUid]: true }));
      Sound.click();
    } catch {
      // ignore
    }
  };

  const handleCancelCreatedRoom = () => {
    if (createdRoom) {
      Backend.deleteRoom(createdRoom.code);
      Backend.leaveRoom(createdRoom, currentUser.uid, true);
      setCreatedRoom(null);
    }
    onClose();
  };

  const handleDeleteRoom = async (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      Sound.click();
      await Backend.deleteRoom(code);
      setOpenRooms((prev) => prev.filter((r) => r.code !== code));
      if (createdRoom && createdRoom.code === code) {
        setCreatedRoom(null);
      }
    } catch (err) {
      console.error('Failed to delete room:', err);
    }
  };

  const handleClearAllRooms = async () => {
    if (openRooms.length === 0) return;
    Sound.click();
    setIsRefreshingRooms(true);
    try {
      const roomsToDelete = [...openRooms];
      await Promise.all(roomsToDelete.map((r) => Backend.deleteRoom(r.code)));
      setOpenRooms([]);
      if (createdRoom) setCreatedRoom(null);
    } catch (err) {
      console.error('Failed to clear rooms:', err);
    } finally {
      setIsRefreshingRooms(false);
    }
  };

  const handleCloseModal = () => {
    if (createdRoom) {
      onRoomJoined(createdRoom);
    }
    onClose();
  };

  const filteredOpenRooms = openRooms.filter((r) => {
    if (filterGame === 'all') return true;
    return r.game === filterGame;
  });

  const getGameLabel = (gId: string) => {
    const found = PVP_GAMES.find((g) => g.id === gId);
    return found ? `${found.icon} ${found.name}` : gId.toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleCloseModal}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Close lobby"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-slate-100">Online Multiplayer Lobby</h3>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-700 rounded-xl text-rose-300 text-xs font-semibold leading-relaxed animate-in fade-in">
            {error}
          </div>
        )}

        {createdRoom ? (
          <div className="space-y-4 text-center py-2 animate-in fade-in">
            {/* Room Code Card */}
            <div className="p-5 bg-slate-950 rounded-2xl border border-amber-500/40 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
              <span className="text-xs text-amber-400 font-extrabold uppercase tracking-wider block mb-1">
                {getGameLabel(createdRoom.game)} Match Room Created
              </span>
              <span className="text-xs text-slate-300 block mb-3">
                Tell your friend to enter this 4-Digit Room Code:
              </span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl font-black text-amber-400 tracking-widest font-mono drop-shadow-[0_2px_12px_rgba(245,158,11,0.4)]">
                  {createdRoom.code}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(createdRoom.code)}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-700 active:scale-95"
                  title="Copy 4-digit code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              {/* Direct Invite Link */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleShareInviteLink(createdRoom.code)}
                  className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Share Direct Invite Link'}</span>
                </button>
              </div>
            </div>

            {/* Waiting status */}
            {playerJoinedNotice ? (
              <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-sm font-bold flex items-center justify-center gap-2 animate-bounce">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Opponent connected! Launching match now...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-amber-300 font-semibold bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/20">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>
                    Waiting for opponent to connect ({createdRoom.seats.length}/{createdRoom.seatsNeeded} players)...
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your friend can type <strong className="text-amber-400 font-mono">#{createdRoom.code}</strong> into the Join box on their phone or computer.
                </p>

                {/* 1-Click Invite Online Friends */}
                {friends.length > 0 && (
                  <div className="pt-2 text-left space-y-1.5 border-t border-slate-800/80">
                    <span className="text-[11px] font-bold text-slate-400 block">
                      Invite Your Friends Directly:
                    </span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                      {friends.map((f) => (
                        <div
                          key={f.uid}
                          className="flex items-center justify-between p-1.5 bg-slate-950 rounded-lg border border-slate-800 text-xs"
                        >
                          <span className="font-semibold text-slate-200 truncate">{f.username}</span>
                          <button
                            type="button"
                            onClick={() => handleInviteFriend(f.uid, f.username)}
                            disabled={invitedFriends[f.uid]}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              invitedFriends[f.uid]
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                            }`}
                          >
                            {invitedFriends[f.uid] ? 'Invited ✓' : 'Invite'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Instant Dev / Preview Solo Test Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAddTestBot}
                    disabled={isLoading}
                    className="w-full py-2 px-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-xs text-slate-300 hover:text-white font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
                    title="Quickly test with simulated opponent"
                  >
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                    <span>Solo / Quick Test: Connect Simulated Opponent</span>
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // Keep room alive in background and go straight to game board
                  onRoomJoined(createdRoom);
                  onClose();
                }}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Go to Game Board
              </button>
              <button
                type="button"
                onClick={handleCancelCreatedRoom}
                className="py-2 px-3 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel Room
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Game Selector for creating room */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">
                Choose Game to Play
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {PVP_GAMES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGameId(g.id)}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      selectedGameId === g.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Create Room Button */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Create {getGameLabel(selectedGameId)} Room</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-xs text-slate-500 uppercase tracking-wider">OR</span>
            </div>

            {/* Join by Code */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">
                Join with 4-Digit Room Code (or paste invite link)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={50}
                  value={joinCode}
                  onChange={(e) => {
                    setError('');
                    const val = e.target.value;
                    const urlMatch = val.match(/(?:room|join|code)[=:\s#]+([a-zA-Z0-9]+)/i);
                    const digitMatch = val.match(/\b\d{4,6}\b/);
                    if (val.length > 6 && (urlMatch || digitMatch)) {
                      setJoinCode(urlMatch ? urlMatch[1] : (digitMatch ? digitMatch[0] : val.trim()));
                    } else {
                      setJoinCode(val.trim());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleJoin();
                    }
                  }}
                  placeholder="e.g. 2937 or #2937"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-center text-lg font-black tracking-widest text-amber-300 focus:outline-none focus:border-amber-400 transition-colors uppercase font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleJoin()}
                  disabled={isLoading || !joinCode.trim()}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer shadow-md"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>Join Room</span>
                </button>
              </div>
            </div>

            {/* Live Open Waiting Rooms Section */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">
                  Live Open Rooms ({filteredOpenRooms.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={filterGame}
                    onChange={(e) => setFilterGame(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-[10px] text-slate-300 focus:outline-none"
                  >
                    <option value="all">All Games</option>
                    {PVP_GAMES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={loadOpenRooms}
                    disabled={isRefreshingRooms}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Refresh list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRooms ? 'animate-spin' : ''}`} />
                  </button>
                  {filteredOpenRooms.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllRooms}
                      disabled={isRefreshingRooms}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Clear all open live rooms"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>
              </div>

              {filteredOpenRooms.length === 0 ? (
                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/60 text-center text-xs text-slate-500">
                  No open rooms right now. Create one above to invite a friend!
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                  {filteredOpenRooms.map((r) => {
                    const hostName = r.names[r.host] || 'Host';
                    const isMyRoom = r.host === currentUser.uid;
                    const isJoined = r.seats.includes(currentUser.uid);

                    return (
                      <div
                        key={r.code}
                        className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2.5 text-xs hover:border-slate-700 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-200">
                            <span>{getGameLabel(r.game)}</span>
                            <span className="text-amber-400 font-mono tracking-wider font-extrabold">#{r.code}</span>
                            {isMyRoom && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded-md font-semibold">
                                Your Room
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Host: {hostName} · {r.seats.length}/{r.seatsNeeded} players
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleJoin(r.code)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg border border-amber-400 transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isJoined ? 'Rejoin' : 'Join'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRoom(r.code, e)}
                            className="p-1.5 bg-slate-900 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-700/70 text-slate-400 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
                            title="Delete this open room"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
