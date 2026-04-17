'use client';

import {
  Shield,
  Zap,
  Magnet,
  Rocket,
  Hourglass,
  PlayCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { POWERUPS, type PowerUpId, type PowerUpInventory } from '@/lib/powerups';
import { toast } from 'sonner';

const ICONS: Record<PowerUpId, LucideIcon> = {
  shield: Shield,
  doubleJump: Zap,
  magnet: Magnet,
  rocket: Rocket,
  slowmo: Hourglass,
  autoJump: PlayCircle,
};

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  'neon-cyan': {
    bg: 'bg-neon-cyan/10',
    text: 'text-neon-cyan',
    border: 'border-neon-cyan/30',
    glow: 'shadow-[0_0_18px_hsl(190_95%_50%/0.4)]',
  },
  'neon-amber': {
    bg: 'bg-neon-amber/10',
    text: 'text-neon-amber',
    border: 'border-neon-amber/30',
    glow: 'shadow-[0_0_18px_hsl(35_95%_58%/0.4)]',
  },
  'neon-magenta': {
    bg: 'bg-neon-magenta/10',
    text: 'text-neon-magenta',
    border: 'border-neon-magenta/30',
    glow: 'shadow-[0_0_18px_hsl(320_90%_60%/0.4)]',
  },
  'neon-green': {
    bg: 'bg-neon-green/10',
    text: 'text-neon-green',
    border: 'border-neon-green/30',
    glow: 'shadow-[0_0_18px_hsl(145_70%_50%/0.4)]',
  },
};

interface PowerUpShopProps {
  balance: number;
  inventory: PowerUpInventory;
  onBuy: (id: PowerUpId) => boolean;
}

export default function PowerUpShop({ balance, inventory, onBuy }: PowerUpShopProps) {
  const ids: PowerUpId[] = ['shield', 'doubleJump', 'magnet', 'slowmo', 'autoJump', 'rocket'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
            Power-Ups
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Spend $JUMP · queued in order bought
          </p>
        </div>
        <JumpBalancePill balance={balance} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ids.map((id) => {
          const p = POWERUPS[id];
          const Icon = ICONS[id];
          const c = COLOR_CLASSES[p.color];
          const owned = inventory[id];
          const canAfford = balance >= p.cost;

          return (
            <button
              key={id}
              onClick={() => {
                const ok = onBuy(id);
                if (!ok) toast.error('Not enough $JUMP');
                else toast.success(`${p.short} equipped`);
              }}
              disabled={!canAfford}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border ${c.border} bg-surface-2 p-2.5 text-center transition-all enabled:hover:border-opacity-70 enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                owned > 0 ? c.glow : ''
              }`}
              aria-label={`Buy ${p.name} for ${p.cost} JUMP`}
            >
              {owned > 0 && (
                <span
                  className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 font-display text-[9px] font-bold ${c.bg} ${c.text}`}
                >
                  ×{owned}
                </span>
              )}
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg}`}>
                <Icon className={`h-4.5 w-4.5 ${c.text}`} />
              </div>
              <h4 className="font-display text-[11px] font-bold leading-tight text-foreground">
                {p.short}
              </h4>
              <div
                className={`flex w-full items-center justify-center gap-1 rounded-md border ${c.border} ${c.bg} px-1.5 py-0.5`}
              >
                <JumpDot small className={c.text} />
                <span className={`font-display text-[10px] font-bold tabular-nums ${c.text}`}>
                  {p.cost}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JumpBalancePill({ balance }: { balance: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-neon-amber/30 bg-neon-amber/10 px-3 py-1">
      <JumpDot className="text-neon-amber" />
      <span className="font-display text-sm font-bold tabular-nums text-neon-amber">
        {balance.toLocaleString()}
      </span>
    </div>
  );
}

export function JumpDot({
  className = 'text-neon-amber',
  small = false,
}: {
  className?: string;
  small?: boolean;
}) {
  const size = small ? 10 : 14;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15" />
      <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.35" />
      <text
        x="7"
        y="9.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="900"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui"
      >
        J
      </text>
    </svg>
  );
}
