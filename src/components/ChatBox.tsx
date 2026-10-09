import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage, User } from '../types';
import { Backend } from '../utils/backend';
import { Sound } from '../utils/sound';
import { UserAvatar } from './UserAvatar';

interface ChatBoxProps {
  channel: string;
  currentUser: User;
  title?: string;
  maxHeight?: string;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  channel,
  currentUser,
  title = 'Table Chat',
  maxHeight = 'max-h-48',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(Backend.getMessages(channel));

    let isSubscribed = true;
    const fetchLatest = async () => {
      try {
        const msgs = await Backend.fetchMessages(channel);
        if (isSubscribed) {
          setMessages(msgs);
        }
      } catch {
        // ignore
      }
    };

    fetchLatest();
    const chatInterval = setInterval(fetchLatest, 2000);

    const handleChatUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ channel: string; msg: ChatMessage }>;
      if (custom.detail && custom.detail.channel === channel) {
        setMessages(Backend.getMessages(channel));
      }
    };

    window.addEventListener('hm_chat_update', handleChatUpdate);
    return () => {
      isSubscribed = false;
      clearInterval(chatInterval);
      window.removeEventListener('hm_chat_update', handleChatUpdate);
    };
  }, [channel]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    try {
      Backend.sendMessage(channel, currentUser, text);
      setText('');
      Sound.click();
      setMessages(Backend.getMessages(channel));
    } catch {
      // error sending
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 mt-3">
      <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
        <span>{title}</span>
        <span className="text-[11px] text-slate-500 font-normal">
          {messages.length} messages
        </span>
      </div>

      <div
        ref={logRef}
        className={`w-full overflow-y-auto space-y-1.5 p-2 bg-slate-950/60 rounded-lg border border-slate-800/80 ${maxHeight} min-h-24`}
      >
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-500 italic py-4">
            No messages yet. Say hello to table players!
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.uid === currentUser.uid;
            return (
              <div
                key={m.id}
                className={`text-xs flex gap-1.5 items-end ${
                  isMe ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <UserAvatar
                  avatar={m.avatar}
                  username={m.who}
                  size="xs"
                />
                <div
                  className={`px-2.5 py-1.5 rounded-lg max-w-[80%] break-words ${
                    isMe
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-200 border border-slate-700/60'
                  }`}
                >
                  <span className="font-bold text-[10px] block opacity-75 mb-0.5">
                    {m.who}
                  </span>
                  <span>{m.text}</span>
                  {(() => {
                    const match =
                      m.text.match(/(?:room|code|join)[=:\s#]+([0-9]{4,6})/i) ||
                      m.text.match(/#([0-9]{4,6})/);
                    const code = match ? match[1] : null;
                    if (!code || isMe) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('hush_join_room', { detail: { code } })
                          );
                        }}
                        className="mt-1.5 w-full py-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                      >
                        <span>🎮 Join Match #{code}</span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          maxLength={150}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60 transition-colors"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim()}
          className="p-2 bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 rounded-lg transition-all"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
