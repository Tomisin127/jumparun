'use client';

import { type ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { ONCHAINKIT_API_KEY, ONCHAINKIT_PROJECT_ID } from './config/onchainkit';
import { config, activeChain } from '@/lib/wagmi';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5_000,
      },
    },
  }));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={ONCHAINKIT_API_KEY}
          projectId={ONCHAINKIT_PROJECT_ID}
          chain={activeChain}
          config={{
            appearance: {
              name: 'jumparun',
              logo: 'https://cdn.builder.io/api/v1/image/assets/TEMP/9756b3248bdd48d596519e7d98958e9df5588654dadf0bb17a71fc435bcb37b3?placeholderIfAbsent=true&apiKey=ad3941e5ec034c87bd50708c966e7b84',
              mode: 'auto',
              theme: 'default',
            },
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
