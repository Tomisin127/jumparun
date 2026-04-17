'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createPublicClient,
  http,
  fallback,
  encodeFunctionData,
  decodeFunctionResult,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'wagmi/chains';
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArrowDownUp, Loader2, Settings2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { BASE_RPC_URLS } from '@/lib/wagmi';

// Contracts on Base
const JUMP_TOKEN: Address = '0x96490973ad8e175c72f6634cf70d95f42a67f07e';
const WETH: Address = '0x4200000000000000000000000000000000000006';
const QUOTER_V2: Address = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const SWAP_ROUTER: Address = '0x2626664c2603336E57B271c5C0b26F421741e481';

const POOL_FEES = [10000, 3000, 500, 100] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
  {
    name: 'unwrapWETH9',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: fallback(BASE_RPC_URLS.map((u) => http(u))),
});

type Mode = 'buy' | 'sell';

interface SwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SwapModal({ open, onOpenChange }: SwapModalProps) {
  const { address, isConnected } = useAccount();

  const [mode, setMode] = useState<Mode>('buy');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippage, setSlippage] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [bestFee, setBestFee] = useState<number>(10000);

  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [tokenSymbol, setTokenSymbol] = useState('JUMP');

  const { sendTransactionAsync, data: txHash, reset: resetTx } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [submitting, setSubmitting] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenIn = mode === 'buy' ? WETH : JUMP_TOKEN;
  const tokenOut = mode === 'buy' ? JUMP_TOKEN : WETH;
  const decimalsIn = 18;
  const decimalsOut = 18;

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [eth, tok, allow, sym] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.readContract({
          address: JUMP_TOKEN,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: JUMP_TOKEN,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, SWAP_ROUTER],
        }),
        publicClient
          .readContract({
            address: JUMP_TOKEN,
            abi: ERC20_ABI,
            functionName: 'symbol',
          })
          .catch(() => 'JUMP'),
      ]);
      setEthBalance(eth);
      setTokenBalance(tok);
      setAllowance(allow);
      setTokenSymbol(sym);
    } catch (err) {
      console.log('[v0] refreshBalances error', err);
    }
  }, [address]);

  useEffect(() => {
    if (!open) return;
    refreshBalances();
    const id = setInterval(refreshBalances, 10000);
    return () => clearInterval(id);
  }, [open, refreshBalances]);

  // Quoting with RPC fallback + parallel fee tiers
  const getQuote = useCallback(
    async (amount: string) => {
      if (!amount || Number(amount) <= 0) {
        setAmountOut('');
        return;
      }
      setQuoting(true);
      try {
        const amountInWei = parseUnits(amount, decimalsIn);

        const results = await Promise.all(
          POOL_FEES.map(async (fee) => {
            try {
              const data = encodeFunctionData({
                abi: QUOTER_ABI,
                functionName: 'quoteExactInputSingle',
                args: [
                  {
                    tokenIn,
                    tokenOut,
                    amountIn: amountInWei,
                    fee,
                    sqrtPriceLimitX96: 0n,
                  },
                ],
              });
              const res = await publicClient.call({ to: QUOTER_V2, data });
              if (!res.data) return null;
              const decoded = decodeFunctionResult({
                abi: QUOTER_ABI,
                functionName: 'quoteExactInputSingle',
                data: res.data as Hex,
              }) as readonly [bigint, bigint, number, bigint];
              return { fee, amountOut: decoded[0] };
            } catch {
              return null;
            }
          }),
        );

        const valid = results.filter(
          (r): r is { fee: number; amountOut: bigint } => r !== null && r.amountOut > 0n,
        );
        if (valid.length === 0) {
          setAmountOut('');
          return;
        }

        const best = valid.reduce((a, b) => (a.amountOut > b.amountOut ? a : b));
        setBestFee(best.fee);
        setAmountOut(formatUnits(best.amountOut, decimalsOut));
      } catch (err) {
        console.log('[v0] quote error', err);
        setAmountOut('');
      } finally {
        setQuoting(false);
      }
    },
    [tokenIn, tokenOut],
  );

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!amountIn) {
      setAmountOut('');
      return;
    }
    quoteTimer.current = setTimeout(() => {
      getQuote(amountIn);
    }, 500);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [amountIn, getQuote]);

  // Check approval need
  useEffect(() => {
    if (mode === 'sell' && amountIn) {
      try {
        const wei = parseUnits(amountIn, decimalsIn);
        setNeedsApproval(allowance < wei);
      } catch {
        setNeedsApproval(false);
      }
    } else {
      setNeedsApproval(false);
    }
  }, [mode, amountIn, allowance]);

  const insufficient = useMemo(() => {
    if (!amountIn) return false;
    try {
      const wei = parseUnits(amountIn, decimalsIn);
      return mode === 'buy' ? wei > ethBalance : wei > tokenBalance;
    } catch {
      return false;
    }
  }, [amountIn, mode, ethBalance, tokenBalance]);

  const handleMax = () => {
    if (mode === 'buy') {
      // 90% of ETH to reserve gas
      const nine = (ethBalance * 90n) / 100n;
      setAmountIn(formatEther(nine));
    } else {
      setAmountIn(formatUnits(tokenBalance, decimalsIn));
    }
  };

  const flipMode = () => {
    setMode((m) => (m === 'buy' ? 'sell' : 'buy'));
    setAmountIn('');
    setAmountOut('');
  };

  const approve = async () => {
    if (!address) return;
    setSubmitting(true);
    try {
      const max = parseUnits('1000000000', decimalsIn);
      const hash = await writeContractAsync({
        address: JUMP_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ROUTER, max],
      });
      toast.success('Approval submitted', {
        description: `${hash.slice(0, 10)}…`,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`${tokenSymbol} approved for swapping`);
      await refreshBalances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const swap = async () => {
    if (!address || !amountIn || !amountOut) return;
    setSubmitting(true);
    try {
      const amountInWei = parseUnits(amountIn, decimalsIn);
      const quotedOut = parseUnits(amountOut, decimalsOut);
      const minOut = (quotedOut * BigInt(Math.floor((100 - slippage) * 100))) / 10000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

      if (mode === 'buy') {
        // ETH -> TOKEN via multicall(exactInputSingle)
        const swapCall = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: WETH,
              tokenOut: JUMP_TOKEN,
              fee: bestFee,
              recipient: address,
              amountIn: amountInWei,
              amountOutMinimum: minOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const data = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapCall]],
        });
        await sendTransactionAsync({
          to: SWAP_ROUTER,
          value: amountInWei,
          data,
          chainId: base.id,
        });
      } else {
        // TOKEN -> ETH via multicall(exactInputSingle(to=router), unwrapWETH9(to=user))
        const swapCall = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: JUMP_TOKEN,
              tokenOut: WETH,
              fee: bestFee,
              recipient: SWAP_ROUTER,
              amountIn: amountInWei,
              amountOutMinimum: minOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const unwrap = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'unwrapWETH9',
          args: [minOut, address],
        });
        const data = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapCall, unwrap]],
        });
        await sendTransactionAsync({
          to: SWAP_ROUTER,
          data,
          chainId: base.id,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      toast.error(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (isConfirmed && txHash && submitting) {
      toast.success('Swap confirmed!', {
        description: 'Your trade is on-chain.',
      });
      setSubmitting(false);
      setAmountIn('');
      setAmountOut('');
      refreshBalances();
      resetTx();
    }
  }, [isConfirmed, txHash, submitting, refreshBalances, resetTx]);

  const disabled = !isConnected || !amountIn || !amountOut || insufficient || submitting || isConfirming;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-primary/20 p-0 sm:max-w-md">
        <div className="relative overflow-hidden rounded-lg">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />

          <div className="relative p-5">
            <DialogHeader className="mb-4 flex flex-row items-center justify-between space-y-0">
              <div>
                <DialogTitle className="font-display text-xl font-bold tracking-tight">
                  Swap <span className="text-primary">$JUMP</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Uniswap V3 · Base chain
                </DialogDescription>
              </div>
              <button
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-primary"
                aria-label="Settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </DialogHeader>

            {showSettings && (
              <div className="mb-4 rounded-xl border border-primary/15 bg-surface-2 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Slippage tolerance
                </p>
                <div className="flex gap-2">
                  {[1, 3, 5, 10].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        slippage === s
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-3 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* From */}
            <div className="rounded-2xl border border-primary/15 bg-surface-2 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">From</span>
                <span>
                  Balance:{' '}
                  <button
                    onClick={handleMax}
                    className="font-semibold text-primary hover:underline"
                  >
                    {mode === 'buy'
                      ? formatEther(ethBalance).slice(0, 8)
                      : formatUnits(tokenBalance, decimalsIn).slice(0, 8)}{' '}
                    {mode === 'buy' ? 'ETH' : tokenSymbol}
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '.');
                    if (/^\d*\.?\d*$/.test(v)) setAmountIn(v);
                  }}
                  className="w-full bg-transparent font-display text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40"
                />
                <div className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2">
                  <div
                    className={`h-5 w-5 rounded-full ${
                      mode === 'buy'
                        ? 'bg-gradient-to-br from-white to-zinc-300'
                        : 'bg-gradient-to-br from-primary to-accent'
                    }`}
                  />
                  <span className="font-display text-sm font-bold">
                    {mode === 'buy' ? 'ETH' : tokenSymbol}
                  </span>
                </div>
              </div>
            </div>

            {/* Flip */}
            <div className="relative z-10 flex justify-center" style={{ margin: '-12px 0' }}>
              <button
                onClick={flipMode}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-surface-1 text-primary transition-all hover:rotate-180 hover:bg-primary hover:text-primary-foreground"
                aria-label="Flip"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            {/* To */}
            <div className="rounded-2xl border border-primary/15 bg-surface-2 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">To</span>
                <span>
                  Balance:{' '}
                  {mode === 'buy'
                    ? formatUnits(tokenBalance, decimalsIn).slice(0, 8)
                    : formatEther(ethBalance).slice(0, 8)}{' '}
                  {mode === 'buy' ? tokenSymbol : 'ETH'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-display text-3xl font-bold text-foreground">
                  {quoting ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                  ) : amountOut ? (
                    Number(amountOut).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })
                  ) : (
                    <span className="text-muted-foreground/40">0.0</span>
                  )}
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2">
                  <div
                    className={`h-5 w-5 rounded-full ${
                      mode === 'buy'
                        ? 'bg-gradient-to-br from-primary to-accent'
                        : 'bg-gradient-to-br from-white to-zinc-300'
                    }`}
                  />
                  <span className="font-display text-sm font-bold">
                    {mode === 'buy' ? tokenSymbol : 'ETH'}
                  </span>
                </div>
              </div>
            </div>

            {/* Route info */}
            {amountOut && !quoting && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Fee tier: <span className="text-foreground">{bestFee / 10000}%</span>
                </span>
                <span>
                  Slippage: <span className="text-foreground">{slippage}%</span>
                </span>
              </div>
            )}

            {/* Action */}
            <div className="mt-4">
              {!isConnected ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-surface-3 py-4 font-display text-sm font-bold text-muted-foreground"
                >
                  Connect wallet to swap
                </button>
              ) : insufficient ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-destructive/20 py-4 font-display text-sm font-bold text-destructive"
                >
                  Insufficient balance
                </button>
              ) : needsApproval ? (
                <button
                  onClick={approve}
                  disabled={submitting}
                  className="neon-glow-cyan w-full rounded-xl bg-accent py-4 font-display text-sm font-bold text-accent-foreground transition-all hover:scale-[1.01] disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Approving…
                    </span>
                  ) : (
                    `Approve ${tokenSymbol}`
                  )}
                </button>
              ) : (
                <button
                  onClick={swap}
                  disabled={disabled}
                  className="neon-glow-cyan w-full rounded-xl bg-gradient-to-r from-primary to-accent py-4 font-display text-sm font-bold text-primary-foreground transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                >
                  {submitting || isConfirming ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isConfirming ? 'Confirming…' : 'Swapping…'}
                    </span>
                  ) : mode === 'buy' ? (
                    `Buy ${tokenSymbol}`
                  ) : (
                    `Sell ${tokenSymbol}`
                  )}
                </button>
              )}

              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
                >
                  View on BaseScan <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <p className="mt-4 text-center text-[10px] text-muted-foreground">
              Token: {JUMP_TOKEN.slice(0, 10)}…{JUMP_TOKEN.slice(-6)}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
