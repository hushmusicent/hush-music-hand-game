import { useState, useEffect, useCallback } from 'react';
import { globalVoiceService, VoiceParticipant } from '../utils/voiceService';
import { Room, User } from '../types';
import { Sound } from '../utils/sound';

export interface UseVoiceChatResult {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  error: string | null;
  participants: VoiceParticipant[];
  joinVoice: () => Promise<boolean>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export function useVoiceChat(room: Room | null, currentUser: User | null): UseVoiceChatResult {
  const [state, setState] = useState({
    isConnected: false,
    isConnecting: false,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    error: null as string | null,
    participants: [] as VoiceParticipant[],
  });

  useEffect(() => {
    const unsubscribe = globalVoiceService.subscribeState((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // When room changes or becomes null, leave voice chat
  useEffect(() => {
    if (!room) {
      if (state.isConnected || state.isConnecting) {
        globalVoiceService.leaveVoice();
      }
    }
  }, [room?.code]);

  const joinVoice = useCallback(async () => {
    if (!room || !currentUser) return false;
    Sound.click();
    const ok = await globalVoiceService.joinVoice(room, currentUser);
    return ok;
  }, [room, currentUser]);

  const leaveVoice = useCallback(async () => {
    Sound.click();
    await globalVoiceService.leaveVoice();
  }, []);

  const toggleMute = useCallback(() => {
    Sound.click();
    globalVoiceService.toggleMute();
  }, []);

  const toggleDeafen = useCallback(() => {
    Sound.click();
    globalVoiceService.toggleDeafen();
  }, []);

  return {
    ...state,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  };
}
