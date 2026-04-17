export type PowerUpId = 'shield' | 'doubleJump' | 'magnet' | 'rocket' | 'slowmo' | 'autoJump';

export type PowerUpKind = 'passive' | 'timed' | 'charges';

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  short: string;
  description: string;
  /** Cost in JUMP tokens */
  cost: number;
  /** Emoji/icon letter for canvas HUD */
  symbol: string;
  /** Tailwind token color */
  color: string;
  /** Duration in seconds (if timed), else undefined */
  durationSec?: number;
  /** Charges (if uses-based) */
  charges?: number;
  /** How the power-up behaves */
  kind: PowerUpKind;
}

export const POWERUPS: Record<PowerUpId, PowerUpDef> = {
  shield: {
    id: 'shield',
    name: 'Shield',
    short: 'Shield',
    description: 'Absorbs one hit.',
    cost: 500,
    symbol: 'S',
    color: 'neon-cyan',
    charges: 1,
    kind: 'passive',
  },
  doubleJump: {
    id: 'doubleJump',
    name: 'Double Jump',
    short: '2x Jump',
    description: 'Jump again in mid-air.',
    cost: 600,
    symbol: '2',
    color: 'neon-green',
    charges: 10,
    kind: 'charges',
  },
  magnet: {
    id: 'magnet',
    name: 'Magnet',
    short: 'Magnet',
    description: 'Pulls JUMP tokens for 12s.',
    cost: 700,
    symbol: 'M',
    color: 'neon-magenta',
    durationSec: 12,
    kind: 'timed',
  },
  slowmo: {
    id: 'slowmo',
    name: 'Slow Motion',
    short: 'Slow',
    description: 'Halves obstacle speed for 8s.',
    cost: 800,
    symbol: 'T',
    color: 'neon-cyan',
    durationSec: 8,
    kind: 'timed',
  },
  autoJump: {
    id: 'autoJump',
    name: 'Auto Jump',
    short: 'Auto',
    description: 'Auto-jumps 10 obstacles.',
    cost: 1000,
    symbol: 'A',
    color: 'neon-green',
    charges: 10,
    kind: 'charges',
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket',
    short: 'Rocket',
    description: 'Invincible boost for 5s.',
    cost: 1500,
    symbol: 'R',
    color: 'neon-amber',
    durationSec: 5,
    kind: 'timed',
  },
};

export interface PowerUpInventory {
  shield: number;
  doubleJump: number;
  magnet: number;
  rocket: number;
  slowmo: number;
  autoJump: number;
}

export const EMPTY_INVENTORY: PowerUpInventory = {
  shield: 0,
  doubleJump: 0,
  magnet: 0,
  rocket: 0,
  slowmo: 0,
  autoJump: 0,
};

/** Purchase order — timed power-ups activate in this sequence during a run. */
export const DEFAULT_QUEUE: PowerUpId[] = [
  'shield',
  'doubleJump',
  'magnet',
  'slowmo',
  'rocket',
  'autoJump',
];
