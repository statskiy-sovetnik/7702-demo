import 'dotenv/config'
import { createPublicClient, createWalletClient, http } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

import { ALICE_INDEX, DELEGATE_INDEX } from '../src/accounts.ts'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`\n  ${name} не задана в .env`)
    console.error('  Скопируйте .env.example в .env и заполните.\n')
    process.exit(1)
  }
  return value
}

const seed = required('EOA_SEED_PHRASE')
export const RPC_URL = required('MAINNET_RPC_URL')

export const alice = mnemonicToAccount(seed, { addressIndex: ALICE_INDEX })
export const delegate = mnemonicToAccount(seed, { addressIndex: DELEGATE_INDEX })

export const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL) })

export const aliceWallet = createWalletClient({
  account: alice,
  chain: mainnet,
  transport: http(RPC_URL),
})

export const delegateWallet = createWalletClient({
  account: delegate,
  chain: mainnet,
  transport: http(RPC_URL),
})

export { ok, bad, info } from './log.ts'
