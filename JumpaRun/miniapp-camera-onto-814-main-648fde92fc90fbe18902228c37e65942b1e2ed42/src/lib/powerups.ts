export type PowerUpId = 'shield' | 'doubleJump' | 'magnet' | 'rocket' | 'slowmo' | 'autoJump';

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  short: string;
  description: string;
  /** Cost in in-game coins */
  coinCost: number;
  /** Optional ETH cost (premium) */
  ethCost?: string;
  /** Emoji/icon letter for canvas HUD */
  symbol: string;
  /** Tailwind token color */
  color: string; // 'neon-cyan' | 'neon-amber' | ...
  /** Duration in seconds (if timed), else undefined */
  durationSec?: number;
  /** Charges (if uses-based) */
  charges?: number;
}

export const POWERUPS: Record<PowerUpId, PowerUpDef> = {
  shield: {
    id: 'shield',
    name: 'Energy Shield',
    short: 'Shield',
    description: 'Absorbs one hit. Explodes on impact to clear nearby obstacles.',
    coinCost: 50,
    symbol: 'S',
    color: 'neon-cyan',
    charges: 1,
  },
  doubleJump: {
    id: 'doubleJump',
    name: 'Double Jump',
    short: '2x Jump',
    description: 'Enables a second mid-air jump for the next 10 jumps.',
    coinCost: 40,
    symbol: '2',
    color: 'neon-green',
    charges: 10,
  },
  magnet: {
    id: 'magnet',
    name: 'Coin Magnet',
    short: 'Magnet',
    description: 'Pulls nearby coins to you for 12 seconds.',
    coinCost: 60,
    symbol: 'M',
    color: 'neon-magenta',
    durationSec: 12,
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Boost',
    short: 'Rocket',
    description: 'Invincible blast through everything for 5 seconds. 2x score.',
    coinCost: 120,
    ethCost: '0.00002',
    symbol: 'R',
    color: 'neon-amber',
    durationSec: 5,
  },
  slowmo: {
    id: 'slowmo',
    name: 'Slow Motion',
    short: 'Slow',
    description: 'Slows obstacles to half speed for 8 seconds.',
    coinCost: 80,
    symbol: 'T',
    color: 'neon-cyan',
    durationSec: 8,
  },
  autoJump: {
    id: 'autoJump',
    name: 'Auto Jump',
    short: 'Auto',
    description: 'Automatically jumps over the next 10 obstacles.',
    coinCost: 100,
    ethCost: '0.00001',
    symbol: 'A',
    color: 'neon-green',
    charges: 10,
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
