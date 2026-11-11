import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { mainnet } from 'wagmi/chains'

import { RPC_URL, WC_PROJECT_ID } from './config.ts'

/**
 * Только mainnet: переключаться некуда, и RainbowKit сам покажет
 * «Wrong network», если кошелёк окажется в другой сети.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'EIP-7702 Delegation Demo',
  projectId: WC_PROJECT_ID,
  chains: [mainnet],
  transports: { [mainnet.id]: http(RPC_URL || undefined) },
  ssr: false,
})
