'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeftRight, Coins, Play, RotateCcw, Trophy, Home as HomeIcon, Zap } from 'lucide-react';
import WalletButton from '@/components/WalletButton';
import SwapModal from '@/components/SwapModal';
import PowerUpShop, { useEthPowerUpPurchase } from '@/components/PowerUpShop';
import {
  POWERUPS,
  EMPTY_INVENTORY,
  type PowerUpId,
  type PowerUpInventory,
} from '@/lib/powerups';

const Game2D = dynamic(() => import('@/components/Game2D'), { ssr: false });

const COINS_STORAGE = 'jumparun:coins';
const INVENTORY_STORAGE = 'jumparun:inventory';
const HIGHSCORE_STORAGE = 'jumparun:highscore';

type View = 'home' | 'playing' | 'gameover';

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [coinBank, setCoinBank] = useState(0);
  const [runCoins, setRunCoins] = useState(0);
  const [inventory, setInventory] = useState<PowerUpInventory>(EMPTY_INVENTORY);
  const [swapOpen, setSwapOpen] = useState(false);

  // Load saved state
  useEffect(() => {
    try {
      const c = Number(localStorage.getItem(COINS_STORAGE) ?? '0');
      if (!Number.isNaN(c)) setCoinBank(c);
      const hs = Number(localStorage.getItem(HIGHSCORE_STORAGE) ?? '0');
      if (!Number.isNaN(hs)) setHighScore(hs);
      const inv = localStorage.getItem(INVENTORY_STORAGE);
      if (inv) setInventory({ ...EMPTY_INVENTORY, ...JSON.parse(inv) });
    } catch {
      /* ignore */
    }
  }, []);

  const persistCoins = useCallback((v: number) => {
    setCoinBank(v);
    try {
      localStorage.setItem(COINS_STORAGE, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const persistInventory = useCallback((inv: PowerUpInventory) => {
    setInventory(inv);
    try {
      localStorage.setItem(INVENTORY_STORAGE, JSON.stringify(inv));
    } catch {
      /* ignore */
    }
  }, []);

  const persistHighScore = useCallback((hs: number) => {
    setHighScore(hs);
    try {
      localStorage.setItem(HIGHSCORE_STORAGE, String(hs));
    } catch {
      /* ignore */
    }
  }, []);

  const handleGameOver = useCallback(
    (finalScore: number, coinsFromRun: number) => {
      const newCoins = coinBank + coinsFromRun;
      persistCoins(newCoins);
      if (finalScore > highScore) persistHighScore(finalScore);
      setView('gameover');
      setPaused(false);
    },
    [coinBank, highScore, persistCoins, persistHighScore],
  );

  const handleScoreUpdate = useCallback((s: number) => setScore(s), []);
  const handleCoinCollected = useCallback((total: number) => setRunCoins(total), []);

  const handleConsumePowerUp = useCallback(
    (id: PowerUpId) => {
      persistInventory({ ...inventory, [id]: Math.max(0, inventory[id] - 1) });
    },
    [inventory, persistInventory],
  );

  const buyWithCoins = useCallback(
    (id: PowerUpId): boolean => {
      const def = POWERUPS[id];
      if (coinBank < def.coinCost) return false;
      persistCoins(coinBank - def.coinCost);
      persistInventory({ ...inventory, [id]: inventory[id] + 1 });
      return true;
    },
    [coinBank, inventory, persistCoins, persistInventory],
  );

  const grantPowerUp = useCallback(
    (id: PowerUpId) => {
      persistInventory({ ...inventory, [id]: inventory[id] + 1 });
    },
    [inventory, persistInventory],
  );

  const { buy: buyWithEth } = useEthPowerUpPurchase(grantPowerUp);

  const startGame = useCallback(() => {
    setScore(0);
    setRunCoins(0);
    setPaused(false);
    setView('playing');
  }, []);

  const goHome = useCallback(() => {
    // Save coins collected in the current run
    if (runCoins > 0) {
      persistCoins(coinBank + runCoins);
      setRunCoins(0);
    }
    if (score > highScore) persistHighScore(score);
    setView('home');
    setPaused(false);
  }, [runCoins, coinBank, persistCoins, score, highScore, persistHighScore]);

  const totalCoinsDisplay = useMemo(
    () => coinBank + (view === 'playing' ? runCoins : 0),
    [coinBank, runCoins, view],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col px-4 pb-10 pt-5">
        {/* Top bar */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="animate-pulse-glow flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                <Zap className="h-5 w-5 text-primary-foreground" fill="currentColor" />
              </div>
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold leading-none tracking-tight">
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                  JUMPARUN
                </span>
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Endless runner · Base chain
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSwapOpen(true)}
              className="group hidden items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 transition-all hover:border-accent/60 hover:bg-accent/20 sm:inline-flex"
            >
              <ArrowLeftRight className="h-4 w-4 text-accent" />
              <span className="font-display text-xs font-bold text-accent">Swap $JUMP</span>
            </button>
            <WalletButton />
          </div>
        </header>

        {/* Stat bar */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <StatChip
            icon={<Trophy className="h-4 w-4 text-primary" />}
            label="Score"
            value={view === 'playing' ? score.toLocaleString() : '—'}
            accent="primary"
          />
          <StatChip
            icon={<Coins className="h-4 w-4 text-accent" />}
            label="Coins"
            value={totalCoinsDisplay.toLocaleString()}
            accent="accent"
          />
          <StatChip
            icon={<Trophy className="h-4 w-4 text-neon-magenta" />}
            label="Best"
            value={highScore.toLocaleString()}
            accent="magenta"
          />
        </div>

        {/* Main content */}
        {view === 'playing' ? (
          <div className="flex flex-col items-center gap-4">
            <Game2D
              isPlaying
              paused={paused}
              inventory={inventory}
              onGameOver={handleGameOver}
              onScoreUpdate={handleScoreUpdate}
              onCoinCollected={handleCoinCollected}
              onConsumePowerUp={handleConsumePowerUp}
              onPause={() => setPaused((p) => !p)}
              onHome={goHome}
            />

            {paused && (
              <div className="glass w-full max-w-[960px] rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">Quick Shop</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPaused(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-display text-xs font-bold text-primary-foreground hover:brightness-110"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </button>
                    <button
                      onClick={goHome}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 font-display text-xs font-bold text-foreground hover:bg-surface-3"
                    >
                      <HomeIcon className="h-3.5 w-3.5" />
                      Home
                    </button>
                  </div>
                </div>
                <PowerUpShop
                  coins={coinBank}
                  inventory={inventory}
                  onBuyWithCoins={buyWithCoins}
                  onBuyWithEth={buyWithEth}
                  compact
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            {/* Hero card */}
            <div className="glass relative overflow-hidden rounded-2xl p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-accent/20 blur-3xl" />

              {view === 'gameover' ? (
                <div className="relative space-y-6">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-destructive" />
                    <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-destructive">
                      Run Ended
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Final score
                    </p>
                    <p className="font-display text-6xl font-black leading-none tracking-tight sm:text-7xl">
                      <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {score.toLocaleString()}
                      </span>
                    </p>
                    {score > 0 && score === highScore && (
                      <p className="mt-2 font-display text-sm font-bold text-accent animate-float">
                        ◆ NEW HIGH SCORE ◆
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Coins this run" value={runCoins.toString()} />
                    <MiniStat label="Bank total" value={coinBank.toString()} />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={startGame}
                      className="neon-glow-cyan inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-6 py-3.5 font-display text-sm font-bold text-primary-foreground transition-all hover:scale-[1.02]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Play Again
                    </button>
                    <button
                      onClick={() => setView('home')}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-5 py-3.5 font-display text-sm font-bold transition-all hover:bg-surface-3"
                    >
                      <HomeIcon className="h-4 w-4" />
                      Home
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative space-y-6">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-neon-green" />
                    <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-neon-green">
                      Ready to run
                    </span>
                  </div>
                  <div>
                    <h2 className="font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl text-balance">
                      Jump. Dash. <span className="text-primary">Survive.</span>
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                      Tap, click or press space to jump. Hold for higher jumps. Collect coins, chain
                      power-ups, and outrun obstacles across the grid.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Tip label="Tap" value="Jump" />
                    <Tip label="Hold" value="Higher" />
                    <Tip label="P" value="Pause" />
                    <Tip label="Shop" value="Buy PU" />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={startGame}
                      className="neon-glow-cyan inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-7 py-4 font-display text-base font-bold text-primary-foreground transition-all hover:scale-[1.02]"
                    >
                      <Play className="h-5 w-5" fill="currentColor" />
                      Start Game
                    </button>

                    <button
                      onClick={() => setSwapOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-5 py-4 font-display text-sm font-bold text-accent transition-all hover:bg-accent/20 sm:hidden"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      Swap $JUMP
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Side: swap promo + shop */}
            <div className="flex flex-col gap-4">
              <button
                onClick={() => setSwapOpen(true)}
                className="group relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 to-primary/10 p-5 text-left transition-all hover:border-accent/60"
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/30 blur-2xl transition-opacity group-hover:opacity-70" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-accent" />
                      <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                        Onchain Trade
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-bold">Swap $JUMP</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Uniswap V3 · ETH ⇄ JUMP on Base
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
                    <ArrowLeftRight className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <div className="relative mt-4 flex items-center gap-2">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-display text-[10px] font-bold text-muted-foreground">
                    BASE
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-display text-[10px] font-bold text-muted-foreground">
                    V3 ROUTER
                  </span>
                </div>
              </button>

              <div className="glass rounded-2xl p-5">
                <PowerUpShop
                  coins={coinBank}
                  inventory={inventory}
                  onBuyWithCoins={buyWithCoins}
                  onBuyWithEth={buyWithEth}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer tip */}
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Powered by Base · $JUMP · 0x9649…f07e
        </p>
      </div>

      <SwapModal open={swapOpen} onOpenChange={setSwapOpen} />
    </main>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'primary' | 'accent' | 'magenta';
}) {
  const ring =
    accent === 'primary'
      ? 'border-primary/20'
      : accent === 'accent'
        ? 'border-accent/20'
        : 'border-neon-magenta/20';
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border ${ring} bg-surface-1/60 px-3 py-2 backdrop-blur-md`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3">
        {icon}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-sm font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Tip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-surface-2 px-2.5 py-2">
      <p className="font-display text-[10px] font-bold uppercase tracking-wider text-primary">
        {label}
      </p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

