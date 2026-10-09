import confetti from 'canvas-confetti';

class SoundManager {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  constructor() {
    this.muted = localStorage.getItem('hm_muted') === '1';
  }

  private ensure() {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioContextClass();
      } catch {
        // audio context unavailable
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public beep(freq = 440, duration = 0.12, type: OscillatorType = 'sine', gainVal = 0.12) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, this.ctx.currentTime);
      g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio node error safe ignore
    }
  }

  public click() {
    this.beep(600, 0.05, 'square', 0.08);
  }

  public cardDeal() {
    this.beep(420, 0.04, 'triangle', 0.1);
  }

  public chipBet() {
    this.beep(750, 0.04, 'sine', 0.15);
  }

  public dominoClack() {
    this.beep(240, 0.03, 'triangle', 0.22);
    setTimeout(() => this.beep(460, 0.02, 'sine', 0.14), 12);
    setTimeout(() => this.beep(180, 0.04, 'triangle', 0.1), 22);
  }

  public diceRoll() {
    [320, 480, 290, 510].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.05, 'triangle', 0.1), i * 40);
    });
  }

  public diceBounce(intensity = 1) {
    if (this.muted) return;
    const vol = Math.min(0.2, 0.05 + intensity * 0.08);
    const freq = 220 + Math.random() * 120;
    this.beep(freq, 0.03, 'sine', vol);
  }

  public diceWallBounce() {
    if (this.muted) return;
    this.beep(160, 0.04, 'triangle', 0.16);
    setTimeout(() => this.beep(340, 0.02, 'sine', 0.08), 10);
  }

  public digitalTick() {
    this.beep(550 + Math.random() * 250, 0.025, 'square', 0.04);
  }

  public digitalLock() {
    this.beep(980, 0.09, 'sine', 0.12);
    setTimeout(() => this.beep(1318, 0.12, 'triangle', 0.14), 40);
  }

  public win() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.14, 'sine', 0.14), i * 90);
    });
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#f5b942', '#ffd97a', '#2ecc71', '#3498db'],
      });
    } catch {
      // confetti fallback
    }
  }

  public jackpot() {
    [523, 659, 784, 1047, 1318].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.2, 'square', 0.12), i * 110);
    });
    try {
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#ffd700', '#ffaa00', '#ff4500', '#00ffcc'],
      });
    } catch {
      // fallback
    }
  }

  public lose() {
    [400, 310, 220].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.18, 'sawtooth', 0.09), i * 120);
    });
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('hm_muted', this.muted ? '1' : '0');
    return this.muted;
  }
}

export const Sound = new SoundManager();
