/**
 * Откат EIP-7702: авторизация на нулевой адрес снимает делегирование кода,
 * и адрес Алисы снова становится обычным EOA.
 *   yarn revoke
 */
import { zeroAddress } from 'viem'
import { isValid7702Implementation } from '@metamask/smart-accounts-kit/actions'

import { ENV } from '../src/constants.ts'
import { alice, aliceWallet, info, ok, publicClient } from './common.ts'

const upgraded = await isValid7702Implementation({
  client: publicClient,
  accountAddress: alice.address,
  environment: ENV,
})

const code = await publicClient.getCode({ address: alice.address })
if (!upgraded && (!code || code === '0x')) {
  console.log(ok('у адреса Алисы нет кода — откатывать нечего'))
  process.exit(0)
}

console.log(info(`снимаем делегирование кода с ${alice.address}`))
console.log(info(`текущий код: ${code}`))

const authorization = await aliceWallet.signAuthorization({
  account: alice,
  contractAddress: zeroAddress,
  chainId: 1,
  executor: 'self',
})

const hash = await aliceWallet.sendTransaction({
  authorizationList: [authorization],
  to: alice.address,
  data: '0x',
})
console.log(info(`tx ${hash}`))

const receipt = await publicClient.waitForTransactionReceipt({ hash })
const after = await publicClient.getCode({ address: alice.address })

console.log(
  receipt.status === 'success' && (!after || after === '0x')
    ? ok('откат выполнен, код снят')
    : `статус ${receipt.status}, код сейчас: ${after ?? '0x'}`,
)
