'use client';

import { useEffect, useState } from 'react';
import { Shield, Zap, Magnet, Rocket, Hourglass, PlayCircle, Loader2, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { POWERUPS, type PowerUpId, type PowerUpInventory } from '@/lib/powerups';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, type Address } from 'viem';
import { toast } from 'sonner';

// Treasury address that receives JUMP tokens on purchase
const TREASURY: Address = '0xD70d01C73b0C5F3246F2b55CCe5FF1b41842ab5E';
const JUMP_TOKEN: Address = '0x96490973ad8e175c72f6634cf70d95f42a67f07e';
const JUMP_DECIMALS = 18;

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const ICONS: Record<PowerUpId, LucideIcon> = {
  shield: Shield,
  doubleJump: Zap,
  magnet: Magnet,
  rocket: Rocket,
  slowmo: Hourglass,
  autoJump: PlayCircle,
};

const COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'neon-cyan':    { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/30' },
  'neon-amber':   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  'neon-magenta': { bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/30' },
  'neon-green':   { bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30' },
};

interface PowerUpShopProps {
  inventory: PowerUpInventory;
  /** Called after on-chain tx confirms — grants the power-up. */
  onGrantPowerUp: (id: PowerUpId) => void;
}

export default function PowerUpShop({ inventory, onGrantPowerUp }: PowerUpShopProps) {
  const { address } = useAccount();
  // Track which item is currently pending a tx
  const [pendingId, setPendingId] = useState<PowerUpId | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>(undefined);

  const { writeContractAsync } = useWriteContract();

  // Wait for confirmation of the pending tx
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingHash,
  });

  // Once the tx is confirmed, grant the power-up (effect — NOT render-phase).
  useEffect(() => {
    if (isConfirmed && pendingId && pendingHash) {
      const id = pendingId;
      onGrantPowerUp(id);
      setPendingId(null);
      setPendingHash(undefined);
      toast.success(`${POWERUPS[id].short} unlocked!`);
    }
  }, [isConfirmed, pendingId, pendingHash, onGrantPowerUp]);

  const buy = async (id: PowerUpId) => {
    if (!address) { toast.error('Connect your wallet first'); return; }
    if (pendingId) { toast.error('A purchase is already in progress'); return; }

    const def = POWERUPS[id];
    const amount = parseUnits(String(def.cost), JUMP_DECIMALS);

    setPendingId(id);
    try {
        const hash = await writeContractAsync({
        address: JUMP_TOKEN,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [TREASURY, amount],
      });
      setPendingHash(hash as `0x${string}`);
      toast.info(`Waiting for tx…`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setPendingId(null);
      setPendingHash(undefined);
      const msg: string = err?.shortMessage ?? err?.message ?? 'Transaction failed';
      toast.error(msg.slice(0, 80));
    }
  };

  const ids: PowerUpId[] = ['shield', 'doubleJump', 'magnet', 'slowmo', 'autoJump', 'rocket'];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Power-Ups
        </h3>
        <p className="text-[10px] text-muted-foreground">
          {address ? 'Cost is paid in $JUMP · activates after tx confirms' : 'Connect wallet to buy'}
        </p>
      </div>

      {/* 3-col grid — fits without scrolling */}
      <div className="grid grid-cols-3 gap-2">
        {ids.map((id) => {
          const def = POWERUPS[id];
          const Icon = ICONS[id];
          const c = COLOR[def.color] ?? COLOR['neon-cyan'];
          const owned = inventory[id];
          const isBuying = pendingId === id;
          const isTxPending = isBuying && !!pendingHash && isConfirming;

          return (
            <button
              key={id}
              onClick={() => buy(id)}
              disabled={!address || !!pendingId}
              className={`
                relative flex flex-col items-center gap-1.5 rounded-xl border
                ${c.border} bg-surface-2 p-2.5 text-center
                transition-all
                enabled:hover:brightness-110
                disabled:cursor-not-allowed disabled:opacity-50
                ${owned > 0 ? `shadow-[0_0_14px_rgba(6,182,212,0.25)]` : ''}
              `}
              aria-label={`Buy ${def.name} for ${def.cost} JUMP`}
            >
              {/* Owned badge */}
              {owned > 0 && (
                <span className={`absolute right-1 top-1 rounded px-1 py-px font-display text-[8px] font-bold ${c.bg} ${c.text}`}>
                  ×{owned}
                </span>
              )}

              {/* Icon */}
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
                {isBuying ? (
                  isTxPending
                    ? <CheckCircle2 className={`h-4 w-4 ${c.text} animate-pulse`} />
                    : <Loader2 className={`h-4 w-4 ${c.text} animate-spin`} />
                ) : (
                  <Icon className={`h-4 w-4 ${c.text}`} />
                )}
              </div>

              {/* Name */}
              <p className="font-display text-[10px] font-bold leading-tight text-foreground">
                {def.short}
              </p>

              {/* Price chip */}
              <div className={`flex w-full items-center justify-center gap-0.5 rounded-md border ${c.border} ${c.bg} px-1 py-0.5`}>
                <JumpDot small className={c.text} />
                <span className={`font-display text-[9px] font-bold tabular-nums ${c.text}`}>
                  {def.cost.toLocaleString()}
                </span>
              </div>

              {/* Buying state label */}
              {isBuying && (
                <span className="text-[8px] text-muted-foreground">
                  {isTxPending ? 'confirming…' : 'sign tx…'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function JumpDot({
  className = 'text-amber-400',
  small = false,
}: {
  className?: string;
  small?: boolean;
}) {
  const s = small ? 10 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 14 14" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15" />
      <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.35" />
      <text x="7" y="9.5" textAnchor="middle" fontSize="7" fontWeight="900"
        fill="currentColor" fontFamily="ui-sans-serif,system-ui">J</text>
    </svg>
  );
}
