import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Users,
  Bot,
  Gamepad2,
  Sparkles,
  Gift,
  BookOpen,
  Check,
  Copy,
} from 'lucide-react';
import heroImg from './assets/images/hush_music_hero_1791342885268.jpg';
import hushLogo from './assets/images/hush_gold_black_bright.png';
import { User, ViewType, GameMetadata, Room } from './types';
import { Storage } from './utils/storage';
import { Backend } from './utils/backend';
import { Sound } from './utils/sound';
import { ALL_GAMES } from './utils/gamesData';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { AuthModal } from './components/AuthModal';
import { PvPModal } from './components/PvPModal';
import { LeaderboardView } from './components/LeaderboardView';
import { FriendsView } from './components/FriendsView';
import { ProfileView } from './components/ProfileView';
import { ConfirmLeaveModal } from './components/ConfirmLeaveModal';
import { GameInstructionsView } from './components/GameInstructionsView';
import { VoiceChatWidget } from './components/VoiceChatWidget';

// Games
import { SlotsGame } from './components/games/SlotsGame';
import { BlackjackGame } from './components/games/BlackjackGame';
import { RouletteGame } from './components/games/RouletteGame';
import { CrapsGame } from './components/games/CrapsGame';
import { PokerGame } from './components/games/PokerGame';
import { CheckersGame } from './components/games/CheckersGame';
import { ChessGame } from './components/games/ChessGame';
import { DominoesGame } from './components/games/DominoesGame';
import { BackgammonGame } from './components/games/BackgammonGame';
import { SpadesGame } from './components/games/SpadesGame';
import { RummyGame } from './components/games/RummyGame';
import { MahjongGame } from './components/games/MahjongGame';

export default function App() {
  const [user, setUser] = useState<User | null>(() => Storage.getSession());
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [selectedGame, setSelectedGame] = useState<GameMetadata | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [pvpRoom, setPvPModRoom] = useState<Room | null>(null);
  const [isPvPOpen, setIsPvPOpen] = useState(false);
  const [gameMode, setGameMode] = useState<'cpu' | 'pvp'>('cpu');
  const [gameSubTab, setGameSubTab] = useState<'play' | 'instructions'>('play');

  type PendingAction =
    | { type: 'view'; view: ViewType }
    | { type: 'back' }
    | { type: 'logout' };

  const [pendingLeaveAction, setPendingLeaveAction] = useState<PendingAction | null>(null);
  const [, setNow] = useState<number>(Date.now());
  const [friendRequestCount, setFriendRequestCount] = useState<number>(0);
  const [copiedCodeBanner, setCopiedCodeBanner] = useState<boolean>(false);

  useEffect(() => {
    // Tick every second to keep live countdowns and reset timers accurate
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Session check on load
    const saved = Storage.getSession();
    if (saved) {
      const cleanEmail = (saved.email || '').toLowerCase().trim();
      const cleanName = (saved.username || '').toLowerCase().trim();
      if (
        cleanName === 'kingveno' ||
        saved.uid === 'u_zbs0jd0'
      ) {
        Storage.setSession(null);
        setUser(null);
      } else {
        setUser(saved);
        Backend.syncUser(saved);
      }
    }
  }, []);

  // Poll friend requests count for red badge
  useEffect(() => {
    if (!user) return;
    const fetchRequests = async () => {
      try {
        const reqs = await Backend.getFriendRequestsAsync(user.uid, user.username);
        setFriendRequestCount(reqs.length);
      } catch {}
    };
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  // Check URL query parameters for ?room=XXXX or #room=XXXX to auto-join
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hashMatch = window.location.hash.match(/(?:room|join)[=:]\s*([a-zA-Z0-9]+)/i);
      const roomParam = params.get('room') || params.get('join') || (hashMatch ? hashMatch[1] : null);
      if (!roomParam) return;

      // Clean URL params to avoid re-triggering loops
      window.history.replaceState(null, '', window.location.pathname);

      if (!user) {
        Backend.loginGuest().then((guest) => {
          setUser(guest);
          Backend.joinRoom(guest, roomParam, true)
            .then((room) => {
              handleRoomJoined(room);
              Sound.cardDeal();
            })
            .catch(() => {
              setIsPvPOpen(true);
            });
        });
        return;
      }

      Backend.joinRoom(user, roomParam, true)
        .then((room) => {
          handleRoomJoined(room);
          Sound.cardDeal();
        })
        .catch(() => {
          setIsPvPOpen(true);
        });
    } catch {}
  }, [user?.uid]);

  // Listen for in-app room join events (e.g. from chat invite buttons)
  useEffect(() => {
    const handleJoinEvent = (e: Event) => {
      const custom = e as CustomEvent<{ code: string }>;
      const code = custom.detail?.code;
      if (!code) return;
      const targetUser = user || Storage.getSession();
      if (!targetUser) {
        Backend.loginGuest().then((guest) => {
          setUser(guest);
          Backend.joinRoom(guest, code, true)
            .then((room) => {
              handleRoomJoined(room);
              Sound.cardDeal();
            })
            .catch(() => setIsPvPOpen(true));
        });
        return;
      }
      Backend.joinRoom(targetUser, code, true)
        .then((room) => {
          handleRoomJoined(room);
          Sound.cardDeal();
        })
        .catch(() => setIsPvPOpen(true));
    };

    window.addEventListener('hush_join_room', handleJoinEvent);
    return () => window.removeEventListener('hush_join_room', handleJoinEvent);
  }, [user]);

  // Intercept browser back button & tab reload while playing
  useEffect(() => {
    if (!selectedGame) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      setPendingLeaveAction({ type: 'back' });
    };

    window.history.pushState({ inGame: true }, '');
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedGame]);

  const handleUserUpdate = (updated: User) => {
    setUser(updated);
    Storage.saveUser(updated);
    Backend.syncUser(updated);
  };

  // Sync user profile to server
  useEffect(() => {
    if (user) {
      Backend.syncUser(user);
    }
  }, [user]);

  // Keep active PvP room continuously in sync via Firebase Firestore in realtime
  useEffect(() => {
    if (!pvpRoom || gameMode !== 'pvp') return;

    let isSubscribed = true;

    const handleRoomUpdate = (latest: Room | null) => {
      if (!latest || !isSubscribed) return;
      setPvPModRoom((current) => {
        if (!current || current.code !== latest.code) return latest;
        const currentKey = `${current.seats.join(',')}_${current.turn}_${current.status}_${JSON.stringify(current.state)}`;
        const latestKey = `${latest.seats.join(',')}_${latest.turn}_${latest.status}_${JSON.stringify(latest.state)}`;
        if (currentKey !== latestKey) {
          return latest;
        }
        return current;
      });
    };

    // Realtime listener from Firebase Firestore
    const unsubscribe = Backend.subscribeToRoom(pvpRoom.code, handleRoomUpdate);

    // Backup polling interval
    const interval = setInterval(async () => {
      try {
        const latest = await Backend.getRoom(pvpRoom.code);
        handleRoomUpdate(latest);
      } catch {
        // ignore network error
      }
    }, 1200);

    return () => {
      isSubscribed = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [pvpRoom?.code, gameMode]);

  const performLogout = () => {
    Backend.logout();
    setUser(null);
    setSelectedGame(null);
    setCurrentView('home');
  };

  const requestLogout = () => {
    if (selectedGame) {
      setPendingLeaveAction({ type: 'logout' });
    } else {
      performLogout();
    }
  };

  const handleLaunchGame = (game: GameMetadata) => {
    Sound.click();
    setSelectedGame(game);
    setGameMode('cpu');
    setPvPModRoom(null);
    setGameSubTab('play');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestBackToGames = () => {
    Sound.click();
    if (selectedGame) {
      setPendingLeaveAction({ type: 'back' });
    }
  };

  const requestNavigation = (targetView: ViewType) => {
    if (selectedGame) {
      if (targetView === 'home' && gameSubTab === 'instructions') {
        Sound.click();
        setGameSubTab('play');
        return;
      }
      setPendingLeaveAction({ type: 'view', view: targetView });
    } else {
      setCurrentView(targetView);
    }
  };

  const handleConfirmLeave = () => {
    if (pvpRoom && user) {
      Backend.leaveRoom(pvpRoom, user.uid);
    }
    const action = pendingLeaveAction;
    setSelectedGame(null);
    setPvPModRoom(null);
    setPendingLeaveAction(null);

    if (action) {
      if (action.type === 'view') {
        setCurrentView(action.view);
      } else if (action.type === 'back') {
        setCurrentView('home');
      } else if (action.type === 'logout') {
        performLogout();
      }
    }
  };

  const handleCancelLeave = () => {
    setPendingLeaveAction(null);
    if (selectedGame) {
      window.history.pushState({ inGame: true }, '');
    }
  };

  const handleRoomJoined = (room: Room) => {
    const matchingGame = ALL_GAMES.find((g) => g.id === room.game);
    if (matchingGame) {
      setSelectedGame(matchingGame);
    }
    setPvPModRoom(room);
    setGameMode('pvp');
    setGameSubTab('play');
    setCurrentView('home');
    setIsPvPOpen(false);
  };

  const filteredGames = ALL_GAMES.filter((g) => {
    if (activeCategory === 'All') return true;
    return g.category === activeCategory;
  });

  const categories = ['All', 'Cards', 'Board', 'Casino', 'Puzzle'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-20 md:pb-8 selection:bg-amber-400 selection:text-slate-950">
      {/* Auth Screen Modal if no active session */}
      {!user && <AuthModal onSuccess={(u) => setUser(u)} />}

      {user && (
        <>
          {/* Top Header */}
          <Header
            points={user.points}
            currentView={currentView}
            userAvatar={user.avatar}
            username={user.username}
            friendRequestCount={friendRequestCount}
            onNavigate={requestNavigation}
            onOpenMultiplayer={() => setIsPvPOpen(true)}
          />

          {/* Main App Content Container */}
          <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 py-4 md:px-6">
            {/* View Switching */}
            {currentView === 'leaderboard' && (
              <LeaderboardView currentUser={user} />
            )}

            {currentView === 'friends' && (
              <FriendsView
                currentUser={user}
                onOpenMultiplayer={() => setIsPvPOpen(true)}
              />
            )}

            {currentView === 'profile' && (
              <ProfileView
                user={user}
                onUpdateUser={handleUserUpdate}
                onLogout={requestLogout}
              />
            )}

            {currentView === 'home' && (
              <>
                {/* Active Game Stage View */}
                {selectedGame ? (
                  <div className="space-y-4">
                    {/* Navigation and Tab bar above game */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={requestBackToGames}
                          className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-800 flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer shrink-0"
                        >
                          <ArrowLeft className="w-4 h-4 text-amber-400" />
                          <span>All Games</span>
                        </button>

                        <span className="text-sm font-bold text-slate-200 truncate">
                          {selectedGame.icon} {selectedGame.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                        {/* Game / Instructions Sub-Tabs */}
                        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setGameSubTab('play');
                              Sound.click();
                            }}
                            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                              gameSubTab === 'play'
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                            <span>Game</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setGameSubTab('instructions');
                              Sound.click();
                            }}
                            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                              gameSubTab === 'instructions'
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Instructions</span>
                          </button>
                        </div>

                        {/* Vs Computer / Online PvP Toggle if available */}
                        {selectedGame.pvp && gameSubTab === 'play' && (
                          <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setGameMode('cpu');
                                setPvPModRoom(null);
                                Sound.click();
                              }}
                              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                gameMode === 'cpu'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Bot className="w-3.5 h-3.5" />
                              <span>Vs Bot</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsPvPOpen(true);
                                Sound.click();
                              }}
                              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                gameMode === 'pvp'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Online PvP</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Instructions Tab Content */}
                    {gameSubTab === 'instructions' && (
                      <GameInstructionsView
                        game={selectedGame}
                        onBackToGame={() => {
                          Sound.click();
                          setGameSubTab('play');
                        }}
                      />
                    )}

                    {/* Active Game Stage View - Always kept mounted so ongoing game state is never lost */}
                    <div className={gameSubTab === 'play' ? 'block space-y-4' : 'hidden'}>
                      {/* Room Info Banner if in PvP */}
                      {pvpRoom && (
                        <div className="space-y-2 text-xs animate-in fade-in">
                          <div className="rounded-xl overflow-hidden border shadow-lg">
                            {pvpRoom.seats.length === 1 ? (
                              <div className="p-3 bg-amber-950/60 border-amber-500/40 text-amber-300 flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
                                  <div>
                                    <span className="font-bold text-white block">
                                      Multiplayer Room Active · Code:{' '}
                                      <strong className="text-amber-400 text-sm font-mono tracking-wider ml-1">
                                        #{pvpRoom.code}
                                      </strong>
                                    </span>
                                    <span className="text-[11px] text-amber-300/80">
                                      Waiting for friend to enter code #{pvpRoom.code} (1/{pvpRoom.seatsNeeded} players)...
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(pvpRoom.code).catch(() => {});
                                      setCopiedCodeBanner(true);
                                      Sound.click();
                                      setTimeout(() => setCopiedCodeBanner(false), 2000);
                                    }}
                                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 cursor-pointer"
                                    title="Copy 4-digit room code"
                                  >
                                    {copiedCodeBanner ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copiedCodeBanner ? 'Copied' : 'Copy Code'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const updated = await Backend.addTestBotToRoom(pvpRoom.code);
                                        setPvPModRoom(updated);
                                        Sound.cardDeal();
                                      } catch {}
                                    }}
                                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/40 cursor-pointer"
                                    title="Connect simulated test opponent"
                                  >
                                    Solo Test Opponent
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      Backend.deleteRoom(pvpRoom.code);
                                      Backend.leaveRoom(pvpRoom, user.uid, true);
                                      setPvPModRoom(null);
                                      setGameMode('cpu');
                                      Sound.click();
                                    }}
                                    className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded-lg text-xs font-semibold border border-rose-800/60 cursor-pointer"
                                  >
                                    Cancel Room
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-emerald-950/60 border-emerald-500/40 text-emerald-300 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                                  <div>
                                    <span className="font-extrabold text-white">
                                      🟢 Online PvP Match Active · Room #{pvpRoom.code}
                                    </span>
                                    <span className="text-[11px] text-emerald-300/80 ml-2">
                                      Opponent: {pvpRoom.seats.find((s) => s !== user.uid) ? pvpRoom.names[pvpRoom.seats.find((s) => s !== user.uid)!] || 'Opponent' : 'Connected'}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    Backend.leaveRoom(pvpRoom, user.uid, false);
                                    setPvPModRoom(null);
                                    setGameMode('cpu');
                                    Sound.click();
                                  }}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                                >
                                  Leave Match
                                </button>
                              </div>
                            )}
                          </div>
                          <VoiceChatWidget room={pvpRoom} currentUser={user} />
                        </div>
                      )}

                      {/* Game Components Switch */}
                      {selectedGame.id === 'slots' && (
                        <SlotsGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                      {selectedGame.id === 'blackjack' && (
                        <BlackjackGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                      {selectedGame.id === 'roulette' && (
                        <RouletteGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                      {selectedGame.id === 'craps' && (
                        <CrapsGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                      {selectedGame.id === 'poker' && (
                        <PokerGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                      {selectedGame.id === 'checkers' && (
                        <CheckersGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'checkers' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'chess' && (
                        <ChessGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'chess' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'dominoes' && (
                        <DominoesGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'dominoes' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'backgammon' && (
                        <BackgammonGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'backgammon' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'spades' && (
                        <SpadesGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'spades' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'rummy' && (
                        <RummyGame
                          user={user}
                          onUpdateUser={handleUserUpdate}
                          pvpRoom={gameMode === 'pvp' && pvpRoom?.game === 'rummy' ? pvpRoom : null}
                        />
                      )}
                      {selectedGame.id === 'mahjong' && (
                        <MahjongGame user={user} onUpdateUser={handleUserUpdate} />
                      )}
                    </div>
                  </div>
                ) : (
                  /* Hub Overview & Games Grid */
                  <div className="space-y-6">
                    {/* Hero Showcase Card */}
                    <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-slate-900 shadow-2xl">
                      <div className="absolute inset-0">
                        <img
                          src={heroImg}
                          alt="Hush Music Hand Game luxury cards and chips"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-35 filter brightness-75 scale-105"
                        />
                        <div className="absolute inset-0 bg-linear-to-r from-slate-950 via-slate-950/80 to-transparent" />
                      </div>

                      <div className="relative p-6 md:p-8 space-y-3 max-w-xl">
                        <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-amber-400">
                          <img
                            src={hushLogo}
                            alt="Hush Music Logo"
                            className="w-5 h-5 rounded-full ring-1 ring-amber-400/40 object-cover"
                          />
                          <span>Hush Music Entertainment</span>
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black text-slate-100 tracking-tight leading-tight">
                          Hush Music Hand Game
                        </h1>
                        <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                          Play Spades, Poker, Blackjack, Dominoes, Chess, Checkers, and more. Wager ⭐ points against smart bots or create private rooms to battle friends.
                        </p>

                        {/* Quick CTA or daily reset countdown */}
                        <div className="pt-2">
                          {Backend.canClaimDaily(user) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const u = Backend.claimDailyBonus(user);
                                handleUserUpdate(u);
                              }}
                              className="py-2 px-4 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                            >
                              <Gift className="w-4 h-4" />
                              <span>Claim Daily Bonus: +500 ⭐</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              <span>
                                Next Daily Reset:{' '}
                                <strong className="text-amber-400 font-mono">
                                  {Backend.formatResetCountdown(Backend.getDailyResetRemainingMs(user))}
                                </strong>
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              Sound.click();
                              setIsPvPOpen(true);
                            }}
                            className="py-2 px-4 bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-bold rounded-xl text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md"
                          >
                            <Users className="w-4 h-4 text-amber-400" />
                            <span>Multiplayer Lobby / Join Code</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                      <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setActiveCategory(cat);
                              Sound.click();
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                              activeCategory === cat
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap hidden sm:inline">
                        12 Games Ready
                      </span>
                    </div>

                    {/* Games Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {filteredGames.map((game) => (
                        <div
                          key={game.id}
                          onClick={() => handleLaunchGame(game)}
                          className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-amber-500/5 flex flex-col justify-between cursor-pointer"
                        >
                          <div>
                            <div className="flex items-start justify-between mb-3">
                              <span className="text-3xl md:text-4xl group-hover:scale-110 transition-transform">
                                {game.icon}
                              </span>
                              {game.pvp && (
                                <span className="text-[10px] font-bold text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                  ONLINE
                                </span>
                              )}
                            </div>

                            <h3 className="font-extrabold text-sm md:text-base text-slate-100 group-hover:text-amber-400 transition-colors">
                              {game.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {game.description}
                            </p>
                          </div>

                          <div className="mt-4 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchGame(game);
                                setGameSubTab('instructions');
                              }}
                              className="text-slate-400 hover:text-amber-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Read how to play"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>How to Play</span>
                            </button>
                            <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
                              PLAY →
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>

          {/* Bottom Navigation for Mobile */}
          <BottomNav
            currentView={currentView}
            friendRequestCount={friendRequestCount}
            onNavigate={requestNavigation}
          />

          {/* Leave Game Confirmation Modal */}
          <ConfirmLeaveModal
            isOpen={pendingLeaveAction !== null}
            gameName={selectedGame?.name}
            onConfirm={handleConfirmLeave}
            onCancel={handleCancelLeave}
          />

          {/* PvP Room Creation / Join Modal - Available Anywhere */}
          <PvPModal
            isOpen={isPvPOpen}
            onClose={() => setIsPvPOpen(false)}
            gameId={selectedGame?.id || 'checkers'}
            currentUser={user}
            seatsNeeded={selectedGame?.seats || 2}
            onRoomJoined={handleRoomJoined}
          />
        </>
      )}
    </div>
  );
}
