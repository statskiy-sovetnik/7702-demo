/**
 * Прогон всего флоу против живого состояния mainnet, но без единой транзакции:
 *   yarn dryrun
 *
 * Берёт одноразовые адреса и через state override делает вид, что Алиса
 * апгрейднута по EIP-7702, держит USDC и выдала allowance роутеру. Дальше
 * честно строит делегацию, подписывает её и зовёт redeemDelegations через
 * eth_call. Проверяет разом: шейп exactInputSingle, все три энфорсера,
 * ERC-1271-ветку DelegationManager и кодирование исполнения.
 *
 * Стоит ноль, не требует ни ETH, ни USDC, ни заполненной мнемоники.
 */
import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  formatUnits,
  http,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { contracts, signDelegation } from '@metamask/smart-accounts-kit'

import {
  AMOUNT_IN,
  EIP7702_IMPL,
  ENV,
  SWAP_ROUTER_02,
  USDC,
} from '../src/constants.ts'
import { applySlippage, buildDelegation, buildRedeemArgs, quoteAmountOut } from '../src/delegation.ts'
import { bad, info, ok } from './log.ts'

const RPC = process.env.MAINNET_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com'
const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC) })

// Заведомо тестовые ключи — никакого отношения к .env
const ALICE_PK = `0x${'11'.repeat(32)}` as Hex
const DELEGATE_PK = `0x${'22'.repeat(32)}` as Hex
const alice = privateKeyToAccount(ALICE_PK)
const delegate = privateKeyToAccount(DELEGATE_PK)

/** USDC: balances в слоте 9, allowed в слоте 10. */
const mappingSlot = (key: Address, slot: bigint) =>
  keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [key, slot]))

const balanceSlot = mappingSlot(alice.address, 9n)
const allowanceSlot = keccak256(
  encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes32' }],
    [SWAP_ROUTER_02, mappingSlot(alice.address, 10n)],
  ),
)

const stateOverride = [
  // Алиса «апгрейднута»: тот самый delegate designator, что пишет настоящая авторизация
  { address: alice.address, code: concat(['0xef0100', EIP7702_IMPL]) as Hex },
  { address: delegate.address, balance: 10n ** 18n },
  {
    address: USDC,
    stateDiff: [
      { slot: balanceSlot, value: pad(toHex(AMOUNT_IN * 2n)) },
      { slot: allowanceSlot, value: pad(toHex(AMOUNT_IN)) },
    ],
  },
] as const

console.log(`\nRPC ${RPC}`)
console.log(info(`Алиса (тестовая)   ${alice.address}`))
console.log(info(`делегат (тестовый) ${delegate.address}`))

// Проверяем, что подменённые слоты действительно читаются как баланс и allowance
const [seenBalance, seenAllowance] = await Promise.all([
  publicClient.readContract({
    address: USDC,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ] as const,
    functionName: 'balanceOf',
    args: [alice.address],
    stateOverride: stateOverride as never,
  }),
  publicClient.readContract({
    address: USDC,
    abi: [
      {
        type: 'function',
        name: 'allowance',
        stateMutability: 'view',
        inputs: [{ type: 'address' }, { type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ] as const,
    functionName: 'allowance',
    args: [alice.address, SWAP_ROUTER_02],
    stateOverride: stateOverride as never,
  }),
])
console.log(
  seenBalance === AMOUNT_IN * 2n && seenAllowance === AMOUNT_IN
    ? ok(`override сработал: ${formatUnits(seenBalance, 6)} USDC, allowance ${formatUnits(seenAllowance, 6)}`)
    : bad(`override не сошёлся: баланс ${seenBalance}, allowance ${seenAllowance}`),
)

// Делегация строится ровно тем же кодом, что в UI
const delegation = buildDelegation(alice.address, delegate.address)
console.log(info(`кейвитов в делегации: ${delegation.caveats.length}`))
for (const c of delegation.caveats) {
  const name = Object.entries(ENV.caveatEnforcers).find(
    ([, addr]) => addr.toLowerCase() === c.enforcer.toLowerCase(),
  )?.[0]
  console.log(info(`  ${name ?? c.enforcer} terms=${c.terms}`))
}

const signature = await signDelegation({
  privateKey: ALICE_PK,
  delegation,
  delegationManager: ENV.DelegationManager,
  chainId: mainnet.id,
})
const signed = { ...delegation, signature }

const amountOut = await quoteAmountOut(publicClient as never)
const amountOutMinimum = applySlippage(amountOut)
console.log(info(`котировка ${formatUnits(amountOut, 6)} USDT, минимум ${formatUnits(amountOutMinimum, 6)}`))

const data = contracts.DelegationManager.encode.redeemDelegations(
  buildRedeemArgs(signed, amountOutMinimum),
)

try {
  await publicClient.call({
    account: delegate.address,
    to: ENV.DelegationManager,
    data,
    stateOverride: stateOverride as never,
  })
  const gas = await publicClient.estimateGas({
    account: delegate.address,
    to: ENV.DelegationManager,
    data,
    stateOverride: stateOverride as never,
  })
  console.log(ok(`redeemDelegations проходит, газ ≈ ${gas}`))
  console.log('\n\x1b[32mФлоу рабочий. Можно переходить к реальным адресам.\x1b[0m\n')
} catch (error) {
  console.log(bad(`redeemDelegations реверт: ${contracts.DelegationManager.decode.redeemDelegationsError(error) ?? (error as Error).message}`))
  process.exit(1)
}
