/**
 * Диагностика. Только чтение, ничего не отправляет и не стоит газа.
 *   yarn diag
 */
import { concat, formatEther, formatGwei, formatUnits, getAddress, parseAbi } from 'viem'
import { isValid7702Implementation } from '@metamask/smart-accounts-kit/actions'

import {
  AMOUNT_IN,
  DELEGATION_MANAGER_ABI,
  GAS_SAFETY_FACTOR,
  REDEEM_GAS_ESTIMATE,
  EIP7702_IMPL,
  ENV,
  ERC20_ABI,
  SWAP_ROUTER_02,
  USDC,
  USDT,
} from '../src/constants.ts'
import { alice, bad, delegate, info, ok, publicClient } from './common.ts'

let failures = 0
const check = (passed: boolean, message: string) => {
  console.log(passed ? ok(message) : bad(message))
  if (!passed) failures++
}

console.log('\nАдреса')
console.log(info(`Алиса (индекс 0)   ${alice.address}`))
console.log(info(`делегат (индекс 1) ${delegate.address}`))
console.log(info(`DelegationManager  ${ENV.DelegationManager}`))
console.log(info(`имплементация 7702 ${EIP7702_IMPL}`))

console.log('\nПроверки')

// 1. Апгрейд по EIP-7702
const code = await publicClient.getCode({ address: alice.address })
const expectedCode = concat(['0xef0100', EIP7702_IMPL]).toLowerCase()
const upgraded = await isValid7702Implementation({
  client: publicClient,
  accountAddress: alice.address,
  environment: ENV,
})
check(upgraded, `Алиса апгрейднута до смарт-аккаунта`)
console.log(info(`код адреса: ${code ?? '0x (пусто)'}`))
if (!upgraded) {
  console.log(info(`ожидалось:  ${expectedCode}`))
  console.log(info('запустите: yarn authorize'))
}

// Контрольный вопрос самому аккаунту: резолвится ли делегирование кода
if (upgraded) {
  try {
    const dm = await publicClient.readContract({
      address: alice.address,
      abi: parseAbi(['function delegationManager() view returns (address)']),
      functionName: 'delegationManager',
    })
    check(
      getAddress(dm) === getAddress(ENV.DelegationManager),
      `аккаунт Алисы отвечает delegationManager() = ${dm}`,
    )
  } catch {
    check(false, 'аккаунт Алисы не отвечает на delegationManager()')
  }
}

// 2. USDC у Алисы
const usdcBalance = await publicClient.readContract({
  address: USDC,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [alice.address],
})
check(usdcBalance >= AMOUNT_IN, `USDC у Алисы: ${formatUnits(usdcBalance, 6)} (нужно ≥ 10)`)

// 3. Allowance роутеру
const allowance = await publicClient.readContract({
  address: USDC,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [alice.address, SWAP_ROUTER_02],
})
check(
  allowance >= AMOUNT_IN,
  `allowance Алисы роутеру: ${formatUnits(allowance, 6)} USDC (нужно ≥ 10)`,
)
if (allowance < AMOUNT_IN) console.log(info('выдаётся кнопкой Approve в UI'))

// 4. Газ. Планку считаем от текущей цены газа, а не фиксированной константой
const fees = await publicClient.estimateFeesPerGas()
console.log(info(`цена газа: ${formatGwei(fees.maxFeePerGas)} gwei`))

const delegateNeeds = fees.maxFeePerGas * REDEEM_GAS_ESTIMATE * GAS_SAFETY_FACTOR
const delegateEth = await publicClient.getBalance({ address: delegate.address })
check(
  delegateEth >= delegateNeeds,
  `ETH у делегата на redeem: ${formatEther(delegateEth)} (нужно ${formatEther(delegateNeeds)})`,
)

// Алисе газ нужен на authorize (~46k) и approve (~55k)
const aliceNeeds = fees.maxFeePerGas * 101_000n * GAS_SAFETY_FACTOR
const aliceEth = await publicClient.getBalance({ address: alice.address })
check(
  aliceEth >= aliceNeeds,
  `ETH у Алисы на authorize+approve: ${formatEther(aliceEth)} (нужно ${formatEther(aliceNeeds)})`,
)

// 5. DelegationManager не на паузе
const paused = await publicClient.readContract({
  address: ENV.DelegationManager,
  abi: DELEGATION_MANAGER_ABI,
  functionName: 'paused',
})
check(!paused, `DelegationManager ${paused ? 'НА ПАУЗЕ' : 'активен'}`)

// Справочно: сколько USDT уже есть, чтобы потом увидеть дельту
const usdtBalance = await publicClient.readContract({
  address: USDT,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [alice.address],
})
console.log(info(`USDT у Алисы сейчас: ${formatUnits(usdtBalance, 6)}`))

console.log(
  failures === 0
    ? '\n\x1b[32mВсё готово.\x1b[0m\n'
    : `\n\x1b[31m${failures} из проверок не пройдено.\x1b[0m\n`,
)
process.exit(failures === 0 ? 0 : 1)
