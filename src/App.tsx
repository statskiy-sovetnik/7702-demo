import { useCallback, useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useWalletClient } from 'wagmi'
import { formatUnits, type Hex } from 'viem'
import type { Delegation } from '@metamask/smart-accounts-kit'

import {
  ALICE_ADDRESS,
  AMOUNT_IN,
  CHAIN_ID,
  DELEGATE_ADDRESS,
  ERC20_ABI,
  ETHERSCAN_TX,
  SWAP_ROUTER_02,
  USDC,
  USDT,
} from './config.ts'
import { applySlippage, buildDelegation, quoteAmountOut, signWithWallet } from './delegation.ts'
import {
  preflight,
  publicClient,
  redeem,
  simulateRedeem,
  type PreflightCheck,
} from './redeem.ts'

type Phase = 'idle' | 'approving' | 'signing' | 'signed' | 'simulating' | 'pending' | 'confirmed'

type Failure = { phase: Phase; message: string }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: walletClient } = useWalletClient()

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<Failure | null>(null)
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null)
  const [quote, setQuote] = useState<bigint | null>(null)
  const [signed, setSigned] = useState<Delegation | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [received, setReceived] = useState<bigint | null>(null)

  const wrongAccount = isConnected && address?.toLowerCase() !== ALICE_ADDRESS.toLowerCase()
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const blocked = !isConnected || wrongAccount || wrongChain

  const refresh = useCallback(async () => {
    try {
      const [c, q] = await Promise.all([preflight(ALICE_ADDRESS), quoteAmountOut(publicClient)])
      setChecks(c)
      setQuote(q)
    } catch (e) {
      setChecks(null)
      setError({ phase: 'idle', message: `не удалось прочитать состояние: ${String(e)}` })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const allowanceCheck = checks?.find((c) => c.label === 'выдан allowance роутеру')
  const needsApprove = allowanceCheck ? !allowanceCheck.ok : false
  const preflightOk = checks?.every((c) => c.ok) ?? false

  async function onApprove() {
    if (!walletClient) return
    setError(null)
    setPhase('approving')
    try {
      const hash = await walletClient.writeContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ROUTER_02, AMOUNT_IN],
        chain: walletClient.chain,
        account: walletClient.account,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
      setPhase('idle')
    } catch (e) {
      setError({ phase: 'approving', message: message(e) })
      setPhase('idle')
    }
  }

  async function onSign() {
    if (!walletClient || !address) return
    setError(null)
    setPhase('signing')
    try {
      const delegation = buildDelegation(ALICE_ADDRESS, DELEGATE_ADDRESS)
      setSigned(await signWithWallet(walletClient, delegation))
      setPhase('signed')
    } catch (e) {
      setError({ phase: 'signing', message: message(e) })
      setPhase('idle')
    }
  }

  async function onExecute() {
    if (!signed) return
    setError(null)
    setPhase('simulating')

    // Котировку берём свежую: между Sign и Execute цена могла уйти
    let amountOutMinimum: bigint
    try {
      amountOutMinimum = applySlippage(await quoteAmountOut(publicClient))
    } catch {
      amountOutMinimum = applySlippage(quote ?? 0n)
    }

    const sim = await simulateRedeem(signed, amountOutMinimum)
    if (!sim.ok) {
      setError({ phase: 'simulating', message: sim.reason })
      setPhase('signed')
      return
    }

    let hash: Hex | undefined
    try {
      // Снимок баланса строго до отправки, иначе транзакция может успеть
      // замайниться и дельта выйдет нулевой
      const before = await usdtBalance()

      setPhase('pending')
      hash = await redeem(signed, amountOutMinimum)
      setTxHash(hash)

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        setError({ phase: 'pending', message: 'транзакция отклонена сетью (reverted)' })
        setPhase('signed')
        return
      }
      setReceived((await usdtBalance()) - before)
      setPhase('confirmed')
      void refresh()
    } catch (e) {
      // Транзакция могла уйти в сеть, даже если запрос упал — хеш показываем
      if (hash) setTxHash(hash)
      setError({ phase: 'pending', message: message(e) })
      setPhase('signed')
    }
  }

  async function usdtBalance(): Promise<bigint> {
    return publicClient.readContract({
      address: USDT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [ALICE_ADDRESS],
    })
  }

  const busy = phase === 'approving' || phase === 'signing' || phase === 'simulating' || phase === 'pending'

  return (
    <main>
      <header>
        <h1>EIP-7702 Delegation Demo</h1>
        <ConnectButton />
      </header>

      {isConnected && wrongAccount && (
        <p className="warn">
          Подключён {short(address!)} — ожидается Алиса {short(ALICE_ADDRESS)}. Переключите аккаунт
          в кошельке.
        </p>
      )}
      {isConnected && wrongChain && <p className="warn">Нужен Ethereum mainnet.</p>}

      <section className="card">
        <p className="op">Swap 10 USDC to USDT on Uniswap</p>
        <p className="muted">
          {quote === null
            ? 'котировка загружается…'
            : `≈ ${formatUnits(quote, 6)} USDT · пул 0.01% · допуск 0.5%`}
        </p>

        <div className="row">
          {needsApprove && (
            <button onClick={onApprove} disabled={blocked || busy}>
              {phase === 'approving' ? 'Подтвердите в кошельке…' : 'Approve 10 USDC'}
            </button>
          )}
          <button onClick={onSign} disabled={blocked || busy || !preflightOk}>
            {phase === 'signing' ? 'Подтвердите в кошельке…' : 'Sign'}
          </button>
          <button onClick={onExecute} disabled={!signed || busy || phase === 'confirmed'}>
            {phase === 'simulating'
              ? 'Симуляция…'
              : phase === 'pending'
                ? 'Отправлено…'
                : 'Execute'}
          </button>
        </div>

        {signed && (
          <p className="muted mono">
            делегация подписана · делегат {short(DELEGATE_ADDRESS)} · подпись{' '}
            {signed.signature.slice(0, 12)}…
          </p>
        )}

        {txHash && (
          <p className="mono">
            <a href={ETHERSCAN_TX(txHash)} target="_blank" rel="noreferrer">
              {short(txHash)}
            </a>{' '}
            {phase === 'pending' && '· ждём подтверждения'}
          </p>
        )}

        {phase === 'confirmed' && (
          <p className="good">
            Свап исполнен
            {received !== null && received > 0n && ` · Алиса получила ${formatUnits(received, 6)} USDT`}
          </p>
        )}

        {error && (
          <p className="bad">
            [{error.phase}] {error.message}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Preflight</h2>
        {checks === null ? (
          <p className="muted">загрузка…</p>
        ) : (
          <ul className="checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'ok' : 'fail'}>
                <span>{c.ok ? '✓' : '✗'}</span> {c.label}
                {c.detail && <em> — {c.detail}</em>}
              </li>
            ))}
          </ul>
        )}
        <button className="link" onClick={() => void refresh()} disabled={busy}>
          обновить
        </button>
      </section>
    </main>
  )
}

function message(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; name?: string }
  if (err?.name === 'UserRejectedRequestError') return 'отклонено в кошельке'
  return err?.shortMessage ?? err?.message ?? String(e)
}
