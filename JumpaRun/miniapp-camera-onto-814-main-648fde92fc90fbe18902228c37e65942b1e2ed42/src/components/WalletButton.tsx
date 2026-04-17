'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { Wallet, LogOut, Copy, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBalance(value: bigint | undefined, decimals = 18): string {
  if (!value) return '0.0000';
  const whole = Number(value) / 10 ** decimals;
  if (whole < 0.0001) return whole.toExponential(2);
  return whole.toFixed(4);
}

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isConnected || !address) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-4 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-[0_0_20px_hsl(190_95%_50%/0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_hsl(190_95%_50%/0.6)]"
        >
          <Wallet className="h-4 w-4" />
          <span>Connect Wallet</span>
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="glass border-primary/20 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl text-foreground">
                Connect Wallet
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Choose a wallet to connect to Jumparun on Base.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex flex-col gap-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect(
                      { connector },
                      {
                        onSuccess: () => {
                          toast.success(`Connected via ${connector.name}`);
                          setOpen(false);
                        },
                        onError: (err) => toast.error(err.message),
                      },
                    );
                  }}
                  disabled={isPending}
                  className="group flex items-center justify-between rounded-xl border border-primary/15 bg-surface-2 px-4 py-3.5 transition-all hover:border-primary/40 hover:bg-surface-3 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <span className="font-medium text-foreground">{connector.name}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              By connecting you agree to play fair.
            </p>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-surface-2/80 px-3 py-2 backdrop-blur-md transition-all hover:border-primary/50 hover:bg-surface-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {balance ? `${formatBalance(balance.value)} ${balance.symbol}` : 'Base'}
            </span>
            <span className="font-display text-xs font-bold text-foreground">
              {formatAddress(address)}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="glass w-56 border-primary/20">
        <DropdownMenuItem onClick={handleCopy} className="gap-2">
          {copied ? <Check className="h-4 w-4 text-neon-green" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? 'Copied!' : 'Copy address'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-primary/15" />
        <DropdownMenuItem
          onClick={() => {
            disconnect();
            toast.success('Disconnected');
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
