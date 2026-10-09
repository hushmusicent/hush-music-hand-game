import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  MessageSquare,
  Check,
  X,
  RefreshCw,
  Loader2,
  Sparkles,
  Gamepad2,
  Copy,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { User, Friend, FriendRequest } from '../types';
import { Backend } from '../utils/backend';
import { Sound } from '../utils/sound';
import { ChatBox } from './ChatBox';
import { UserAvatar } from './UserAvatar';

interface FriendsViewProps {
  currentUser: User;
  onOpenMultiplayer?: () => void;
}

interface SentRequest {
  targetUid: string;
  targetUsername: string;
  targetAvatar?: string;
  at: number;
}

export const FriendsView: React.FC<FriendsViewProps> = ({ currentUser, onOpenMultiplayer }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [activeChatFriend, setActiveChatFriend] = useState<Friend | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);

  const myFriendCode = `#${currentUser.username.toUpperCase()}`;

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [fList, inList, outList] = await Promise.all([
        Backend.getFriendsListAsync(currentUser.uid),
        Backend.getFriendRequestsAsync(currentUser.uid, currentUser.username),
        Backend.getSentFriendRequestsAsync(currentUser.uid),
      ]);
      setFriends(fList);
      setIncomingRequests(inList);
      setSentRequests(outList);
    } catch {
      setFriends(Backend.getFriendsList(currentUser.uid));
      setIncomingRequests(Backend.getFriendRequests(currentUser.uid));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2500);
    return () => clearInterval(interval);
  }, [currentUser.uid]);

  const handleSendRequest = async (e?: React.FormEvent, directUsername?: string) => {
    if (e) e.preventDefault();
    const uname = (directUsername || targetUsername).trim();
    if (!uname) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await Backend.sendFriendRequest(currentUser, uname);
      if (!directUsername) setTargetUsername('');

      if (res.autoAccepted) {
        Sound.jackpot();
      } else {
        Sound.win();
      }

      setStatusMessage({ text: res.message, type: 'success' });
      await refreshData();
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message || 'Failed to send request', type: 'error' });
      Sound.lose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async (reqUid: string) => {
    try {
      await Backend.acceptFriendRequest(currentUser.uid, reqUid);
      Sound.win();
      await refreshData();
      setStatusMessage({ text: '🎉 Friend request accepted! You are now friends.', type: 'success' });
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message || 'Failed to accept', type: 'error' });
    }
  };

  const handleDecline = async (reqUid: string) => {
    try {
      await Backend.declineFriendRequest(currentUser.uid, reqUid);
      Sound.click();
      await refreshData();
      setStatusMessage({ text: 'Friend request declined.', type: 'success' });
    } catch (err: unknown) {
      setStatusMessage({ text: (err as Error).message || 'Failed to decline', type: 'error' });
    }
  };

  const handleCancelSent = async (targetUid: string) => {
    try {
      await Backend.cancelFriendRequest(currentUser.uid, targetUid);
      Sound.click();
      await refreshData();
      setStatusMessage({ text: 'Pending request canceled.', type: 'success' });
    } catch {
      // ignore
    }
  };

  const handleRemoveFriend = async (friendUid: string, friendName: string) => {
    try {
      await Backend.removeFriend(currentUser.uid, friendUid);
      Sound.click();
      setConfirmRemoveUid(null);
      if (activeChatFriend?.uid === friendUid) {
        setActiveChatFriend(null);
      }
      await refreshData();
      setStatusMessage({
        text: `Friend "${friendName}" was removed from your friends list.`,
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMessage({
        text: (err as Error).message || 'Failed to remove friend.',
        type: 'error',
      });
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(myFriendCode).catch(() => {});
    setCopiedCode(true);
    Sound.click();
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-black text-slate-100">Friends & Challenges</h2>
        </div>

        <div className="flex items-center gap-2">
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer"
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Multiplayer Rooms</span>
            </button>
          )}

          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Refresh friends list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold border animate-in fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Your Friend Code Banner */}
      <div className="p-3 bg-linear-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-md">
        <div>
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
            Your Player Code
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-base font-black text-amber-400 tracking-wider font-mono">
              {myFriendCode}
            </span>
            <span className="text-[11px] text-slate-400">
              (Share with friends to connect instantly)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyCode}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedCode ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Add Friend Input Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Add Friend by Username or Player Code
          </span>
          <span className="text-[10px] text-amber-400/80 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3 text-amber-400" />
            Verified Data Bank Only
          </span>
        </div>
        <form onSubmit={(e) => handleSendRequest(e)} className="flex gap-2">
          <input
            type="text"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder="e.g. Veno2, TESTER, #PLAYER..."
            disabled={isSubmitting}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <button
            type="submit"
            disabled={isSubmitting || !targetUsername.trim()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            <span>Send Request</span>
          </button>
        </form>
        <p className="text-[11px] text-slate-500">
          Tip: You can only add real players who have an active account in the system data bank.
        </p>
      </div>

      {/* Incoming Requests */}
      {incomingRequests.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-xl space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Incoming Friend Requests ({incomingRequests.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {incomingRequests.map((req) => (
              <div
                key={req.uid}
                className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <UserAvatar avatar={req.avatar} username={req.from} size="xs" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">{req.from}</span>
                    <span className="text-[10px] text-slate-400">wants to connect</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAccept(req.uid)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all cursor-pointer text-xs font-bold flex items-center gap-1"
                    title="Accept request"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecline(req.uid)}
                    className="p-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-300 rounded-lg transition-all cursor-pointer"
                    title="Decline request"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Pending Requests */}
      {sentRequests.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2 animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Sent Requests (Pending Response: {sentRequests.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {sentRequests.map((req) => (
              <div
                key={req.targetUid}
                className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <UserAvatar avatar={req.targetAvatar} username={req.targetUsername} size="xs" />
                  <div>
                    <span className="font-semibold text-slate-200 block">{req.targetUsername}</span>
                    <span className="text-[10px] text-amber-400/70">Request pending...</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelSent(req.targetUid)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
          Your Friends ({friends.length})
        </span>

        {friends.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 italic">
            You haven't added any friends yet. Share your Player Code above or add a friend by username!
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.uid}
                className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <UserAvatar
                      avatar={friend.avatar}
                      username={friend.username}
                      size="sm"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute -bottom-0.5 -right-0.5 border-2 border-slate-950" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">{friend.username}</span>
                    <span className="text-[10px] text-emerald-400 font-medium">Online</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onOpenMultiplayer && (
                    <button
                      type="button"
                      onClick={onOpenMultiplayer}
                      className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs rounded-lg border border-amber-500/40 transition-all cursor-pointer"
                    >
                      Challenge
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveChatFriend(activeChatFriend?.uid === friend.uid ? null : friend);
                      Sound.click();
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{activeChatFriend?.uid === friend.uid ? 'Close' : 'Chat'}</span>
                  </button>

                  {confirmRemoveUid === friend.uid ? (
                    <div className="flex items-center gap-1 animate-in fade-in">
                      <button
                        type="button"
                        onClick={() => handleRemoveFriend(friend.uid, friend.username)}
                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                        title="Confirm removing this friend"
                      >
                        Confirm?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveUid(null)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveUid(friend.uid)}
                      className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-200 rounded-lg text-xs transition-all cursor-pointer"
                      title={`Remove ${friend.username} from friends`}
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Direct Chat */}
      {activeChatFriend && (
        <ChatBox
          channel={`dm_${[currentUser.uid, activeChatFriend.uid].sort().join('_')}`}
          currentUser={currentUser}
          title={`Chat with ${activeChatFriend.username}`}
        />
      )}
    </div>
  );
};
