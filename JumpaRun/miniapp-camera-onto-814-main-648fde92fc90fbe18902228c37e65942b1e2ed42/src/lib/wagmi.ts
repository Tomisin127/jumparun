import { createConfig, http, fallback } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { Attribution } from 'ox/erc8021';

export const activeChain = base;

// ERC-8021 builder attribution — appended to every transaction's calldata.
// Smart contracts ignore the suffix; it is read only by off-chain Base indexers.
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_w0niguwu'] });

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
  dataSuffix: DATA_SUFFIX,
  ssr: true,
});
