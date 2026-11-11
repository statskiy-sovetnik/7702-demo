/**
 * Браузерная половина конфигурации: значения из .env, которые vite.config.ts
 * отдаёт через виртуальный модуль. В node (scripts/) этот модуль импортировать
 * нельзя — там нет виртуального резолва; берите src/constants.ts.
 */
import { getAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  ALICE_ADDRESS as ALICE_RAW,
  DELEGATE_ADDRESS as DELEGATE_RAW,
  DELEGATE_PRIVATE_KEY,
  RPC_URL as RPC_RAW,
  WC_PROJECT_ID as WC_RAW,
} from 'virtual:demo-env'

export * from './constants.ts'

export const RPC_URL = RPC_RAW
export const WC_PROJECT_ID = WC_RAW

/** Ожидаемый адрес Алисы. UI сверяет с ним подключённый кошелёк. */
export const ALICE_ADDRESS = getAddress(ALICE_RAW)

/**
 * Делегат. Приватный ключ лежит в клиентском бандле — см. .env.example.
 * Поэтому на нём держим только газ.
 */
export const DELEGATE_ACCOUNT = privateKeyToAccount(DELEGATE_PRIVATE_KEY as Hex)
export const DELEGATE_ADDRESS = getAddress(DELEGATE_RAW)
