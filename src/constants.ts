import { getAddress, parseAbi, parseUnits, type Address, type Hex } from 'viem'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'

export const CHAIN_ID = 1 as const

/** Контракты Delegation Framework для mainnet. Адреса не хардкодим — берём из кита. */
export const ENV = getSmartAccountsEnvironment(CHAIN_ID)

/** Имплементация, на которую указывает 7702-авторизация: 0x63c0c19a…DAE32B. */
export const EIP7702_IMPL = ENV.implementations.EIP7702StatelessDeleGatorImpl as Address

export const USDC = getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
export const USDT = getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')
export const SWAP_ROUTER_02 = getAddress('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45')
export const QUOTER_V2 = getAddress('0x61fFE014bA17989E743c5F6cB21bF9697530B21e')

/**
 * Тир комиссии пула USDC/USDT. 100 = 0.01%.
 * Проверено на mainnet: в нём 7.5M USDC / 25.4M USDT — на два порядка глубже,
 * чем 500 и 3000, так что 10 USDC проходят без заметного проскальзывания.
 */
export const POOL_FEE = 100 as const

/** Оба токена шестизначные. */
export const AMOUNT_IN = parseUnits('10', 6)

/** Допуск проскальзывания для amountOutMinimum, в десятых долях процента. */
export const SLIPPAGE_BPS = 50n // 0.5%

/** Жёсткий пол, если котировка не получена. Никогда не 0n. */
export const AMOUNT_OUT_MIN_FALLBACK = parseUnits('9.9', 6)

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

/**
 * SwapRouter02 — БЕЗ поля deadline (7 полей, селектор 0x04e45aaf).
 * У оригинального SwapRouter структура с deadline и селектор 0x414bf389;
 * в байткоде SwapRouter02 его нет, перепутать = гарантированный revert.
 */
export const SWAP_ROUTER_ABI = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
])

/** Сигнатура ровно в том виде, в каком она уходит в AllowedMethodsEnforcer. */
export const SWAP_SELECTOR_SIG =
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))'

export const QUOTER_V2_ABI = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])

export const DELEGATION_MANAGER_ABI = parseAbi(['function paused() view returns (bool)'])

export const ETHERSCAN_TX = (hash: Hex) => `https://etherscan.io/tx/${hash}`

/** Оценка газа на redeemDelegations одного исполнения (замерено сухим прогоном). */
export const REDEEM_GAS_ESTIMATE = 300_000n

/** Двукратный запас к текущей цене газа — она может вырасти между проверкой и отправкой. */
export const GAS_SAFETY_FACTOR = 2n
