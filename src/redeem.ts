import { contracts, type Delegation } from '@metamask/smart-accounts-kit'
import { isValid7702Implementation } from '@metamask/smart-accounts-kit/actions'
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { mainnet } from 'viem/chains'

import {
  AMOUNT_IN,
  DELEGATE_ACCOUNT,
  DELEGATION_MANAGER_ABI,
  ENV,
  ERC20_ABI,
  GAS_SAFETY_FACTOR,
  REDEEM_GAS_ESTIMATE,
  RPC_URL,
  SWAP_ROUTER_02,
  USDC,
} from './config.ts'
import { buildRedeemArgs } from './delegation.ts'

const transport = http(RPC_URL || undefined)

export const publicClient = createPublicClient({ chain: mainnet, transport })

/**
 * Клиент делегата. Именно он становится msg.sender в redeemDelegations,
 * а DelegationManager сверяет msg.sender с полем delegate — симулировать
 * от чужого имени бессмысленно, вернётся InvalidDelegate.
 */
export const delegateClient = createWalletClient({
  account: DELEGATE_ACCOUNT,
  chain: mainnet,
  transport,
})

export type PreflightCheck = { label: string; ok: boolean; detail?: string }

/** Все проверки — eth_call, ничего не стоят. */
export async function preflight(alice: Address): Promise<PreflightCheck[]> {
  const [upgraded, usdcBalance, allowance, delegateEth, paused, fees] = await Promise.all([
    isValid7702Implementation({
      client: publicClient,
      accountAddress: alice,
      environment: ENV,
    }),
    publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [alice],
    }),
    publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [alice, SWAP_ROUTER_02],
    }),
    publicClient.getBalance({ address: DELEGATE_ACCOUNT.address }),
    publicClient.readContract({
      address: ENV.DelegationManager,
      abi: DELEGATION_MANAGER_ABI,
      functionName: 'paused',
    }),
    publicClient.estimateFeesPerGas(),
  ])

  // Планку считаем от текущей цены газа, а не фиксированной константой:
  // при 0.1 gwei и при 100 gwei это совершенно разные суммы
  const needed = fees.maxFeePerGas * REDEEM_GAS_ESTIMATE * GAS_SAFETY_FACTOR

  const usdc = (v: bigint) => `${(Number(v) / 1e6).toFixed(2)} USDC`
  const eth = (v: bigint) => `${(Number(v) / 1e18).toFixed(5)} ETH`

  return [
    {
      label: 'Алиса апгрейднута по EIP-7702',
      ok: upgraded,
      detail: upgraded ? undefined : 'запустите yarn authorize',
    },
    { label: 'у Алисы хватает USDC', ok: usdcBalance >= AMOUNT_IN, detail: usdc(usdcBalance) },
    {
      label: 'выдан allowance роутеру',
      ok: allowance >= AMOUNT_IN,
      detail: usdc(allowance),
    },
    {
      label: 'у делегата есть газ',
      ok: delegateEth >= needed,
      detail: `${eth(delegateEth)} при нужных ${eth(needed)}`,
    },
    { label: 'DelegationManager не на паузе', ok: !paused },
  ]
}

/** Сухой прогон. Возвращает расшифрованную причину реверта, если он есть. */
export async function simulateRedeem(
  signed: Delegation,
  amountOutMinimum: bigint,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await contracts.DelegationManager.simulate.redeemDelegations({
      client: delegateClient,
      delegationManagerAddress: ENV.DelegationManager,
      ...buildRedeemArgs(signed, amountOutMinimum),
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: describeRedeemError(error) }
  }
}

/**
 * Отправка. execute.redeemDelegations внутри сам симулирует перед записью,
 * то есть отказывается broadcast'ить заведомо реверт-транзакцию — это
 * бесплатный предохранитель, не заменяем его голым writeContract.
 */
export async function redeem(signed: Delegation, amountOutMinimum: bigint): Promise<Hex> {
  return contracts.DelegationManager.execute.redeemDelegations({
    client: delegateClient,
    delegationManagerAddress: ENV.DelegationManager,
    ...buildRedeemArgs(signed, amountOutMinimum),
  })
}

export function describeRedeemError(error: unknown): string {
  const decoded = contracts.DelegationManager.decode.redeemDelegationsError(error)
  if (decoded) return typeof decoded === 'string' ? decoded : JSON.stringify(decoded)

  const e = error as { shortMessage?: string; details?: string; message?: string }
  return e.shortMessage ?? e.details ?? e.message ?? String(error)
}
