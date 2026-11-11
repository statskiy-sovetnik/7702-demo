import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mnemonicToAccount } from 'viem/accounts'
import { toHex } from 'viem'

import { ALICE_INDEX, DELEGATE_INDEX } from './src/accounts.ts'

const VIRTUAL_ID = 'virtual:demo-env'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Отдаёт значения из .env приложению через виртуальный модуль.
 *
 * Не define: в dev-режиме Vite 8 не подставляет define в исходники, и
 * приложение падает на `__RPC_URL__ is not defined`, хотя сборка проходит.
 * Виртуальный модуль работает одинаково и в dev, и в build.
 *
 * Мнемоника остаётся здесь, в node. Наружу уходят только адреса и
 * производный приватный ключ делегата — см. предупреждение в .env.example.
 */
function demoEnv(values: Record<string, string>): Plugin {
  return {
    name: 'demo-env',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null
      return Object.entries(values)
        .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)}`)
        .join('\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' вместо префикса — грузим все переменные, а не только VITE_*
  const env = loadEnv(mode, process.cwd(), '')

  const seed = env.EOA_SEED_PHRASE?.trim()
  if (!seed) {
    throw new Error('EOA_SEED_PHRASE не задана в .env — скопируйте .env.example в .env и заполните')
  }

  const alice = mnemonicToAccount(seed, { addressIndex: ALICE_INDEX })
  const delegate = mnemonicToAccount(seed, { addressIndex: DELEGATE_INDEX })
  const delegatePrivateKey = delegate.getHdKey().privateKey
  if (!delegatePrivateKey) throw new Error('не удалось извлечь приватный ключ делегата')

  return {
    plugins: [
      react(),
      demoEnv({
        ALICE_ADDRESS: alice.address,
        DELEGATE_ADDRESS: delegate.address,
        DELEGATE_PRIVATE_KEY: toHex(delegatePrivateKey),
        RPC_URL: env.MAINNET_RPC_URL ?? '',
        WC_PROJECT_ID: env.WALLETCONNECT_PROJECT_ID ?? '',
      }),
    ],
    server: { port: 5173 },
  }
})
