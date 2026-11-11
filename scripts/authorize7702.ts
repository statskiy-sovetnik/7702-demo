/**
 * Одноразовый апгрейд EOA Алисы до смарт-аккаунта по EIP-7702.
 *   yarn authorize
 *
 * Делается локальным ключом, а не через MetaMask: viem signAuthorization
 * не работает с JSON-RPC аккаунтами, а кошелёк не умеет отдавать
 * 7702-авторизацию наружу.
 */
import { concat, formatEther } from 'viem'
import { isValid7702Implementation } from '@metamask/smart-accounts-kit/actions'

import { EIP7702_IMPL, ENV } from '../src/constants.ts'
import { alice, aliceWallet, bad, info, ok, publicClient } from './common.ts'

// Не платим дважды
const already = await isValid7702Implementation({
  client: publicClient,
  accountAddress: alice.address,
  environment: ENV,
})
if (already) {
  console.log(ok(`${alice.address} уже апгрейднут до ${EIP7702_IMPL}`))
  process.exit(0)
}

const existingCode = await publicClient.getCode({ address: alice.address })
if (existingCode && existingCode !== '0x') {
  console.log(bad(`у адреса уже есть код, но это не наша имплементация: ${existingCode}`))
  console.log(info('сначала yarn revoke'))
  process.exit(1)
}

const balance = await publicClient.getBalance({ address: alice.address })
console.log(info(`Алиса   ${alice.address}`))
console.log(info(`баланс  ${formatEther(balance)} ETH`))
console.log(info(`апгрейд на ${EIP7702_IMPL}`))

const authorization = await aliceWallet.signAuthorization({
  account: alice,
  contractAddress: EIP7702_IMPL,
  // Явно 1: chainId 0 означал бы «действительно в любой сети»
  chainId: 1,
  // Отправитель транзакции — сам подписант, поэтому nonce авторизации должен
  // быть на единицу больше текущего. 'self' заставляет viem это учесть.
  executor: 'self',
})

// Авторизацию нельзя отправить саму по себе — прикладываем к пустому
// self-вызову, который попадает в receive() уже апгрейднутого аккаунта.
const hash = await aliceWallet.sendTransaction({
  authorizationList: [authorization],
  to: alice.address,
  data: '0x',
})
console.log(info(`tx ${hash}`))

const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success') {
  console.log(bad(`транзакция завершилась со статусом ${receipt.status}`))
  process.exit(1)
}

const code = await publicClient.getCode({ address: alice.address })
const expected = concat(['0xef0100', EIP7702_IMPL])
const valid = await isValid7702Implementation({
  client: publicClient,
  accountAddress: alice.address,
  environment: ENV,
})

console.log(info(`код адреса: ${code}`))
console.log(info(`ожидалось:  ${expected.toLowerCase()}`))
console.log(info(`газ израсходован: ${receipt.gasUsed}`))
console.log(valid ? ok('Алиса теперь смарт-аккаунт') : bad('проверка имплементации не прошла'))
process.exit(valid ? 0 : 1)
