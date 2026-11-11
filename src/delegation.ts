import {
  createDelegation,
  createExecution,
  ExecutionMode,
  ScopeType,
  type Delegation,
} from '@metamask/smart-accounts-kit'
import { signDelegation } from '@metamask/smart-accounts-kit/actions'
import {
  encodeFunctionData,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem'

import {
  AMOUNT_IN,
  AMOUNT_OUT_MIN_FALLBACK,
  CHAIN_ID,
  ENV,
  POOL_FEE,
  QUOTER_V2,
  QUOTER_V2_ABI,
  SLIPPAGE_BPS,
  SWAP_ROUTER_02,
  SWAP_ROUTER_ABI,
  SWAP_SELECTOR_SIG,
  USDC,
  USDT,
} from './constants.ts'

/**
 * Корневая делегация от Алисы делегату.
 *
 * Scope разворачивается в три кейвита: AllowedTargets (только роутер),
 * AllowedMethods (только exactInputSingle) и ValueLte(0) — последний запрещает
 * прикладывать ETH, что существенно, поскольку exactInputSingle payable.
 *
 * approve в делегацию намеренно не входит: Алиса выдаёт его отдельной
 * транзакцией. За счёт этого, во-первых, исполнение остаётся одно (см. redeem.ts
 * про режимы), во-вторых, allowance становится потолком ущерба — вытащить по
 * этой подписи больше, чем апрувлено, невозможно.
 */
export function buildDelegation(alice: Address, delegate: Address): Delegation {
  return createDelegation({
    from: alice,
    to: delegate,
    environment: ENV,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [SWAP_ROUTER_02],
      selectors: [SWAP_SELECTOR_SIG],
    },
  })
}

/**
 * Подпись делегации подключённым кошельком — обычный eth_signTypedData_v4.
 *
 * Берём client action из сабпаса /actions. В корне пакета лежит одноимённая
 * функция, принимающая privateKey; перепутать легко, ошибка вылезет в рантайме.
 */
export async function signWithWallet(
  walletClient: WalletClient,
  delegation: Delegation,
): Promise<Delegation> {
  const signature = await signDelegation(walletClient, {
    account: walletClient.account,
    delegation,
    delegationManager: ENV.DelegationManager,
    chainId: CHAIN_ID,
  })
  return { ...delegation, signature }
}

/** Котировка свапа. Квотер не view, поэтому именно simulate, а не read. */
export async function quoteAmountOut(publicClient: PublicClient): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: QUOTER_V2,
    abi: QUOTER_V2_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: USDC,
        tokenOut: USDT,
        amountIn: AMOUNT_IN,
        fee: POOL_FEE,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  return result[0]
}

/** amountOutMinimum с допуском на проскальзывание. Никогда не 0n. */
export function applySlippage(amountOut: bigint): bigint {
  const withSlippage = (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n
  return withSlippage > 0n ? withSlippage : AMOUNT_OUT_MIN_FALLBACK
}

export function buildSwapExecution(recipient: Address, amountOutMinimum: bigint) {
  return createExecution({
    target: SWAP_ROUTER_02,
    callData: encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: USDC,
          tokenOut: USDT,
          fee: POOL_FEE,
          recipient,
          amountIn: AMOUNT_IN,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    }),
  })
}

export type RedeemArgs = {
  delegations: Delegation[][]
  modes: ExecutionMode[]
  executions: ReturnType<typeof createExecution>[][]
}

/**
 * Одна цепочка делегаций, одно исполнение, режим SingleDefault.
 *
 * Инвариант: SingleDefault ⟺ ровно одно исполнение в цепочке. Он не
 * косметический — encodeExecutionCalldata внутри кита выбирает кодирование по
 * длине массива, а не по режиму, так что рассогласование даёт не ошибку, а
 * молча неверно упакованный вызов с мусорным target.
 *
 * Batch-режим здесь неприменим в принципе: все три наших энфорсера несут
 * модификатор onlySingleCallTypeMode и реверят на CALLTYPE_BATCH.
 */
export function buildRedeemArgs(signed: Delegation, amountOutMinimum: bigint): RedeemArgs {
  const args: RedeemArgs = {
    delegations: [[signed]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[buildSwapExecution(signed.delegator as Address, amountOutMinimum)]],
  }
  assertModeMatchesExecutions(args)
  return args
}

export function assertModeMatchesExecutions({ modes, executions, delegations }: RedeemArgs): void {
  if (modes.length !== executions.length || modes.length !== delegations.length) {
    throw new Error('delegations, modes и executions должны быть одной длины')
  }
  modes.forEach((mode, i) => {
    const isSingle = mode === ExecutionMode.SingleDefault || mode === ExecutionMode.SingleTry
    if (isSingle !== (executions[i].length === 1)) {
      throw new Error(
        `режим и число исполнений не совпадают в цепочке ${i}: ` +
          `${isSingle ? 'Single' : 'Batch'} при ${executions[i].length} исполнениях`,
      )
    }
  })
}
