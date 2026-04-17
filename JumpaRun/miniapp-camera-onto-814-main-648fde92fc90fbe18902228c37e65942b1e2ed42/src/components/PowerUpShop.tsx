'use client';

import { useState } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, type Address } from 'viem';
import {
  Shield,
  Zap,
  Magnet,
  Rocket,
  Hourglass,
  PlayCircle,
  Coins,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { POWERUPS, type PowerUpId, type PowerUpInventory } from '@/lib/powerups';
import { toast } from 'sonner';

const GAME_RECIPIENT: Address = '0xAc6a5B8054A864Caa71A766B0a18A7382367a798';

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
    glow: 'shadow-[0_0_20px_hsl(190_95%_50%/0.35)]',
  },
  'neon-amber': {
    bg: 'bg-neon-amber/10',
    text: 'text-neon-amber',
    border: 'border-neon-amber/30',
    glow: 'shadow-[0_0_20px_hsl(35_95%_58%/0.35)]',
  },
  'neon-magenta': {
    bg: 'bg-neon-magenta/10',
    text: 'text-neon-magenta',
    border: 'border-neon-magenta/30',
    glow: 'shadow-[0_0_20px_hsl(320_90%_60%/0.35)]',
  },
  'neon-green': {
    bg: 'bg-neon-green/10',
    text: 'text-neon-green',
    border: 'border-neon-green/30',
    glow: 'shadow-[0_0_20px_hsl(145_70%_50%/0.35)]',
  },
};

interface PowerUpShopProps {
  coins: number;
  inventory: PowerUpInventory;
  onBuyWithCoins: (id: PowerUpId) => boolean;
  onBuyWithEth: (id: PowerUpId) => void;
  compact?: boolean;
}

export default function PowerUpShop({
  coins,
  inventory,
  onBuyWithCoins,
  onBuyWithEth,
  compact = false,
}: PowerUpShopProps) {
  const ids: PowerUpId[] = ['shield', 'doubleJump', 'magnet', 'slowmo', 'autoJump', 'rocket'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Power-Up Lab
        </h3>
        <div className="flex items-center gap-1.5 rounded-full border border-neon-amber/30 bg-neon-amber/10 px-3 py-1">
          <Coins className="h-3.5 w-3.5 text-neon-amber" />
          <span className="font-display text-sm font-bold text-neon-amber">{coins}</span>
        </div>
      </div>

      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
        {ids.map((id) => {
          const p = POWERUPS[id];
          const Icon = ICONS[id];
          const c = COLOR_CLASSES[p.color];
          const owned = inventory[id];
          const canAfford = coins >= p.coinCost;

          return (
            <div
              key={id}
              className={`group relative rounded-xl border ${c.border} bg-surface-2 p-3 transition-all hover:border-opacity-60 ${
                owned > 0 ? c.glow : ''
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg}`}>
                  <Icon className={`h-5 w-5 ${c.text}`} />
                </div>
                {owned > 0 && (
                  <span
                    className={`rounded-md px-2 py-0.5 font-display text-[10px] font-bold ${c.bg} ${c.text}`}
                  >
                    ×{owned}
                  </span>
                )}
              </div>
              <h4 className="font-display text-sm font-bold text-foreground">{p.name}</h4>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                {p.description}
              </p>

              <div className="mt-3 flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const ok = onBuyWithCoins(id);
                    if (!ok) toast.error('Not enough coins');
                    else toast.success(`${p.short} equipped`);
                  }}
                  disabled={!canAfford}
                  className={`flex-1 rounded-lg border ${c.border} ${c.bg} py-1.5 font-display text-[11px] font-bold ${c.text} transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {p.coinCost} ◈
                </button>
                {p.ethCost && (
                  <button
                    onClick={() => onBuyWithEth(id)}
                    className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 font-display text-[10px] font-bold text-primary transition-all hover:bg-primary/20"
                    title={`Buy with ${p.ethCost} ETH`}
                  >
                    ETH
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Hook to buy power-ups with ETH (bundles transaction + award)
export function useEthPowerUpPurchase(onGranted: (id: PowerUpId) => void) {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const [pending, setPending] = useState<PowerUpId | null>(null);

  const buy = async (id: PowerUpId) => {
    const p = POWERUPS[id];
    if (!p.ethCost) return;
    if (!isConnected || !address) {
      toast.error('Connect your wallet first');
      return;
    }
    setPending(id);
    try {
      const hash = await sendTransactionAsync({
        to: GAME_RECIPIENT,
        value: parseEther(p.ethCost),
      });
      toast.success(`${p.name} purchased`, {
        description: `Tx ${hash.slice(0, 10)}…`,
      });
      onGranted(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Purchase failed';
      toast.error(msg.length > 100 ? msg.slice(0, 100) + '…' : msg);
    } finally {
      setPending(null);
    }
  };

  return { buy, pending };
}
