import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '../../types';
import { PlayerBadge } from '../PlayerBadge';
import { Backend } from '../../utils/backend';
import { Sound } from '../../utils/sound';
import hushLogo from '../../assets/images/hush_gold_black_bright.png';
import {
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Trash2,
  Zap,
  Info,
  Dices,
  Coins,
  ChevronRight,
  ShieldCheck,
  Flame,
  Cpu,
} from 'lucide-react';

export type CrapsBetSpot =
  | 'pass'
  | 'dont_pass'
  | 'come'
  | 'dont_come'
  | 'field'
  | 'place_4'
  | 'place_5'
  | 'place_6'
  | 'place_8'
  | 'place_9'
  | 'place_10'
  | 'hard_4'
  | 'hard_6'
  | 'hard_8'
  | 'hard_10'
  | 'any_7'
  | 'any_craps'
  | 'yo_11'
  | 'aces_2'
  | 'boxcars_12'
  | 'ace_deuce_3';

export interface ChipDenomination {
  value: number;
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  accent: string;
}

export const CHIP_OPTIONS: ChipDenomination[] = [
  { value: 5, label: '5', color: 'bg-red-600', textColor: 'text-white', borderColor: 'border-red-300', accent: '#dc2626' },
  { value: 25, label: '25', color: 'bg-emerald-600', textColor: 'text-white', borderColor: 'border-emerald-300', accent: '#059669' },
  { value: 100, label: '100', color: 'bg-slate-900', textColor: 'text-amber-400', borderColor: 'border-amber-400', accent: '#0f172a' },
  { value: 500, label: '500', color: 'bg-purple-700', textColor: 'text-white', borderColor: 'border-purple-300', accent: '#7e22ce' },
  { value: 1000, label: '1K', color: 'bg-amber-500', textColor: 'text-slate-950', borderColor: 'border-yellow-200', accent: '#f59e0b' },
];

export interface RollResult {
  dice: [number, number];
  total: number;
  isHardway: boolean;
  timestamp: number;
}

interface BetOutcome {
  spot: CrapsBetSpot;
  name: string;
  wager: number;
  payout: number;
  status: 'won' | 'lost' | 'pushed' | 'working';
}

interface CrapsGameProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

// 3D Vector & Matrix math for Realistic Rolling Dice Simulation
type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

function mat3MulVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function mat3Identity(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return r;
}

// Rodrigues rotation
function mat3FromAxisAngle(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

// Target rotations for Face 1 to 6 pointing face-up (towards camera / viewer)
function getTargetOrientationForFace(face: number): Mat3 {
  // Local faces normal in die space:
  // Face 1: (0, 0, 1)   - Top
  // Face 6: (0, 0, -1)  - Bottom
  // Face 2: (0, 1, 0)   - Front
  // Face 5: (0, -1, 0)  - Back
  // Face 3: (1, 0, 0)   - Right
  // Face 4: (-1, 0, 0)  - Left
  switch (face) {
    case 1:
      return mat3Identity();
    case 6:
      return mat3FromAxisAngle([1, 0, 0], Math.PI);
    case 2:
      return mat3FromAxisAngle([1, 0, 0], -Math.PI / 2);
    case 5:
      return mat3FromAxisAngle([1, 0, 0], Math.PI / 2);
    case 3:
      return mat3FromAxisAngle([0, 1, 0], Math.PI / 2);
    case 4:
      return mat3FromAxisAngle([0, 1, 0], -Math.PI / 2);
    default:
      return mat3Identity();
  }
}

// Die Physical State
interface PhysicalDie {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: Mat3;
  angVel: Vec3;
  size: number;
  targetFace: number;
  settled: boolean;
}

// ==========================================
// Digital LED Die Component
// ==========================================
interface DigitalDieProps {
  value: number;
  isRolling: boolean;
  isLocked: boolean;
  label: string;
}

const DigitalDie: React.FC<DigitalDieProps> = ({ value, isRolling, isLocked, label }) => {
  // Standard 3x3 pip positions:
  // 0: top-left,   1: top-mid,   2: top-right
  // 3: mid-left,   4: center,    5: mid-right
  // 6: btm-left,   7: btm-mid,   8: btm-right
  const activePipIndices: Record<number, number[]> = {
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  const activeIndices = new Set(activePipIndices[value] || [4]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isLocked
              ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
              : 'bg-rose-500 animate-ping'
          }`}
        />
        <span>{label}</span>
      </div>
      <div
        className={`relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 md:p-4 bg-gradient-to-b from-slate-900 via-slate-950 to-black border-2 transition-all duration-150 flex flex-col justify-between shadow-2xl select-none ${
          isRolling && !isLocked
            ? 'border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.65)] scale-[1.02]'
            : 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
        }`}
      >
        {/* Subtle glass gloss highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-2xl sm:rounded-3xl pointer-events-none" />

        {/* Digital Corner Value */}
        <div className="absolute top-2 right-2.5 font-mono font-black text-xs sm:text-sm text-rose-300 bg-black/70 px-1.5 sm:px-2 py-0.5 rounded-md border border-rose-500/40 shadow-inner">
          {value}
        </div>

        {/* 3x3 LED Grid */}
        <div className="grid grid-cols-3 grid-rows-3 gap-1.5 sm:gap-2.5 w-full h-full pt-3 sm:pt-4">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
            const isActive = activeIndices.has(idx);
            return (
              <div key={idx} className="flex items-center justify-center">
                {isActive ? (
                  <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-full bg-white border border-rose-200 shadow-[0_0_10px_#f43f5e,0_0_18px_#e11d48] animate-in fade-in zoom-in-75 duration-100" />
                ) : (
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full bg-slate-900/80 border border-slate-800/80 opacity-20" />
                )}
              </div>
            );
          })}
        </div>

        {/* Locked / Rolling status footer */}
        <div className="text-center pt-1 border-t border-slate-800/80">
          <span
            className={`font-mono text-[8px] sm:text-[9px] uppercase font-bold tracking-widest ${
              isLocked
                ? 'text-emerald-400 font-black'
                : 'text-amber-400 animate-pulse'
            }`}
          >
            {isLocked ? '• LOCKED •' : '• SHUFFLING •'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const CrapsGame: React.FC<CrapsGameProps> = ({ user, onUpdateUser }) => {
  // Game Table States
  const [point, setPoint] = useState<number | null>(null);
  const [bets, setBets] = useState<Record<CrapsBetSpot, number>>({} as any);
  const [lastBets, setLastBets] = useState<Record<CrapsBetSpot, number>>({} as any);
  const [selectedChip, setSelectedChip] = useState<number>(25);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [rollHistory, setRollHistory] = useState<RollResult[]>([
    { dice: [3, 4], total: 7, isHardway: false, timestamp: Date.now() - 60000 },
  ]);
  const [currentDice, setCurrentDice] = useState<[number, number]>([3, 4]);
  const [stickmanCall, setStickmanCall] = useState<string>(
    'Welcome to the Craps Pit! Place your Pass Line bets. Roll 7 or 11 on the come-out!'
  );
  const [lastOutcomes, setLastOutcomes] = useState<BetOutcome[] | null>(null);
  const [lastPayoutTotal, setLastPayoutTotal] = useState<number>(0);
  const [rulesOpen, setRulesOpen] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(Sound.muted);

  // Digital Dice States (Default: digital)
  const [diceMode, setDiceMode] = useState<'digital' | '3d'>('digital');
  const [digitalDice, setDigitalDice] = useState<[number, number]>([3, 4]);
  const [die1Locked, setDie1Locked] = useState<boolean>(true);
  const [die2Locked, setDie2Locked] = useState<boolean>(true);
  const digitalIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Canvas & Physics Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const diceStateRef = useRef<[PhysicalDie, PhysicalDie] | null>(null);

  const totalCurrentWager = Object.values(bets).reduce((sum, v) => sum + (v || 0), 0);

  // Cleanup digital roll interval on unmount
  useEffect(() => {
    return () => {
      if (digitalIntervalRef.current) {
        clearInterval(digitalIntervalRef.current);
      }
    };
  }, []);

  // Sync canvas size if switched to 3D mode
  useEffect(() => {
    if (diceMode === '3d') {
      const canvas = canvasRef.current;
      if (canvas) {
        const width = canvas.clientWidth || 800;
        const height = canvas.clientHeight || 280;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        drawFrame();
      }
    }
  }, [diceMode]);

  // Initialize Canvas & Physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 280;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;

    // Initial stationary dice positioned near the center of the craps table
    diceStateRef.current = [
      {
        x: width * 0.42,
        y: height * 0.58,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: getTargetOrientationForFace(currentDice[0]),
        angVel: [0, 0, 0],
        size: 26,
        targetFace: currentDice[0],
        settled: true,
      },
      {
        x: width * 0.58,
        y: height * 0.58,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: getTargetOrientationForFace(currentDice[1]),
        angVel: [0, 0, 0],
        size: 26,
        targetFace: currentDice[1],
        settled: true,
      },
    ];

    drawFrame();

    const handleResize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      drawFrame();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Sync mute state
  const toggleSound = () => {
    const newMuted = Sound.toggleMute();
    setMuted(newMuted);
  };

  // Add chip to bet spot
  const handlePlaceBet = (spot: CrapsBetSpot) => {
    if (isRolling) return;
    if (user.points < selectedChip) {
      setStickmanCall("Not enough bankroll for that chip denomination!");
      return;
    }

    Sound.chipBet();
    setBets((prev) => ({
      ...prev,
      [spot]: (prev[spot] || 0) + selectedChip,
    }));
  };

  // Clear all bets
  const handleClearBets = () => {
    if (isRolling || totalCurrentWager === 0) return;
    Sound.click();
    setBets({} as any);
    setStickmanCall('All bets cleared from the craps felt.');
  };

  // Double current bets
  const handleDoubleBets = () => {
    if (isRolling || totalCurrentWager === 0) return;
    const doubled: Record<CrapsBetSpot, number> = {} as any;
    let newTotal = 0;
    for (const [key, val] of Object.entries(bets)) {
      if (val) {
        doubled[key as CrapsBetSpot] = val * 2;
        newTotal += val * 2;
      }
    }
    if (user.points < newTotal) {
      setStickmanCall("Not enough bankroll to double your wagers!");
      return;
    }
    Sound.chipBet();
    setBets(doubled);
  };

  // Repeat previous round bets
  const handleRepeatBets = () => {
    if (isRolling) return;
    const prevTotal = Object.values(lastBets).reduce((s, v) => s + (v || 0), 0);
    if (prevTotal === 0) {
      setStickmanCall('No previous bets to repeat.');
      return;
    }
    if (user.points < prevTotal) {
      setStickmanCall("Not enough bankroll to repeat previous bets!");
      return;
    }
    Sound.chipBet();
    setBets({ ...lastBets });
    setStickmanCall('Previous wagers replaced on the table.');
  };

  // Trigger Dice Roll (Digital or 3D)
  const startRoll = () => {
    if (isRolling) return;

    // Check if player has any bet placed
    if (totalCurrentWager <= 0) {
      setStickmanCall('Place a bet on the craps felt before shooting!');
      return;
    }

    if (user.points < totalCurrentWager) {
      setStickmanCall('Insufficient funds to cover your active table bets!');
      return;
    }

    // Deduct total bets from bankroll
    const userAfterBet = Backend.updatePoints(user, -totalCurrentWager, 'craps_bet');
    onUpdateUser(userAfterBet);
    setLastBets({ ...bets });

    setIsRolling(true);
    setLastOutcomes(null);

    // Pick random target roll
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    // ==========================================
    // 1. DIGITAL DICE MODE (Active by default)
    // ==========================================
    if (diceMode === 'digital') {
      setDie1Locked(false);
      setDie2Locked(false);
      setStickmanCall('Digital dice are rolling! Generating certified RNG outcome...');

      let step = 0;
      const totalSteps = 20;

      if (digitalIntervalRef.current) {
        clearInterval(digitalIntervalRef.current);
      }

      digitalIntervalRef.current = setInterval(() => {
        step++;
        Sound.digitalTick();

        const curD1 = step >= 14 ? d1 : Math.floor(Math.random() * 6) + 1;
        const curD2 = step >= totalSteps ? d2 : Math.floor(Math.random() * 6) + 1;

        setDigitalDice([curD1, curD2]);
        setCurrentDice([curD1, curD2]);

        if (step === 14) {
          setDie1Locked(true);
          Sound.digitalLock();
        }

        if (step >= totalSteps) {
          if (digitalIntervalRef.current) {
            clearInterval(digitalIntervalRef.current);
            digitalIntervalRef.current = null;
          }
          setDie2Locked(true);
          setDigitalDice([d1, d2]);
          setCurrentDice([d1, d2]);
          setIsRolling(false);
          Sound.digitalLock();
          finalizeCrapsRound(userAfterBet, d1, d2);
        }
      }, 65);
      return;
    }

    // ==========================================
    // 2. 3D PHYSICAL CANVAS MODE
    // ==========================================
    setCurrentDice([d1, d2]);

    Sound.diceRoll();
    setStickmanCall('Dice are rolling! Hands away from the table!');

    const canvas = canvasRef.current;
    const w = canvas ? canvas.clientWidth : 800;
    const h = canvas ? canvas.clientHeight : 280;

    // Launch dice with dynamic velocity toward the back pyramid bumper to tumble and roll
    const baseVx = (Math.random() - 0.5) * 12;
    const baseVy = -(18 + Math.random() * 8);

    diceStateRef.current = [
      {
        x: w * 0.38 + (Math.random() - 0.5) * 30,
        y: h * 0.82,
        z: 35 + Math.random() * 25,
        vx: baseVx - 2.5 - Math.random() * 3,
        vy: baseVy - Math.random() * 4,
        vz: 12 + Math.random() * 6,
        rot: mat3FromAxisAngle([Math.random(), Math.random(), Math.random()], Math.random() * Math.PI),
        angVel: [
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
        ],
        size: 26,
        targetFace: d1,
        settled: false,
      },
      {
        x: w * 0.62 + (Math.random() - 0.5) * 30,
        y: h * 0.82,
        z: 35 + Math.random() * 25,
        vx: baseVx + 2.5 + Math.random() * 3,
        vy: baseVy - Math.random() * 4,
        vz: 13 + Math.random() * 6,
        rot: mat3FromAxisAngle([Math.random(), Math.random(), Math.random()], Math.random() * Math.PI),
        angVel: [
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
        ],
        size: 26,
        targetFace: d2,
        settled: false,
      },
    ];

    animatePhysics(userAfterBet, d1, d2);
  };

  // Main 3D Physics Animation Loop
  const animatePhysics = (activeUser: User, finalD1: number, finalD2: number) => {
    let lastTime = performance.now();
    const gravity = 46; // pixels per sec^2
    const restitution = 0.58; // bounciness off table felt
    const wallRestitution = 0.72; // bounce off pyramid rubber wall
    const feltFriction = 0.982;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.035);
      lastTime = now;

      const canvas = canvasRef.current;
      if (!canvas || !diceStateRef.current) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const dice = diceStateRef.current;
      let allSettled = true;

      // Update each die
      for (let i = 0; i < 2; i++) {
        const d = dice[i];
        if (d.settled) continue;

        // Gravity on height (Z)
        d.vz -= gravity * dt;
        d.z += d.vz;
        d.x += d.vx;
        d.y += d.vy;

        // Felt collision (Z <= 0)
        if (d.z <= 0) {
          d.z = 0;
          if (Math.abs(d.vz) > 1.2) {
            d.vz = -d.vz * restitution;
            Sound.diceBounce(Math.min(1, Math.abs(d.vz) / 10));
            // Angular perturbation on bounce
            d.angVel[0] += (Math.random() - 0.5) * 12;
            d.angVel[1] += (Math.random() - 0.5) * 12;
          } else {
            d.vz = 0;
          }
        }

        // Apply felt friction
        if (d.z === 0) {
          d.vx *= feltFriction;
          d.vy *= feltFriction;
          d.angVel[0] *= 0.93;
          d.angVel[1] *= 0.93;
          d.angVel[2] *= 0.93;
        }

        // Table boundaries & Bumper bounces
        const minX = 40;
        const maxX = w - 40;
        const minY = 36; // Diamond pyramid backstop wall
        const maxY = h - 36; // Bottom armrest rail

        if (d.x < minX) {
          d.x = minX;
          d.vx = -d.vx * wallRestitution;
          Sound.diceBounce(0.6);
        } else if (d.x > maxX) {
          d.x = maxX;
          d.vx = -d.vx * wallRestitution;
          Sound.diceBounce(0.6);
        }

        if (d.y < minY) {
          d.y = minY;
          d.vy = -d.vy * wallRestitution;
          // Impressed backward impulse from pyramid bumper
          d.vx += (Math.random() - 0.5) * 6;
          Sound.diceWallBounce();
        } else if (d.y > maxY) {
          d.y = maxY;
          d.vy = -d.vy * wallRestitution;
          Sound.diceBounce(0.5);
        }

        // Integrate 3D Angular Velocity into Rotation Matrix
        const angSpeed = Math.hypot(d.angVel[0], d.angVel[1], d.angVel[2]);
        if (angSpeed > 0.001) {
          const axis: Vec3 = [
            d.angVel[0] / angSpeed,
            d.angVel[1] / angSpeed,
            d.angVel[2] / angSpeed,
          ];
          const dRot = mat3FromAxisAngle(axis, angSpeed * dt);
          d.rot = mat3Mul(dRot, d.rot);
        }

        // Settling phase: as speeds fall, smoothly align to target face-up
        const linSpeed = Math.hypot(d.vx, d.vy, d.vz);
        if (linSpeed < 2.0 && d.z < 2) {
          // Gently slerp rotation towards exact target face
          const targetRot = getTargetOrientationForFace(d.targetFace);
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              d.rot[r][c] += (targetRot[r][c] - d.rot[r][c]) * 0.18;
            }
          }
          d.angVel = [0, 0, 0];
          d.vx = 0;
          d.vy = 0;
          d.vz = 0;
          d.z = 0;
          d.settled = true;
        } else {
          allSettled = false;
        }
      }

      // Dice-to-Dice Collision
      const d1 = dice[0];
      const d2 = dice[1];
      const dx = d2.x - d1.x;
      const dy = d2.y - d1.y;
      const dz = d2.z - d1.z;
      const dist = Math.hypot(dx, dy, dz);
      const minDistance = d1.size * 1.95;

      if (dist < minDistance && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        // Relative velocity
        const rvx = d2.vx - d1.vx;
        const rvy = d2.vy - d1.vy;
        const rvz = d2.vz - d1.vz;
        const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

        if (velAlongNormal < 0) {
          const impulse = -(1 + restitution) * velAlongNormal * 0.5;
          d1.vx -= impulse * nx;
          d1.vy -= impulse * ny;
          d1.vz -= impulse * nz;
          d2.vx += impulse * nx;
          d2.vy += impulse * ny;
          d2.vz += impulse * nz;
          Sound.diceBounce(0.8);
        }
      }

      drawFrame();

      if (!allSettled) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Finalize roll settling
        setIsRolling(false);
        finalizeCrapsRound(activeUser, finalD1, finalD2);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  };

  // Render 3D Frame on Canvas
  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas || !diceStateRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Draw Casino Craps Felt Background
    ctx.clearRect(0, 0, w, h);

    // Dark emerald felt gradient with vignette
    const feltGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
    feltGrad.addColorStop(0, '#0d5c36');
    feltGrad.addColorStop(0.65, '#074125');
    feltGrad.addColorStop(1, '#042716');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle felt grain / cloth weave pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // 2. Pyramid Rubber Backstop Bumper (Top Wall)
    // Authentic Vegas craps diamond-studded rubber cushion
    const bumperHeight = 28;
    const bumperGrad = ctx.createLinearGradient(0, 0, 0, bumperHeight);
    bumperGrad.addColorStop(0, '#1a1008');
    bumperGrad.addColorStop(0.4, '#3a1f10');
    bumperGrad.addColorStop(0.8, '#1e3820');
    bumperGrad.addColorStop(1, '#0c2214');
    ctx.fillStyle = bumperGrad;
    ctx.fillRect(0, 0, w, bumperHeight);

    // Embossed pyramid diamonds across top bumper
    const diamondSize = 12;
    for (let bx = 0; bx < w; bx += diamondSize) {
      ctx.fillStyle = '#062916';
      ctx.beginPath();
      ctx.moveTo(bx, bumperHeight);
      ctx.lineTo(bx + diamondSize / 2, 8);
      ctx.lineTo(bx + diamondSize, bumperHeight);
      ctx.closePath();
      ctx.fill();

      // Diamond light bevel
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx, bumperHeight);
      ctx.lineTo(bx + diamondSize / 2, 8);
      ctx.stroke();

      // Diamond shadow bevel
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.moveTo(bx + diamondSize / 2, 8);
      ctx.lineTo(bx + diamondSize, bumperHeight);
      ctx.stroke();
    }

    // Gold trim bar below bumper
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, bumperHeight);
    ctx.lineTo(w, bumperHeight);
    ctx.stroke();

    // 3. Side & Bottom Railing Borders (Polished Mahogany Armrest)
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, w, h);

    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, bumperHeight, w - 8, h - bumperHeight - 4);

    // 4. Center Craps Pit Watermark
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('HUSH MUSIC CASINO • VEGAS CRAPS', w / 2, h / 2 - 12);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('★ DICE MUST HIT THE BACK WALL ★', w / 2, h / 2 + 10);
    ctx.restore();

    // 5. Draw Shadows for Both Dice onto Felt
    const dice = diceStateRef.current;
    for (const d of dice) {
      const shadowX = d.x;
      const shadowY = d.y + 4 + d.z * 0.18;
      const shadowRadiusX = d.size * (0.85 + d.z * 0.007);
      const shadowRadiusY = d.size * (0.55 + d.z * 0.005);
      const shadowAlpha = Math.max(0.12, 0.55 / (1 + d.z * 0.035));

      const sGrad = ctx.createRadialGradient(
        shadowX,
        shadowY,
        0,
        shadowX,
        shadowY,
        shadowRadiusX
      );
      sGrad.addColorStop(0, `rgba(0, 0, 0, ${shadowAlpha})`);
      sGrad.addColorStop(0.7, `rgba(0, 0, 0, ${shadowAlpha * 0.5})`);
      sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.ellipse(shadowX, shadowY, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Draw 3D Translucent Ruby Red Casino Dice with Crisp White Pips
    // Sort dice by depth/height so front one renders on top
    const sortedDice = [...dice].sort((a, b) => a.y - b.y);

    for (const d of sortedDice) {
      renderDie3D(ctx, d);
    }

    ctx.restore();
  };

  // 3D Die Rendering Engine
  const renderDie3D = (ctx: CanvasRenderingContext2D, d: PhysicalDie) => {
    const s = d.size * 0.85; // half width
    const screenX = d.x;
    const screenY = d.y - d.z; // apply height offset

    // Cube 8 vertices in die local coordinates:
    const localVerts: Vec3[] = [
      [-s, -s, -s], // 0
      [s, -s, -s],  // 1
      [s, s, -s],   // 2
      [-s, s, -s],  // 3
      [-s, -s, s],  // 4
      [s, -s, s],   // 5
      [s, s, s],    // 6
      [-s, s, s],   // 7
    ];

    // Transform vertices with rotation matrix
    const rotVerts = localVerts.map((v) => mat3MulVec(d.rot, v));

    // Project with isometric perspective camera tilt (camera looking down at 30 deg)
    const tilt = 0.55;
    const projVerts = rotVerts.map(([vx, vy, vz]) => ({
      x: screenX + vx,
      y: screenY + vy * tilt - vz * 0.82,
      z: vz + vy * 0.3,
    }));

    // 6 Faces definitions with normal and standard pip values
    // Opposite faces sum to 7:
    // Face 1 (+Z: [4, 5, 6, 7]) opposite Face 6 (-Z: [3, 2, 1, 0])
    // Face 2 (+Y: [7, 6, 2, 3]) opposite Face 5 (-Y: [4, 0, 1, 5])
    // Face 3 (+X: [5, 1, 2, 6]) opposite Face 4 (-X: [4, 7, 3, 0])
    const faces = [
      { num: 1, idxs: [4, 5, 6, 7], normal: [0, 0, 1] as Vec3 },
      { num: 6, idxs: [3, 2, 1, 0], normal: [0, 0, -1] as Vec3 },
      { num: 2, idxs: [7, 6, 2, 3], normal: [0, 1, 0] as Vec3 },
      { num: 5, idxs: [4, 0, 1, 5], normal: [0, -1, 0] as Vec3 },
      { num: 3, idxs: [5, 1, 2, 6], normal: [1, 0, 0] as Vec3 },
      { num: 4, idxs: [4, 7, 3, 0], normal: [-1, 0, 0] as Vec3 },
    ];

    // Compute surface normals & camera visibility
    const lightDir: Vec3 = [0.35, -0.6, 0.75];
    const lightLen = Math.hypot(...lightDir);
    const nlDir: Vec3 = [lightDir[0] / lightLen, lightDir[1] / lightLen, lightDir[2] / lightLen];

    const renderedFaces = faces
      .map((f) => {
        const rotNormal = mat3MulVec(d.rot, f.normal);
        // Camera view vector in tilted perspective
        const viewDot = rotNormal[2] * 0.82 - rotNormal[1] * tilt;
        const pts = f.idxs.map((i) => projVerts[i]);
        const centerZ = pts.reduce((sum, p) => sum + p.z, 0) / 4;
        const diffuse = Math.max(0, rotNormal[0] * nlDir[0] + rotNormal[1] * nlDir[1] + rotNormal[2] * nlDir[2]);
        return {
          ...f,
          visible: viewDot > 0.05,
          pts,
          centerZ,
          diffuse,
          rotNormal,
        };
      })
      .filter((f) => f.visible)
      .sort((a, b) => a.centerZ - b.centerZ);

    // Draw visible faces
    for (const f of renderedFaces) {
      // Shading based on diffuse light
      const brightness = 0.6 + f.diffuse * 0.45;
      const r = Math.min(255, Math.floor(215 * brightness));
      const g = Math.min(255, Math.floor(20 * brightness));
      const b = Math.min(255, Math.floor(38 * brightness));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) {
        ctx.lineTo(f.pts[i].x, f.pts[i].y);
      }
      ctx.closePath();

      // Translucent acrylic gradient
      const fGrad = ctx.createLinearGradient(f.pts[0].x, f.pts[0].y, f.pts[2].x, f.pts[2].y);
      fGrad.addColorStop(0, `rgba(${Math.min(255, r + 45)}, ${g + 15}, ${b + 20}, 0.94)`);
      fGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.92)`);
      fGrad.addColorStop(1, `rgba(${Math.max(80, r - 45)}, ${Math.max(5, g - 10)}, ${Math.max(10, b - 15)}, 0.95)`);

      ctx.fillStyle = fGrad;
      ctx.fill();

      // Polished beveled edge highlight
      ctx.strokeStyle = `rgba(255, 140, 160, ${0.45 * brightness})`;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Render Pips on this Face
      drawPipsOnFace(ctx, f.num, f.pts, f.diffuse);
      ctx.restore();
    }
  };

  // Draw 3D Pips projected onto face quad
  const drawPipsOnFace = (
    ctx: CanvasRenderingContext2D,
    faceNum: number,
    quad: Array<{ x: number; y: number }>,
    diffuse: number
  ) => {
    // Quad corners: [p0, p1, p2, p3] representing (-1,-1), (1,-1), (1,1), (-1,1) in face coordinates
    const p0 = quad[0];
    const p1 = quad[1];
    const p2 = quad[2];
    const p3 = quad[3];

    // Bilinear interpolation from face [-1, 1] to screen (x, y)
    const mapCoord = (u: number, v: number) => {
      const s = (u + 1) / 2;
      const t = (v + 1) / 2;
      const x = (1 - s) * (1 - t) * p0.x + s * (1 - t) * p1.x + s * t * p2.x + (1 - s) * t * p3.x;
      const y = (1 - s) * (1 - t) * p0.y + s * (1 - t) * p1.y + s * t * p2.y + (1 - s) * t * p3.y;
      return { x, y };
    };

    // Pip coordinates for each face
    const pipCoords: Record<number, Array<[number, number]>> = {
      1: [[0, 0]],
      2: [[-0.5, -0.5], [0.5, 0.5]],
      3: [[-0.55, -0.55], [0, 0], [0.55, 0.55]],
      4: [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]],
      5: [[-0.54, -0.54], [0.54, -0.54], [0, 0], [-0.54, 0.54], [0.54, 0.54]],
      6: [
        [-0.52, -0.6],
        [0.52, -0.6],
        [-0.52, 0],
        [0.52, 0],
        [-0.52, 0.6],
        [0.52, 0.6],
      ],
    };

    const pips = pipCoords[faceNum] || [];
    const pipRadius = faceNum === 1 ? 5.2 : 3.6;

    for (const [u, v] of pips) {
      const pt = mapCoord(u, v);

      // Inset bevel shadow
      ctx.fillStyle = 'rgba(60, 5, 10, 0.65)';
      ctx.beginPath();
      ctx.arc(pt.x + 0.4, pt.y + 0.6, pipRadius, 0, Math.PI * 2);
      ctx.fill();

      // Pip body: Crisp casino white
      const pipGrad = ctx.createRadialGradient(
        pt.x - 0.8,
        pt.y - 0.8,
        0.5,
        pt.x,
        pt.y,
        pipRadius
      );
      pipGrad.addColorStop(0, '#ffffff');
      pipGrad.addColorStop(0.8, '#f1f5f9');
      pipGrad.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = pipGrad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pipRadius, 0, Math.PI * 2);
      ctx.fill();

      // If Face 1 center pip: Add Gold Star / Hush Music emblem dot
      if (faceNum === 1) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };


  // Finalize Craps Roll Settlement & Payout Engine
  const finalizeCrapsRound = (activeUser: User, d1: number, d2: number) => {
    const total = d1 + d2;
    const isHardway = d1 === d2;
    const rollData: RollResult = {
      dice: [d1, d2],
      total,
      isHardway,
      timestamp: Date.now(),
    };

    setRollHistory((prev) => [rollData, ...prev.slice(0, 14)]);

    const outcomes: BetOutcome[] = [];
    let totalWinPayout = 0;
    let nextPoint: number | null = point;

    // Call voice / stickman call generator
    let announcement = '';

    // ==========================================
    // 1. COME-OUT PHASE (Puck is OFF)
    // ==========================================
    if (point === null) {
      if (total === 7 || total === 11) {
        announcement = `🔥 Winner ${total}! Front line winner! Natural!`;
      } else if (total === 2 || total === 3 || total === 12) {
        announcement = `Craps ${total}! Line away!`;
      } else {
        announcement = `Point is ${total}! Mark the ${total}!`;
        nextPoint = total;
      }

      // Settle Pass Line
      if (bets.pass) {
        if (total === 7 || total === 11) {
          const payout = bets.pass * 2; // 1:1 payout + wager
          totalWinPayout += payout;
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout, status: 'won' });
        } else if (total === 2 || total === 3 || total === 12) {
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout: 0, status: 'lost' });
        } else {
          // Working into point phase
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout: 0, status: 'working' });
        }
      }

      // Settle Don't Pass
      if (bets.dont_pass) {
        if (total === 2 || total === 3) {
          const payout = bets.dont_pass * 2;
          totalWinPayout += payout;
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout, status: 'won' });
        } else if (total === 12) {
          // Bar 12 (Push)
          totalWinPayout += bets.dont_pass;
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass (Bar 12 Push)", wager: bets.dont_pass, payout: bets.dont_pass, status: 'pushed' });
        } else if (total === 7 || total === 11) {
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout: 0, status: 'lost' });
        } else {
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout: 0, status: 'working' });
        }
      }
    }
    // ==========================================
    // 2. POINT PHASE (Puck is ON)
    // ==========================================
    else {
      if (total === point) {
        announcement = `🎉 Hit the Point ${point}! Winner on the Pass Line!`;
        nextPoint = null; // resets puck to OFF
      } else if (total === 7) {
        announcement = `Seven Out! Line away! Take the pass, pay the behind!`;
        nextPoint = null; // resets puck to OFF
      } else {
        announcement = `Rolled ${total}. Point remains ${point}. Shooter rolls again!`;
      }

      // Settle Pass Line
      if (bets.pass) {
        if (total === point) {
          const payout = bets.pass * 2;
          totalWinPayout += payout;
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout, status: 'won' });
        } else if (total === 7) {
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout: 0, status: 'lost' });
        } else {
          outcomes.push({ spot: 'pass', name: 'Pass Line', wager: bets.pass, payout: 0, status: 'working' });
        }
      }

      // Settle Don't Pass
      if (bets.dont_pass) {
        if (total === 7) {
          const payout = bets.dont_pass * 2;
          totalWinPayout += payout;
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout, status: 'won' });
        } else if (total === point) {
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout: 0, status: 'lost' });
        } else {
          outcomes.push({ spot: 'dont_pass', name: "Don't Pass", wager: bets.dont_pass, payout: 0, status: 'working' });
        }
      }
    }

    // ==========================================
    // 3. PLACE BETS (4, 5, 6, 8, 9, 10)
    // ==========================================
    const placeOdds: Record<string, { num: number; mult: number }> = {
      place_4: { num: 4, mult: 9 / 5 },
      place_5: { num: 5, mult: 7 / 5 },
      place_6: { num: 6, mult: 7 / 6 },
      place_8: { num: 8, mult: 7 / 6 },
      place_9: { num: 9, mult: 7 / 5 },
      place_10: { num: 10, mult: 9 / 5 },
    };

    for (const [spotKey, conf] of Object.entries(placeOdds)) {
      const wager = bets[spotKey as CrapsBetSpot];
      if (wager) {
        if (total === conf.num) {
          const profit = Math.round(wager * conf.mult);
          const payout = wager + profit;
          totalWinPayout += payout;
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Place ${conf.num}`, wager, payout, status: 'won' });
        } else if (total === 7) {
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Place ${conf.num}`, wager, payout: 0, status: 'lost' });
        } else {
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Place ${conf.num}`, wager, payout: 0, status: 'working' });
        }
      }
    }

    // ==========================================
    // 4. THE FIELD (2, 3, 4, 9, 10, 11, 12) - One-roll bet
    // ==========================================
    if (bets.field) {
      const wager = bets.field;
      if (total === 2) {
        // Pays Double (2:1) + return wager = 3x
        const payout = wager * 3;
        totalWinPayout += payout;
        outcomes.push({ spot: 'field', name: 'Field (2 Double!)', wager, payout, status: 'won' });
      } else if (total === 12) {
        // Pays Triple (3:1) + return wager = 4x
        const payout = wager * 4;
        totalWinPayout += payout;
        outcomes.push({ spot: 'field', name: 'Field (12 Triple!)', wager, payout, status: 'won' });
      } else if ([3, 4, 9, 10, 11].includes(total)) {
        // Pays 1:1 + return wager = 2x
        const payout = wager * 2;
        totalWinPayout += payout;
        outcomes.push({ spot: 'field', name: `Field (${total})`, wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'field', name: 'Field', wager, payout: 0, status: 'lost' });
      }
    }

    // ==========================================
    // 5. HARDWAYS (Hard 4, Hard 6, Hard 8, Hard 10)
    // ==========================================
    const hardwayOdds: Record<string, { total: number; payoutMult: number }> = {
      hard_4: { total: 4, payoutMult: 7 },
      hard_6: { total: 6, payoutMult: 9 },
      hard_8: { total: 8, payoutMult: 9 },
      hard_10: { total: 10, payoutMult: 7 },
    };

    for (const [spotKey, conf] of Object.entries(hardwayOdds)) {
      const wager = bets[spotKey as CrapsBetSpot];
      if (wager) {
        if (total === conf.total && isHardway) {
          const payout = wager * (conf.payoutMult + 1);
          totalWinPayout += payout;
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Hard ${conf.total}`, wager, payout, status: 'won' });
        } else if (total === conf.total && !isHardway) {
          // Easy way lost
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Hard ${conf.total} (Easy ${total})`, wager, payout: 0, status: 'lost' });
        } else if (total === 7) {
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Hard ${conf.total}`, wager, payout: 0, status: 'lost' });
        } else {
          outcomes.push({ spot: spotKey as CrapsBetSpot, name: `Hard ${conf.total}`, wager, payout: 0, status: 'working' });
        }
      }
    }

    // ==========================================
    // 6. ONE-ROLL PROPOSITION BETS
    // ==========================================
    // Any Seven (4:1)
    if (bets.any_7) {
      const wager = bets.any_7;
      if (total === 7) {
        const payout = wager * 5;
        totalWinPayout += payout;
        outcomes.push({ spot: 'any_7', name: 'Any 7 (Red 7)', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'any_7', name: 'Any 7', wager, payout: 0, status: 'lost' });
      }
    }

    // Any Craps: 2, 3, or 12 (7:1)
    if (bets.any_craps) {
      const wager = bets.any_craps;
      if (total === 2 || total === 3 || total === 12) {
        const payout = wager * 8;
        totalWinPayout += payout;
        outcomes.push({ spot: 'any_craps', name: 'Any Craps', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'any_craps', name: 'Any Craps', wager, payout: 0, status: 'lost' });
      }
    }

    // Yo Eleven (15:1)
    if (bets.yo_11) {
      const wager = bets.yo_11;
      if (total === 11) {
        const payout = wager * 16;
        totalWinPayout += payout;
        outcomes.push({ spot: 'yo_11', name: 'Yo Eleven (11)', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'yo_11', name: 'Yo Eleven', wager, payout: 0, status: 'lost' });
      }
    }

    // Aces / Snake Eyes (30:1)
    if (bets.aces_2) {
      const wager = bets.aces_2;
      if (total === 2) {
        const payout = wager * 31;
        totalWinPayout += payout;
        outcomes.push({ spot: 'aces_2', name: 'Snake Eyes (Aces)', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'aces_2', name: 'Snake Eyes', wager, payout: 0, status: 'lost' });
      }
    }

    // Boxcars / Midnight 12 (30:1)
    if (bets.boxcars_12) {
      const wager = bets.boxcars_12;
      if (total === 12) {
        const payout = wager * 31;
        totalWinPayout += payout;
        outcomes.push({ spot: 'boxcars_12', name: 'Boxcars (12)', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'boxcars_12', name: 'Boxcars', wager, payout: 0, status: 'lost' });
      }
    }

    // Ace-Deuce 3 (15:1)
    if (bets.ace_deuce_3) {
      const wager = bets.ace_deuce_3;
      if (total === 3) {
        const payout = wager * 16;
        totalWinPayout += payout;
        outcomes.push({ spot: 'ace_deuce_3', name: 'Ace-Deuce (3)', wager, payout, status: 'won' });
      } else {
        outcomes.push({ spot: 'ace_deuce_3', name: 'Ace-Deuce', wager, payout: 0, status: 'lost' });
      }
    }

    // ==========================================
    // UPDATE STATE & PAYOUT
    // ==========================================
    setPoint(nextPoint);
    setStickmanCall(announcement);
    setLastOutcomes(outcomes);
    setLastPayoutTotal(totalWinPayout);

    // Keep active bets that are still 'working' (e.g., Pass Line in point phase, Place bets)
    const retainedBets: Record<CrapsBetSpot, number> = {} as any;
    for (const outcome of outcomes) {
      if (outcome.status === 'working') {
        retainedBets[outcome.spot] = outcome.wager;
      }
    }
    setBets(retainedBets);

    if (totalWinPayout > 0) {
      const userWin = Backend.updatePoints(activeUser, totalWinPayout, 'craps_win');
      onUpdateUser(userWin);
      if (totalWinPayout >= 200) {
        Sound.jackpot();
      } else {
        Sound.win();
      }
    } else {
      Sound.lose();
    }
  };

  // Helper to render chip stack badge on a bet spot
  const renderChipStack = (spot: CrapsBetSpot) => {
    const amount = bets[spot];
    if (!amount) return null;

    let chipClass = 'bg-red-600 border-red-300 text-white';
    if (amount >= 1000) chipClass = 'bg-amber-500 border-yellow-200 text-slate-950';
    else if (amount >= 500) chipClass = 'bg-purple-700 border-purple-300 text-white';
    else if (amount >= 100) chipClass = 'bg-slate-900 border-amber-400 text-amber-400';
    else if (amount >= 25) chipClass = 'bg-emerald-600 border-emerald-300 text-white';

    return (
      <div className="absolute top-1 right-1 z-20 flex items-center justify-center pointer-events-none drop-shadow-md">
        <div
          className={`w-6 h-6 rounded-full border border-dashed flex items-center justify-center font-black text-[10px] shadow-lg animate-scale-in ${chipClass}`}
        >
          {amount >= 1000 ? `${(amount / 1000).toFixed(0)}k` : amount}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 select-none pb-8">
      {/* Top HUD: Shooter Info, Stickman AI, Sound, Rules */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 shadow-xl text-xs">
        <PlayerBadge
          name={user.username}
          avatar={user.avatar}
          subtitle={`Shooter Bankroll: ⭐ ${(user.points ?? 0).toLocaleString()}`}
          size="sm"
        />

        {/* Puck Status Indicator */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            Table Puck:
          </span>
          {point !== null ? (
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-white text-slate-950 font-black flex items-center justify-center text-[10px] border border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                ON
              </span>
              <span className="font-extrabold text-amber-300 text-sm tracking-wide">
                POINT {point}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-black flex items-center justify-center text-[10px] border border-slate-600">
                OFF
              </span>
              <span className="font-extrabold text-slate-300 text-xs">
                COME-OUT ROLL
              </span>
            </div>
          )}
        </div>

        {/* Action Controls & Sound */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(!rulesOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
          >
            <Info className="w-4 h-4 text-amber-400" />
            <span>Rules</span>
          </button>
          <PlayerBadge
            name="Stickman AI"
            isRobot={true}
            subtitle="Craps Pit Boss"
            size="sm"
            align="right"
          />
        </div>
      </div>

      {/* Stickman Pit Announcement Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-950/70 border border-emerald-600/30 rounded-2xl p-3 shadow-lg flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 font-bold shrink-0">
            🎲
          </div>
          <div>
            <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              Stickman Call:
            </div>
            <div className="text-slate-100 font-semibold italic text-xs md:text-sm">
              "{stickmanCall}"
            </div>
          </div>
        </div>

        {/* Last Roll History Pills */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Recent:</span>
          {rollHistory.slice(0, 5).map((r, i) => (
            <span
              key={r.timestamp + i}
              className={`px-2 py-0.5 rounded text-xs font-black border ${
                r.total === 7
                  ? 'bg-rose-900/60 border-rose-500 text-rose-300'
                  : r.total === 11
                  ? 'bg-amber-900/60 border-amber-500 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              {r.total}
            </span>
          ))}
        </div>
      </div>

      {/* DICE DISPLAY AREA: DIGITAL DICE CONSOLE OR 3D FELT CANVAS */}
      {diceMode === 'digital' ? (
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-rose-500/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6 space-y-4">
          {/* Digital Console Header Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-rose-500/20 border border-rose-500/50 rounded-xl text-rose-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="font-mono font-black text-xs md:text-sm text-rose-300 uppercase tracking-wider flex items-center gap-2">
                  <span>DIGITAL CRAPS SHOOTER</span>
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    CERTIFIED RNG
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  ELECTRONIC LAS VEGAS DIGITAL DICE MATRIX
                </div>
              </div>
            </div>

            {/* Display Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setDiceMode('digital')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Digital Dice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiceMode('3d')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-slate-400 hover:text-white"
                >
                  <Dices className="w-3.5 h-3.5" />
                  <span>3D Felt</span>
                </button>
              </div>
            </div>
          </div>

          {/* Electronic Dice Rolling Arena */}
          <div className="flex items-center justify-center py-4 md:py-6 gap-3 sm:gap-6 md:gap-10">
            {/* Digital Die 1 */}
            <DigitalDie
              value={digitalDice[0]}
              isRolling={isRolling}
              isLocked={die1Locked}
              label="DIE 1"
            />

            {/* Electronic Operator & Center Total Display */}
            <div className="flex flex-col items-center justify-center">
              <div className="font-mono text-2xl sm:text-3xl font-black text-rose-400/80 mb-1">
                +
              </div>
              <div className="relative flex flex-col items-center justify-center px-4 py-2 sm:px-6 sm:py-3.5 rounded-2xl bg-black/90 border-2 border-amber-500/70 shadow-[0_0_30px_rgba(251,191,36,0.3)] min-w-[95px] sm:min-w-[130px]">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">
                  TOTAL
                </span>
                <span className="font-mono font-black text-3xl sm:text-4xl md:text-5xl text-amber-300 drop-shadow-[0_0_15px_rgba(251,191,36,0.7)]">
                  {digitalDice[0] + digitalDice[1]}
                </span>
                {digitalDice[0] === digitalDice[1] && (
                  <span className="mt-1 px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-400 text-rose-300 text-[9px] font-black uppercase tracking-wider animate-pulse">
                    HARDWAY {digitalDice[0] + digitalDice[1]}
                  </span>
                )}
              </div>
            </div>

            {/* Digital Die 2 */}
            <DigitalDie
              value={digitalDice[1]}
              isRolling={isRolling}
              isLocked={die2Locked}
              label="DIE 2"
            />
          </div>

          {/* Console Footer Status */}
          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>
                {isRolling
                  ? 'Digital randomization cycle active... settling dice.'
                  : 'Place your wagers on the table below and tap ROLL DIGITAL DICE'}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono font-semibold text-slate-400">
              <span>
                POINT: <strong className="text-amber-300">{point !== null ? `ON (${point})` : 'OFF (COME-OUT)'}</strong>
              </span>
              <span>•</span>
              <span>
                ACTIVE WAGERS: <strong className="text-amber-300">{totalCurrentWager} ⭐</strong>
              </span>
            </div>
          </div>

          {/* Roll Settlements Toast Notification */}
          {lastOutcomes && lastOutcomes.length > 0 && (
            <div className="absolute top-4 left-4 z-30 max-w-xs bg-slate-950/95 backdrop-blur-md border border-amber-500/50 rounded-2xl p-3 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-xs">
                <span className="font-extrabold text-amber-400 uppercase tracking-wide">
                  Roll Settlements
                </span>
                <span
                  className={`font-black ${
                    lastPayoutTotal > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {lastPayoutTotal > 0 ? `+${lastPayoutTotal} ⭐` : 'No Win'}
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pr-1">
                {lastOutcomes.map((o, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-slate-300 truncate">{o.name}:</span>
                    <span
                      className={`font-bold ${
                        o.status === 'won'
                          ? 'text-emerald-400'
                          : o.status === 'lost'
                          ? 'text-rose-400 line-through'
                          : o.status === 'pushed'
                          ? 'text-amber-300'
                          : 'text-slate-400 italic'
                      }`}
                    >
                      {o.status === 'won'
                        ? `+${o.payout} ⭐`
                        : o.status === 'lost'
                        ? `-${o.wager} ⭐`
                        : o.status === 'pushed'
                        ? 'Push'
                        : 'Working'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 3D Rolling Dice Craps Pit Canvas */
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-amber-600/40 bg-slate-950">
          {/* Mode Switcher on 3D Canvas */}
          <div className="absolute top-3 left-4 z-20 flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setDiceMode('digital')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-slate-400 hover:text-white"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Digital Dice</span>
            </button>
            <button
              type="button"
              onClick={() => setDiceMode('3d')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>3D Felt</span>
            </button>
          </div>

          {/* Physical 3D Canvas */}
          <canvas
            ref={canvasRef}
            className="w-full h-56 md:h-72 block"
          />

          {/* Table Overlay Status */}
          <div className="absolute bottom-3 left-4 pointer-events-none bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Place your bets and press <strong>ROLL DICE</strong></span>
          </div>

          {/* Current Dice Total Indicator Overlay */}
          <div className="absolute top-4 right-4 pointer-events-none flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-amber-500/40 shadow-xl">
            <div className="text-xs text-slate-400 font-bold uppercase">Last Roll:</div>
            <div className="flex items-center gap-1 font-mono text-base font-extrabold text-amber-300">
              <span>{currentDice[0]}</span>
              <span className="text-slate-500">+</span>
              <span>{currentDice[1]}</span>
              <span className="text-slate-500">=</span>
              <span className="text-xl text-amber-400 ml-1 font-black">
                {currentDice[0] + currentDice[1]}
              </span>
            </div>
          </div>

          {/* Roll Settlements Toast Notification */}
          {lastOutcomes && lastOutcomes.length > 0 && (
            <div className="absolute top-14 left-4 z-30 max-w-xs bg-slate-950/95 backdrop-blur-md border border-amber-500/50 rounded-2xl p-3 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-xs">
                <span className="font-extrabold text-amber-400 uppercase tracking-wide">
                  Roll Settlements
                </span>
                <span
                  className={`font-black ${
                    lastPayoutTotal > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {lastPayoutTotal > 0 ? `+${lastPayoutTotal} ⭐` : 'No Win'}
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pr-1">
                {lastOutcomes.map((o, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-slate-300 truncate">{o.name}:</span>
                    <span
                      className={`font-bold ${
                        o.status === 'won'
                          ? 'text-emerald-400'
                          : o.status === 'lost'
                          ? 'text-rose-400 line-through'
                          : o.status === 'pushed'
                          ? 'text-amber-300'
                          : 'text-slate-400 italic'
                      }`}
                    >
                      {o.status === 'won'
                        ? `+${o.payout} ⭐`
                        : o.status === 'lost'
                        ? `-${o.wager} ⭐`
                        : o.status === 'pushed'
                        ? 'Push'
                        : 'Working'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vegas Craps Table Felt Betting Layout */}
      <div className="bg-gradient-to-b from-[#063b21] via-[#052f1a] to-[#042414] border-4 border-amber-600/70 rounded-3xl p-4 md:p-6 shadow-2xl space-y-4">
        {/* Table Felt Header Plaque */}
        <div className="flex flex-wrap items-center justify-between border-b-2 border-amber-500/40 pb-3 gap-2 text-xs">
          <div className="flex items-center gap-3">
            <img src={hushLogo} alt="Hush Music" className="h-7 w-auto object-contain drop-shadow" />
            <div>
              <div className="font-serif font-black tracking-widest text-amber-400 uppercase text-sm">
                CASINO CRAPS TABLE
              </div>
              <div className="text-[10px] text-emerald-300 font-semibold">
                TABLE MINIMUM: 5 ⭐ • MAX: 10,000 ⭐ • 100% VEGAS RULES
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300 font-bold">Active Wagers:</span>
            <span className="px-3 py-1 bg-amber-500/20 border border-amber-400 text-amber-300 font-extrabold rounded-xl text-sm">
              {totalCurrentWager} ⭐
            </span>
          </div>
        </div>

        {/* 1. TOP SECTION: PLACE BETS & POINT NUMBERS (4, 5, 6, 8, 9, 10) */}
        <div>
          <div className="text-[11px] font-extrabold text-amber-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
            <span>PLACE NUMBERS & PUCK TARGETS</span>
            <span className="text-[10px] text-emerald-300">Tap number box to place wager</span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {[
              { spot: 'place_4' as CrapsBetSpot, num: 4, label: '4', odds: '9:5' },
              { spot: 'place_5' as CrapsBetSpot, num: 5, label: '5', odds: '7:5' },
              { spot: 'place_6' as CrapsBetSpot, num: 6, label: 'SIX', odds: '7:6' },
              { spot: 'place_8' as CrapsBetSpot, num: 8, label: 'EIGHT', odds: '7:6' },
              { spot: 'place_9' as CrapsBetSpot, num: 9, label: '9', odds: '7:5' },
              { spot: 'place_10' as CrapsBetSpot, num: 10, label: '10', odds: '9:5' },
            ].map((box) => {
              const isPointNumber = point === box.num;
              return (
                <button
                  key={box.spot}
                  type="button"
                  disabled={isRolling}
                  onClick={() => handlePlaceBet(box.spot)}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    isPointNumber
                      ? 'bg-amber-950/60 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                      : 'bg-emerald-950/60 border-emerald-500/60 hover:border-amber-400 hover:bg-emerald-900/60'
                  }`}
                >
                  {/* ON PUCK BADGE IF THIS IS THE ACTIVE POINT */}
                  {isPointNumber && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-white text-slate-950 font-black text-xs border-2 border-amber-500 shadow-xl flex items-center justify-center animate-bounce">
                        ON
                      </div>
                    </div>
                  )}

                  {renderChipStack(box.spot)}

                  <span className="text-xl md:text-2xl font-black text-white tracking-wide">
                    {box.label}
                  </span>
                  <span className="text-[10px] text-amber-300 font-bold mt-0.5">
                    Pays {box.odds}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. MIDDLE SECTION: COME, THE FIELD, & HARDWAYS / PROPOSITIONS */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Left Column: COME & DON'T COME BAR (12) (Col 1-4) */}
          <div className="md:col-span-4 flex flex-col gap-2.5">
            {/* COME */}
            <button
              type="button"
              disabled={isRolling}
              onClick={() => handlePlaceBet('come')}
              className="relative flex-1 p-4 rounded-2xl bg-emerald-900/50 border-2 border-emerald-400 hover:border-amber-400 flex flex-col items-center justify-center transition-all active:scale-95 group"
            >
              {renderChipStack('come')}
              <span className="text-xl md:text-2xl font-serif font-black tracking-widest text-amber-300 group-hover:text-amber-200">
                C O M E
              </span>
              <span className="text-[10px] text-emerald-200 mt-0.5 font-semibold">
                Wins 7, 11 • Point on 4-10 (1:1)
              </span>
            </button>

            {/* DON'T COME BAR (12) */}
            <button
              type="button"
              disabled={isRolling}
              onClick={() => handlePlaceBet('dont_come')}
              className="relative p-2.5 rounded-2xl bg-slate-950/60 border border-slate-600 hover:border-amber-400 flex items-center justify-between px-4 transition-all active:scale-95"
            >
              {renderChipStack('dont_come')}
              <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
                DON'T COME BAR ⚅⚅
              </span>
              <span className="text-[10px] text-amber-400 font-semibold">12 Pushes</span>
            </button>
          </div>

          {/* Center Column: THE FIELD (Col 5-8) */}
          <div className="md:col-span-4 flex flex-col">
            <button
              type="button"
              disabled={isRolling}
              onClick={() => handlePlaceBet('field')}
              className="relative flex-1 p-3.5 rounded-2xl bg-gradient-to-b from-emerald-950/80 to-[#07361e] border-2 border-emerald-400 hover:border-amber-400 flex flex-col items-center justify-center transition-all active:scale-95"
            >
              {renderChipStack('field')}

              <span className="text-lg md:text-xl font-black tracking-widest text-white uppercase font-serif">
                THE FIELD
              </span>

              {/* Field Numbers Ribbon */}
              <div className="flex items-center justify-center gap-1.5 my-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/40">
                  2 (2:1)
                </span>
                <span className="text-white font-extrabold text-sm">3</span>
                <span className="text-white font-extrabold text-sm">4</span>
                <span className="text-white font-extrabold text-sm">9</span>
                <span className="text-white font-extrabold text-sm">10</span>
                <span className="text-white font-extrabold text-sm">11</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/40">
                  12 (3:1)
                </span>
              </div>

              <span className="text-[10px] text-emerald-300 font-semibold">
                One Roll Bet • 2 & 12 Pay Extra!
              </span>
            </button>
          </div>

          {/* Right Column: CENTER HARDWAYS & PROPOSITIONS (Col 9-12) */}
          <div className="md:col-span-4 flex flex-col gap-2">
            <div className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider text-center">
              CENTER PROPOSITION BETS
            </div>

            {/* Hardways Grid */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('hard_4')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('hard_4')}
                <span className="text-[11px] font-black text-white">HARD 4 (⚁⚁)</span>
                <span className="text-[9px] text-amber-400 font-semibold">Pays 7:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('hard_6')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('hard_6')}
                <span className="text-[11px] font-black text-white">HARD 6 (⚂⚂)</span>
                <span className="text-[9px] text-amber-400 font-semibold">Pays 9:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('hard_8')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('hard_8')}
                <span className="text-[11px] font-black text-white">HARD 8 (⚃⚃)</span>
                <span className="text-[9px] text-amber-400 font-semibold">Pays 9:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('hard_10')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('hard_10')}
                <span className="text-[11px] font-black text-white">HARD 10 (⚄⚄)</span>
                <span className="text-[9px] text-amber-400 font-semibold">Pays 7:1</span>
              </button>
            </div>

            {/* High-Payout One-Roll Props */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('any_7')}
                className="relative p-1.5 rounded-xl bg-rose-950/60 border border-rose-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('any_7')}
                <span className="text-[10px] font-black text-rose-300">ANY 7</span>
                <span className="text-[9px] text-amber-400 font-semibold">4:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('yo_11')}
                className="relative p-1.5 rounded-xl bg-amber-950/60 border border-amber-600 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('yo_11')}
                <span className="text-[10px] font-black text-amber-300">YO 11</span>
                <span className="text-[9px] text-amber-400 font-semibold">15:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('any_craps')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('any_craps')}
                <span className="text-[10px] font-black text-white">CRAPS</span>
                <span className="text-[9px] text-amber-400 font-semibold">7:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('aces_2')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('aces_2')}
                <span className="text-[10px] font-black text-white">ACES ⚀⚀</span>
                <span className="text-[9px] text-amber-400 font-semibold">30:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('boxcars_12')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('boxcars_12')}
                <span className="text-[10px] font-black text-white">12 ⚅⚅</span>
                <span className="text-[9px] text-amber-400 font-semibold">30:1</span>
              </button>

              <button
                type="button"
                disabled={isRolling}
                onClick={() => handlePlaceBet('ace_deuce_3')}
                className="relative p-1.5 rounded-xl bg-slate-900/60 border border-slate-700 hover:border-amber-400 flex flex-col items-center text-center transition-all active:scale-95"
              >
                {renderChipStack('ace_deuce_3')}
                <span className="text-[10px] font-black text-white">3 ⚀⚁</span>
                <span className="text-[9px] text-amber-400 font-semibold">15:1</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. BOTTOM SECTION: PASS LINE & DON'T PASS BAR */}
        <div className="space-y-2 pt-1">
          {/* DON'T PASS BAR (12) */}
          <button
            type="button"
            disabled={isRolling}
            onClick={() => handlePlaceBet('dont_pass')}
            className="w-full relative py-2.5 px-4 rounded-2xl bg-slate-950/70 border-2 border-slate-600 hover:border-amber-400 flex items-center justify-between text-left transition-all active:scale-98"
          >
            {renderChipStack('dont_pass')}
            <div className="flex items-center gap-2">
              <span className="text-xs md:text-sm font-black text-slate-200 tracking-wider">
                DON'T PASS BAR ⚅⚅
              </span>
              <span className="text-[11px] text-slate-400 font-semibold">
                (Wins 2, 3 • 12 Pushes • 7 in Point Phase • 1:1)
              </span>
            </div>
            <span className="text-xs font-bold text-amber-400">1:1 Return</span>
          </button>

          {/* PASS LINE (ICONIC GOLDEN CURVED BANNER) */}
          <button
            type="button"
            disabled={isRolling}
            onClick={() => handlePlaceBet('pass')}
            className="w-full relative py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-600/30 via-emerald-800/80 to-amber-600/30 border-2 border-amber-400 hover:border-amber-300 shadow-xl flex items-center justify-between text-left transition-all active:scale-98 group"
          >
            {renderChipStack('pass')}
            <div className="flex flex-col">
              <span className="text-lg md:text-2xl font-serif font-black tracking-widest text-amber-300 group-hover:text-amber-200 uppercase drop-shadow">
                P A S S   L I N E
              </span>
              <span className="text-[11px] text-emerald-200 font-semibold mt-0.5">
                Come-Out: 7, 11 Win • 2, 3, 12 Lose | Point Phase: Roll Point to Win!
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-amber-400 bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-500/50">
                PAYS 1:1
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Chip Denominations Selector & Action Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Chip Denominations Tray */}
        <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Chips:
          </span>
          {CHIP_OPTIONS.map((chip) => {
            const isSelected = selectedChip === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => {
                  Sound.click();
                  setSelectedChip(chip.value);
                }}
                className={`w-11 h-11 md:w-12 md:h-12 rounded-full border-2 border-dashed flex items-center justify-center font-black text-xs md:text-sm transition-all transform active:scale-90 shadow-md ${
                  chip.color
                } ${chip.textColor} ${chip.borderColor} ${
                  isSelected
                    ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950 scale-110 -translate-y-1'
                    : 'opacity-80 hover:opacity-100 hover:scale-105'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Quick Table Actions: Clear, Repeat, Double */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isRolling || totalCurrentWager === 0}
            onClick={handleClearBets}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors disabled:opacity-40"
            title="Clear all bets"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            disabled={isRolling || totalCurrentWager === 0}
            onClick={handleDoubleBets}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors disabled:opacity-40"
            title="Double current bets"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>2x</span>
          </button>

          <button
            type="button"
            disabled={isRolling}
            onClick={handleRepeatBets}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors disabled:opacity-40"
            title="Repeat previous bets"
          >
            <RotateCcw className="w-4 h-4 text-emerald-400" />
            <span>Repeat</span>
          </button>

          {/* MAIN BIG ROLL BUTTON */}
          <button
            type="button"
            disabled={isRolling}
            onClick={() => startRoll()}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.5)] transition-all transform active:scale-95 disabled:opacity-50"
          >
            <Dices className={`w-5 h-5 ${isRolling ? 'animate-spin' : ''}`} />
            <span>
              {isRolling
                ? 'ROLLING...'
                : diceMode === 'digital'
                ? 'ROLL DIGITAL DICE'
                : 'ROLL DICE'}
            </span>
          </button>
        </div>
      </div>

      {/* Rules Modal */}
      {rulesOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-base">
                <Dices className="w-5 h-5" />
                <span>Craps Table Rules & Payouts</span>
              </div>
              <button
                type="button"
                onClick={() => setRulesOpen(false)}
                className="text-slate-400 hover:text-white font-black text-lg px-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div>
                <strong className="text-amber-400 block text-sm mb-1">
                  1. The Come-Out Roll (Puck is OFF)
                </strong>
                The shooter rolls the pair of dice. If you bet on the <strong>Pass Line</strong>:
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-300">
                  <li><strong>7 or 11</strong>: Instant WIN (1:1 payout).</li>
                  <li><strong>2, 3, or 12</strong>: Craps! Instant LOSS.</li>
                  <li><strong>4, 5, 6, 8, 9, 10</strong>: Establishes the <strong>POINT</strong>. The puck flips to <strong>ON</strong>!</li>
                </ul>
              </div>

              <div>
                <strong className="text-amber-400 block text-sm mb-1">
                  2. The Point Phase (Puck is ON)
                </strong>
                The shooter rolls until either the Point number is hit again or a 7 rolls:
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-300">
                  <li><strong>Roll the Point</strong>: Pass Line WINS! Puck flips to OFF.</li>
                  <li><strong>Roll a 7 ("Seven Out")</strong>: Pass Line LOSES! Round ends, puck flips to OFF.</li>
                </ul>
              </div>

              <div>
                <strong className="text-amber-400 block text-sm mb-1">
                  3. Key Multi-Bet Payouts
                </strong>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-300">
                  <li><strong>Place 4 & 10</strong>: Pays 9:5</li>
                  <li><strong>Place 5 & 9</strong>: Pays 7:5</li>
                  <li><strong>Place 6 & 8</strong>: Pays 7:6</li>
                  <li><strong>The Field</strong>: 3, 4, 9, 10, 11 (1:1); 2 pays Double (2:1); 12 pays Triple (3:1)</li>
                  <li><strong>Hardways (2-2, 3-3, 4-4, 5-5)</strong>: Pays 7:1 to 9:1</li>
                  <li><strong>Aces (1-1) & Boxcars (6-6)</strong>: Pays 30:1</li>
                  <li><strong>Yo Eleven (11)</strong>: Pays 15:1</li>
                  <li><strong>Any 7</strong>: Pays 4:1</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRulesOpen(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors"
            >
              GOT IT, LET'S ROLL!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
