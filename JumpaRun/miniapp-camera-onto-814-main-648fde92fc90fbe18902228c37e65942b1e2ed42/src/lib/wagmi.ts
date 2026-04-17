import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

export const activeChain = base;
  
export const config = createConfig({
  chains: [activeChain],
  connectors: [
    coinbaseWallet({
      appName: 'jumparun',
      preference: 'smartWalletOnly',
    }),
  ],
  transports: {  
    [activeChain.id]: http(),
  },
});
