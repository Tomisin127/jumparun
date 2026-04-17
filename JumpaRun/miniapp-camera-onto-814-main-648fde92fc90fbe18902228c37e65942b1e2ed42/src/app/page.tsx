'use client'
import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseEther } from 'viem';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Address } from 'viem';
import { sdk } from "@farcaster/miniapp-sdk";
import { useAddMiniApp } from "@/hooks/useAddMiniApp";
import { useQuickAuth } from "@/hooks/useQuickAuth";
import { useIsInFarcaster } from "@/hooks/useIsInFarcaster";

const Game2D = dynamic(() => import('@/components/Game2D'), { ssr: false });

const GAME_RECIPIENT: Address = '0xAc6a5B8054A864Caa71A766B0a18A7382367a798';
const POWER_UP_COST = '0.00001';

export default function Home() {
    const { addMiniApp } = useAddMiniApp();
    const isInFarcaster = useIsInFarcaster()
    useQuickAuth(isInFarcaster)
    useEffect(() => {
      const tryAddMiniApp = async () => {
        try {
          await addMiniApp()
        } catch (error) {
          console.error('Failed to add mini app:', error)
        }

      }

    

      tryAddMiniApp()
    }, [addMiniApp])
    useEffect(() => {
      const initializeFarcaster = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 100))
          
          if (document.readyState !== 'complete') {
            await new Promise<void>(resolve => {
              if (document.readyState === 'complete') {
                resolve()
              } else {
                window.addEventListener('load', () => resolve(), { once: true })
              }

            })
          }

    

          await sdk.actions.ready()
          console.log('Farcaster SDK initialized successfully - app fully loaded')
        } catch (error) {
          console.error('Failed to initialize Farcaster SDK:', error)
          
          setTimeout(async () => {
            try {
              await sdk.actions.ready()
              console.log('Farcaster SDK initialized on retry')
            } catch (retryError) {
              console.error('Farcaster SDK retry failed:', retryError)
            }

          }, 1000)
        }

      }

    

      initializeFarcaster()
    }, [])
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [autoJumpActive, setAutoJumpActive] = useState<boolean>(false);
  const [autoJumpRemaining, setAutoJumpRemaining] = useState<number>(0);
  const processedTxHash = useRef<string | null>(null);
  const [showGameOver, setShowGameOver] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({
    address: address,
  });
  const { sendTransaction, data: hash, error } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const handleGameOver = useCallback((finalScore: number) => {
    setIsPlaying(false);
    setShowGameOver(true);
    if (finalScore > highScore) {
      setHighScore(finalScore);
    }
  }, [highScore]);

  const handleScoreUpdate = useCallback((currentScore: number) => {
    setScore(currentScore);
  }, []);

  const handleAutoJumpExpired = useCallback(() => {
    setAutoJumpActive(false);
    setAutoJumpRemaining(0);
  }, []);

  const handleAutoJumpUsed = useCallback(() => {
    setAutoJumpRemaining(prev => {
      const newRemaining = Math.max(0, prev - 1);
      return newRemaining;
    });
  }, []);

  const startGame = (): void => {
    setIsPlaying(true);
    setScore(0);
    setShowGameOver(false);
  };

  const purchasePowerUp = async (): Promise<void> => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    // Check balance before attempting purchase
    if (!balance || balance.value < parseEther(POWER_UP_COST)) {
      const requiredETH = POWER_UP_COST;
      const currentETH = balance ? (Number(balance.value) / 1e18).toFixed(6) : '0';
      alert(`Insufficient balance!\n\nRequired: ${requiredETH} ETH\nYour balance: ${currentETH} ETH\n\nPlease add more ETH to your wallet on Base network.`);
      return;
    }

    setIsPurchasing(true);

    try {
      sendTransaction({
        to: GAME_RECIPIENT,
        value: parseEther(POWER_UP_COST),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      console.error('Purchase error:', errorMessage);
      alert(`Purchase failed: ${errorMessage}`);
      setIsPurchasing(false);
    }
  };

  // Handle transaction confirmation - only trigger once per transaction
  useEffect(() => {
    if (isConfirmed && hash && processedTxHash.current !== hash) {
      processedTxHash.current = hash; // Mark this transaction as processed
      setAutoJumpActive(true);
      setAutoJumpRemaining(10);
      setIsPurchasing(false);
      alert('Auto-Jump Power-Up Activated! 🚀\n10 auto-jumps ready!');
    }
  }, [isConfirmed, hash]);

  // Handle transaction errors
  useEffect(() => {
    if (error && isPurchasing) {
      console.error('Transaction error:', error);
      alert(`Transaction failed: ${error.message}`);
      setIsPurchasing(false);
    }
  }, [error, isPurchasing]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center p-4 pt-16">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="text-center sm:text-left">
            <h1 className="text-5xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">jumparun</h1>
            <p className="text-sm text-gray-600 font-medium">Powered by Base ⚡</p>
          </div>
          <ConnectWallet />
        </div>

        <Card className="bg-white/95 backdrop-blur-md shadow-2xl border-2 border-blue-200">
          <CardContent className="p-8 space-y-6">
            <div className="flex justify-between items-center bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</p>
                <p className="text-4xl font-black text-blue-600 tabular-nums">{score}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">High Score</p>
                <p className="text-4xl font-black text-purple-600 tabular-nums">{highScore}</p>
              </div>
            </div>

            <div className="flex justify-center">
              {isPlaying ? (
                <Game2D
                  isPlaying={isPlaying}
                  autoJumpActive={autoJumpActive}
                  autoJumpRemaining={autoJumpRemaining}
                  onGameOver={handleGameOver}
                  onScoreUpdate={handleScoreUpdate}
                  onAutoJumpExpired={handleAutoJumpExpired}
                  onAutoJumpUsed={handleAutoJumpUsed}
                />
              ) : (
                <div className="w-full max-w-[800px] h-[400px] border-4 border-blue-600 rounded-xl shadow-2xl bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-purple-400/10 animate-pulse"></div>
                  <div className="text-center space-y-6 p-8 relative z-10">
                    {showGameOver ? (
                      <>
                        <h2 className="text-5xl font-black text-gray-900 mb-4">Game Over!</h2>
                        <div className="bg-white/80 rounded-xl p-6 backdrop-blur-sm border-2 border-blue-200">
                          <p className="text-xl text-gray-600 mb-2">Final Score</p>
                          <p className="text-6xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{score}</p>
                        </div>
                        {score === highScore && score > 0 && (
                          <p className="text-2xl text-purple-600 font-bold animate-bounce">🎉 New High Score! 🎉</p>
                        )}
                      </>
                    ) : (
                      <>
                        <h2 className="text-4xl font-black text-gray-900 mb-2">Ready to Jump?</h2>
                        <p className="text-lg text-gray-600 mb-4">🎮 Tap anywhere to jump over obstacles!</p>
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4">
                          <p className="text-sm text-blue-600 font-semibold">⚡ Tip: Time your jumps perfectly to survive!</p>
                        </div>
                      </>
                    )}
                    <Button 
                      onClick={startGame}
                      size="lg"
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-black py-6 px-16 text-2xl rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
                    >
                      {showGameOver ? '🔄 Play Again' : '🚀 Start Game'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t-2 border-blue-100 pt-6">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-xl p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-left">
                    <h3 className="text-xl font-black text-gray-900 mb-2">
                      ⚡ Auto-Jump Power-Up
                    </h3>
                    <p className="text-sm font-semibold text-gray-700">
                      {autoJumpActive 
                        ? `✅ Active - ${autoJumpRemaining} jumps remaining` 
                        : '🎯 Automatically jump over obstacles'}
                    </p>
                    {autoJumpActive && (
                      <p className="text-xs text-gray-600 mt-1">
                        💡 Expires after {autoJumpRemaining} auto-jumps
                      </p>
                    )}
                    <p className="text-xs font-bold text-orange-600 mt-2 bg-white/50 rounded px-2 py-1 inline-block">
                      💎 Cost: {POWER_UP_COST} ETH on Base
                    </p>
                  </div>
                  <Button
                    onClick={purchasePowerUp}
                    disabled={!isConnected || (autoJumpActive && autoJumpRemaining > 0) || isPurchasing || isConfirming}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-black text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {!isConnected
                      ? 'Connect Wallet'
                      : (autoJumpActive && autoJumpRemaining > 0)
                      ? '✅ Purchased'
                      : isPurchasing || isConfirming
                      ? 'Processing...'
                      : `Buy for ${POWER_UP_COST} ETH`}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
