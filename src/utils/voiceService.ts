import {
  ref as rtdbRef,
  set as rtdbSet,
  remove as rtdbRemove,
  onValue as rtdbOnValue,
  push as rtdbPush,
  onDisconnect,
} from 'firebase/database';
import { rtdb } from '../firebase';
import { User, Room } from '../types';

export interface VoiceParticipant {
  uid: string;
  username: string;
  avatar?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
}

export interface VoiceSignal {
  id?: string;
  from: string;
  target: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  timestamp: number;
}

export type VoiceStateChangeCallback = (state: {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  error: string | null;
  participants: VoiceParticipant[];
}) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface PeerConnectionData {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser?: AnalyserNode;
  candidateQueue: RTCIceCandidateInit[];
  isRemoteDescriptionSet: boolean;
}

export class VoiceService {
  private roomCode: string | null = null;
  private currentUser: User | null = null;
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;
  private isDeafened: boolean = false;
  private isSpeaking: boolean = false;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private error: string | null = null;

  private peers: Map<string, PeerConnectionData> = new Map();
  private participants: Map<string, VoiceParticipant> = new Map();

  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private speakingInterval: any = null;

  private unsubscribePresence: (() => void) | null = null;
  private unsubscribeSignals: (() => void) | null = null;
  private onStateChange: VoiceStateChangeCallback | null = null;

  public subscribeState(cb: VoiceStateChangeCallback): () => void {
    this.onStateChange = cb;
    this.emitState();
    return () => {
      if (this.onStateChange === cb) this.onStateChange = null;
    };
  }

  private emitState() {
    if (!this.onStateChange) return;
    this.onStateChange({
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isSpeaking: this.isSpeaking,
      error: this.error,
      participants: Array.from(this.participants.values()),
    });
  }

  public async joinVoice(room: Room, user: User): Promise<boolean> {
    if (this.isConnected || this.isConnecting) return true;

    this.roomCode = String(room.code).trim().replace(/^[@#]/, '');
    this.currentUser = user;
    this.isConnecting = true;
    this.error = null;
    this.emitState();

    try {
      // 1. Request microphone stream
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.isMuted = false;
      this.isDeafened = false;

      // 2. Set up Web Audio Analyser for detecting speech volume
      this.setupAudioAnalysis(stream);

      // 3. Register presence in RTDB
      await this.publishPresence({
        uid: user.uid,
        username: user.username,
        avatar: user.avatar,
        isMuted: false,
        isSpeaking: false,
        joinedAt: Date.now(),
      });

      // 4. Listen to participants and incoming signals
      this.listenToPresence();
      this.listenToSignals();

      this.isConnected = true;
      this.isConnecting = false;
      this.emitState();
      return true;
    } catch (err: any) {
      console.warn('Voice chat join error:', err);
      let errMsg = 'Could not access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Microphone permission denied. Please allow microphone in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'No microphone device found on this system.';
      } else if (err.message) {
        errMsg = err.message;
      }
      this.error = errMsg;
      this.isConnecting = false;
      this.isConnected = false;
      this.cleanupMedia();
      this.emitState();
      return false;
    }
  }

  public async leaveVoice(): Promise<void> {
    if (!this.isConnected && !this.isConnecting) return;

    if (this.roomCode && this.currentUser) {
      try {
        const presRef = rtdbRef(rtdb, `voice_presence/${this.roomCode}/${this.currentUser.uid}`);
        await rtdbRemove(presRef);
      } catch {
        // non-blocking
      }
    }

    this.cleanupMedia();
    this.cleanupSubscriptions();
    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
        peer.audio.srcObject = null;
        peer.audio.remove();
      } catch {}
    });
    this.peers.clear();
    this.participants.clear();

    this.isConnected = false;
    this.isConnecting = false;
    this.isSpeaking = false;
    this.roomCode = null;
    this.currentUser = null;
    this.emitState();
  }

  public toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });

    if (this.currentUser && this.roomCode) {
      this.publishPresenceField({ isMuted: this.isMuted, isSpeaking: false });
    }
    this.emitState();
    return this.isMuted;
  }

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    this.peers.forEach((peer) => {
      peer.audio.muted = this.isDeafened;
    });
    this.emitState();
    return this.isDeafened;
  }

  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.localAnalyser);

      const bufferLength = this.localAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingCounter = 0;
      this.speakingInterval = setInterval(() => {
        if (!this.localAnalyser || this.isMuted || !this.isConnected) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.emitState();
            this.publishPresenceField({ isSpeaking: false });
          }
          return;
        }

        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const nowSpeaking = avg > 14; // threshold

        if (nowSpeaking) {
          speakingCounter = 3; // hold speaking state briefly
        } else if (speakingCounter > 0) {
          speakingCounter--;
        }

        const activeSpeaking = speakingCounter > 0;
        if (activeSpeaking !== this.isSpeaking) {
          this.isSpeaking = activeSpeaking;
          this.emitState();
          this.publishPresenceField({ isSpeaking: activeSpeaking });
        }
      }, 120);
    } catch (err) {
      console.warn('Audio analysis setup warning:', err);
    }
  }

  private cleanupMedia() {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.localAnalyser = null;
    }
  }

  private cleanupSubscriptions() {
    if (this.unsubscribePresence) {
      this.unsubscribePresence();
      this.unsubscribePresence = null;
    }
    if (this.unsubscribeSignals) {
      this.unsubscribeSignals();
      this.unsubscribeSignals = null;
    }
  }

  private async publishPresence(participant: VoiceParticipant) {
    if (!this.roomCode || !this.currentUser) return;
    try {
      const presRef = rtdbRef(rtdb, `voice_presence/${this.roomCode}/${participant.uid}`);
      await rtdbSet(presRef, participant);
      // Automatically clear presence if browser disconnects unexpectedly
      try {
        onDisconnect(presRef).remove();
      } catch {}
    } catch (err) {
      console.warn('publishPresence warning:', err);
    }
  }

  private publishPresenceField(fields: Partial<VoiceParticipant>) {
    if (!this.roomCode || !this.currentUser) return;
    try {
      const presRef = rtdbRef(rtdb, `voice_presence/${this.roomCode}/${this.currentUser.uid}`);
      const current = this.participants.get(this.currentUser.uid);
      if (current) {
        const updated = { ...current, ...fields };
        rtdbSet(presRef, updated).catch(() => {});
      }
    } catch {}
  }

  private listenToPresence() {
    if (!this.roomCode || !this.currentUser) return;
    const roomPresRef = rtdbRef(rtdb, `voice_presence/${this.roomCode}`);

    this.unsubscribePresence = rtdbOnValue(roomPresRef, (snapshot) => {
      const val = snapshot.val() || {};
      const newParticipants = new Map<string, VoiceParticipant>();

      Object.keys(val).forEach((uid) => {
        const p = val[uid] as VoiceParticipant;
        if (p && p.uid) {
          newParticipants.set(p.uid, p);
        }
      });

      this.participants = newParticipants;
      this.emitState();

      // Check for remote peers that we need to connect with
      newParticipants.forEach((p, uid) => {
        if (uid !== this.currentUser?.uid && !this.peers.has(uid)) {
          this.initiatePeerConnection(uid);
        }
      });

      // Remove peer connections for players that left voice
      this.peers.forEach((peer, uid) => {
        if (!newParticipants.has(uid)) {
          try {
            peer.pc.close();
            peer.audio.srcObject = null;
            peer.audio.remove();
          } catch {}
          this.peers.delete(uid);
        }
      });
    });
  }

  private listenToSignals() {
    if (!this.roomCode || !this.currentUser) return;
    const mySignalsRef = rtdbRef(rtdb, `voice_signals/${this.roomCode}/${this.currentUser.uid}`);

    this.unsubscribeSignals = rtdbOnValue(mySignalsRef, (snapshot) => {
      const val = snapshot.val();
      if (!val) return;

      Object.entries(val).forEach(async ([key, rawSignal]: [string, any]) => {
        // Delete processed signal to prevent re-processing
        rtdbRemove(rtdbRef(rtdb, `voice_signals/${this.roomCode}/${this.currentUser!.uid}/${key}`)).catch(() => {});

        const signal = rawSignal as VoiceSignal;
        if (!signal || !signal.from || signal.from === this.currentUser?.uid) return;

        await this.handleIncomingSignal(signal);
      });
    });
  }

  private getOrCreatePeer(remoteUid: string): PeerConnectionData {
    let peer = this.peers.get(remoteUid);
    if (peer) return peer;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = this.isDeafened;

    peer = {
      pc,
      audio,
      candidateQueue: [],
      isRemoteDescriptionSet: false,
    };
    this.peers.set(remoteUid, peer);

    // 1. Add local audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // 2. Handle remote audio stream
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        peer!.audio.srcObject = event.streams[0];
        peer!.audio.play().catch((e) => console.warn('Remote audio play warning:', e));
      }
    };

    // 3. Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomCode && this.currentUser) {
        this.sendSignal(remoteUid, {
          from: this.currentUser.uid,
          target: remoteUid,
          type: 'candidate',
          payload: event.candidate.toJSON(),
          timestamp: Date.now(),
        });
      }
    };

    // 4. Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`Peer connection with ${remoteUid} is ${pc.connectionState}`);
      }
    };

    return peer;
  }

  private async initiatePeerConnection(remoteUid: string) {
    if (!this.currentUser || !this.roomCode) return;
    const peer = this.getOrCreatePeer(remoteUid);

    // Use perfect negotiation: only the "polite" peer initiates the offer to avoid collision
    const isInitiator = this.currentUser.uid > remoteUid;
    if (isInitiator) {
      try {
        const offer = await peer.pc.createOffer({
          offerToReceiveAudio: true,
        });
        await peer.pc.setLocalDescription(offer);

        await this.sendSignal(remoteUid, {
          from: this.currentUser.uid,
          target: remoteUid,
          type: 'offer',
          payload: offer,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('Create offer error:', err);
      }
    }
  }

  private async handleIncomingSignal(signal: VoiceSignal) {
    const remoteUid = signal.from;
    const peer = this.getOrCreatePeer(remoteUid);

    try {
      if (signal.type === 'offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        peer.isRemoteDescriptionSet = true;

        // Drain queued candidates
        while (peer.candidateQueue.length > 0) {
          const cand = peer.candidateQueue.shift()!;
          await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
        }

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);

        await this.sendSignal(remoteUid, {
          from: this.currentUser!.uid,
          target: remoteUid,
          type: 'answer',
          payload: answer,
          timestamp: Date.now(),
        });
      } else if (signal.type === 'answer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        peer.isRemoteDescriptionSet = true;

        // Drain queued candidates
        while (peer.candidateQueue.length > 0) {
          const cand = peer.candidateQueue.shift()!;
          await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      } else if (signal.type === 'candidate' && signal.payload) {
        if (peer.isRemoteDescriptionSet) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(signal.payload));
        } else {
          peer.candidateQueue.push(signal.payload);
        }
      }
    } catch (err) {
      console.warn('handleIncomingSignal error:', err);
    }
  }

  private async sendSignal(targetUid: string, signal: VoiceSignal) {
    if (!this.roomCode) return;
    try {
      const targetSignalRef = rtdbRef(rtdb, `voice_signals/${this.roomCode}/${targetUid}`);
      await rtdbPush(targetSignalRef, signal);
    } catch (err) {
      console.warn('sendSignal warning:', err);
    }
  }
}

export const globalVoiceService = new VoiceService();
