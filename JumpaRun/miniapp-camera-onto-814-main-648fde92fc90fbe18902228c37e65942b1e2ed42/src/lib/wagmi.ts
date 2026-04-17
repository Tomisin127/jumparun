import { createConfig, http, fallback } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';

export const activeChain = base;

// Multiple RPC endpoints for reliability (used by swap quoter)
export const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base.drpc.org',
];

export const config = createConfig({
  chains: [activeChain],
  connectors: [
    coinbaseWallet({
      appName: 'Jumparun',
      preference: 'all',
    }),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [activeChain.id]: fallback(BASE_RPC_URLS.map((url) => http(url))),
  },
  ssr: true,
});
