import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  onSnapshot,
  arrayUnion,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, Room } from '../types';

export interface VoiceParticipant {
  uid: string;
  username: string;
  avatar?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
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

// Only Google's free STUN server, no TURN server per specification
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

interface PeerConnectionData {
  pairId: string;
  remoteUid: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  candidateQueue: RTCIceCandidateInit[];
  processedCandidates: Set<string>;
  lastProcessedOfferSdp: string | null;
  lastProcessedAnswerSdp: string | null;
  unsubscribePair: Unsubscribe | null;
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

  private unsubscribePresence: Unsubscribe | null = null;
  private onStateChange: VoiceStateChangeCallback | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.isConnected || this.isConnecting) {
          this.leaveVoice().catch(() => {});
        }
      });
    }
  }

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
      // 1. Simplest possible microphone access request: navigator.mediaDevices.getUserMedia({ audio: true })
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const notSupportedErr = new Error('navigator.mediaDevices.getUserMedia is not supported by your browser');
        notSupportedErr.name = 'NotSupportedError';
        throw notSupportedErr;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.localStream = stream;
      this.isMuted = false;
      this.isDeafened = false;

      // 2. Set up Web Audio Analyser for speaking indicator
      this.setupAudioAnalysis(stream);

      // 3. Register voice presence in Firestore under the room document
      await setDoc(doc(db, 'rooms', this.roomCode, 'voice_presence', user.uid), {
        uid: user.uid,
        username: user.username,
        avatar: user.avatar || '🎧',
        isMuted: false,
        isSpeaking: false,
        joinedAt: Date.now(),
      });

      // 4. Listen to active voice participants in the room
      this.listenToPresence();

      this.isConnected = true;
      this.isConnecting = false;
      this.emitState();
      return true;
    } catch (err: any) {
      console.warn('Voice chat join error:', err);
      // IMPORTANT: Show real error name and message in red banner, not a friendly generic message
      const rawError = err?.name && err?.message
        ? `${err.name}: ${err.message}`
        : (err?.message || (err?.name ? `${err.name}` : String(err)));

      this.error = rawError;
      this.isConnecting = false;
      this.isConnected = false;
      this.cleanupMedia();
      this.emitState();
      return false;
    }
  }

  public async leaveVoice(): Promise<void> {
    if (!this.isConnected && !this.isConnecting) return;

    const currentRoomCode = this.roomCode;
    const currentUid = this.currentUser?.uid;

    // Remove presence document from Firestore
    if (currentRoomCode && currentUid) {
      try {
        await deleteDoc(doc(db, 'rooms', currentRoomCode, 'voice_presence', currentUid));
      } catch {
        // Non-blocking cleanup
      }
    }

    this.cleanupMedia();
    this.cleanupPresenceSubscription();

    // Close and cleanup all peer connections and their signaling listeners
    this.peers.forEach((peer) => {
      try {
        if (peer.unsubscribePair) peer.unsubscribePair();
        peer.pc.close();
        peer.audio.srcObject = null;
        peer.audio.remove();
      } catch {}

      // Clean up signaling doc if initiated by us
      if (currentRoomCode) {
        deleteDoc(doc(db, 'rooms', currentRoomCode, 'voice_signals', peer.pairId)).catch(() => {});
      }
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
      this.updatePresenceField({ isMuted: this.isMuted, isSpeaking: false });
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
            this.updatePresenceField({ isSpeaking: false });
          }
          return;
        }

        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const nowSpeaking = avg > 14;

        if (nowSpeaking) {
          speakingCounter = 3;
        } else if (speakingCounter > 0) {
          speakingCounter--;
        }

        const activeSpeaking = speakingCounter > 0;
        if (activeSpeaking !== this.isSpeaking) {
          this.isSpeaking = activeSpeaking;
          this.emitState();
          this.updatePresenceField({ isSpeaking: activeSpeaking });
        }
      }, 150);
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

  private cleanupPresenceSubscription() {
    if (this.unsubscribePresence) {
      this.unsubscribePresence();
      this.unsubscribePresence = null;
    }
  }

  private updatePresenceField(fields: Partial<VoiceParticipant>) {
    if (!this.roomCode || !this.currentUser) return;
    try {
      const presRef = doc(db, 'rooms', this.roomCode, 'voice_presence', this.currentUser.uid);
      updateDoc(presRef, fields).catch(() => {});
    } catch {}
  }

  private listenToPresence() {
    if (!this.roomCode || !this.currentUser) return;
    const roomCode = this.roomCode;
    const currentUid = this.currentUser.uid;
    const presenceColRef = collection(db, 'rooms', roomCode, 'voice_presence');

    this.unsubscribePresence = onSnapshot(
      presenceColRef,
      (snapshot) => {
        const newParticipants = new Map<string, VoiceParticipant>();

        snapshot.docs.forEach((d) => {
          const p = d.data() as VoiceParticipant;
          if (p && p.uid) {
            newParticipants.set(p.uid, p);
          }
        });

        this.participants = newParticipants;
        this.emitState();

        // Connect to every other human participant in mesh (2, 3, or 4 human players)
        newParticipants.forEach((p, uid) => {
          // Ignore self and automated bot seats
          const isBot = uid.startsWith('bot_') || uid.startsWith('robot_') || uid.includes('test_bot');
          if (uid !== currentUid && !isBot && !this.peers.has(uid)) {
            this.setupPeerForRemoteUser(uid);
          }
        });

        // Clean up peers for players that left voice
        this.peers.forEach((peer, uid) => {
          if (!newParticipants.has(uid)) {
            this.removePeer(uid);
          }
        });
      },
      (err) => {
        console.warn('Voice presence listener error:', err);
        const rawError = err?.name && err?.message
          ? `${err.name}: ${err.message}`
          : (err?.message || String(err));
        this.error = rawError;
        this.emitState();
      }
    );
  }

  private getPairId(uidA: string, uidB: string): string {
    const [p1, p2] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
    return `${p1}_${p2}`;
  }

  private removePeer(remoteUid: string) {
    const peer = this.peers.get(remoteUid);
    if (!peer) return;

    try {
      if (peer.unsubscribePair) peer.unsubscribePair();
      peer.pc.close();
      peer.audio.srcObject = null;
      peer.audio.remove();
    } catch {}

    this.peers.delete(remoteUid);
  }

  private setupPeerForRemoteUser(remoteUid: string) {
    if (!this.roomCode || !this.currentUser || !this.localStream) return;

    const myUid = this.currentUser.uid;
    const pairId = this.getPairId(myUid, remoteUid);
    const isInitiator = myUid < remoteUid;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = this.isDeafened;

    const peerData: PeerConnectionData = {
      pairId,
      remoteUid,
      pc,
      audio,
      candidateQueue: [],
      processedCandidates: new Set<string>(),
      lastProcessedOfferSdp: null,
      lastProcessedAnswerSdp: null,
      unsubscribePair: null,
    };

    this.peers.set(remoteUid, peerData);

    // 1. Add local audio tracks to peer connection
    this.localStream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    // 2. Play remote audio stream when tracks arrive
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        peerData.audio.srcObject = event.streams[0];
        peerData.audio.play().catch((e) => console.warn('Remote audio play warning:', e));
      }
    };

    // 3. Send ICE candidates to Firestore per player pair
    const pairDocRef = doc(db, 'rooms', this.roomCode, 'voice_signals', pairId);

    pc.onicecandidate = async (event) => {
      if (event.candidate && this.roomCode) {
        const cand = event.candidate.toJSON();
        const fieldName = isInitiator ? 'candidatesA' : 'candidatesB';

        try {
          await updateDoc(pairDocRef, {
            [fieldName]: arrayUnion(cand),
            updatedAt: Date.now(),
          });
        } catch {
          // If pair document does not exist yet, initialize it
          try {
            await setDoc(
              pairDocRef,
              {
                pairId,
                initiatorUid: isInitiator ? myUid : remoteUid,
                receiverUid: isInitiator ? remoteUid : myUid,
                [fieldName]: [cand],
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } catch (err: any) {
            console.warn('Failed to send ICE candidate:', err);
          }
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        const failMsg = `RTCPeerConnection failed with peer ${remoteUid}`;
        console.warn(failMsg);
      }
    };

    // 4. Initiator creates the WebRTC offer
    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true })
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          await setDoc(
            pairDocRef,
            {
              pairId,
              initiatorUid: myUid,
              receiverUid: remoteUid,
              offer: {
                type: offer.type,
                sdp: offer.sdp,
                from: myUid,
                timestamp: Date.now(),
              },
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        })
        .catch((err: any) => {
          console.warn('Create offer error:', err);
          const rawError = err?.name && err?.message
            ? `${err.name}: ${err.message}`
            : (err?.message || String(err));
          this.error = rawError;
          this.emitState();
        });
    }

    // 5. Listen to signaling document for this player pair
    peerData.unsubscribePair = onSnapshot(
      pairDocRef,
      async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (!data) return;

        try {
          if (isInitiator) {
            // Initiator waits for answer
            if (data.answer && data.answer.sdp && data.answer.sdp !== peerData.lastProcessedAnswerSdp) {
              peerData.lastProcessedAnswerSdp = data.answer.sdp;
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

              // Drain any queued ICE candidates
              while (peerData.candidateQueue.length > 0) {
                const cand = peerData.candidateQueue.shift()!;
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
            }

            // Ingest candidates from receiver (candidatesB)
            if (Array.isArray(data.candidatesB)) {
              for (const cand of data.candidatesB) {
                const key = JSON.stringify(cand);
                if (!peerData.processedCandidates.has(key)) {
                  peerData.processedCandidates.add(key);
                  if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                  } else {
                    peerData.candidateQueue.push(cand);
                  }
                }
              }
            }
          } else {
            // Receiver handles incoming offer
            if (data.offer && data.offer.sdp && data.offer.sdp !== peerData.lastProcessedOfferSdp) {
              peerData.lastProcessedOfferSdp = data.offer.sdp;
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

              // Drain any queued ICE candidates
              while (peerData.candidateQueue.length > 0) {
                const cand = peerData.candidateQueue.shift()!;
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }

              // Create and send answer
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              await updateDoc(pairDocRef, {
                answer: {
                  type: answer.type,
                  sdp: answer.sdp,
                  from: myUid,
                  timestamp: Date.now(),
                },
                updatedAt: Date.now(),
              }).catch(async () => {
                await setDoc(
                  pairDocRef,
                  {
                    pairId,
                    initiatorUid: remoteUid,
                    receiverUid: myUid,
                    answer: {
                      type: answer.type,
                      sdp: answer.sdp,
                      from: myUid,
                      timestamp: Date.now(),
                    },
                    updatedAt: Date.now(),
                  },
                  { merge: true }
                );
              });
            }

            // Ingest candidates from initiator (candidatesA)
            if (Array.isArray(data.candidatesA)) {
              for (const cand of data.candidatesA) {
                const key = JSON.stringify(cand);
                if (!peerData.processedCandidates.has(key)) {
                  peerData.processedCandidates.add(key);
                  if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                  } else {
                    peerData.candidateQueue.push(cand);
                  }
                }
              }
            }
          }
        } catch (err: any) {
          console.warn(`Signaling error with peer ${remoteUid}:`, err);
          const rawError = err?.name && err?.message
            ? `${err.name}: ${err.message}`
            : (err?.message || String(err));
          this.error = rawError;
          this.emitState();
        }
      },
      (err) => {
        console.warn(`Signal listener error for pair ${pairId}:`, err);
        const rawError = err?.name && err?.message
          ? `${err.name}: ${err.message}`
          : (err?.message || String(err));
        this.error = rawError;
        this.emitState();
      }
    );
  }
}

export const globalVoiceService = new VoiceService();
