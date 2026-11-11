# EIP-7702 + Metamask Smart Accounts Demo

Конечная цель: использовать функционал Metamask Smart Accounts Kit, Metamask Delegation Framework а также EIP-7702 для того, чтобы исполнять DeFi операции от лица Ledger.

Мы создадим единственный Smart Account (`EIP7702StatelessDeleGator`), которому дадим EIP-7702 авторизацию. Используя Metamask Delegation Framework мы будем отправлять транзакции на исполнение некоторых DeFi операций. Сеть: mainnet.

## Стадия 1
Протестируем только исполнение от лица стандартного JSON-RPC EOA, Ledger пока не будем задействовать. Создать смарт-аккаунт, следуя quickstart гайду и отправить 7702 авторизацию от EOA на этот аккаунт. Это безопасно, аккаунт почти пустой.

Создать простой UI, где будет подключение кошелька через Rainbow Kit Wallets. В UI будет просто текст "Swap 10 USDC to USDT on Uniswap", и кнопка "Sign", которая подпишет транзакцию для исполнения через наш Smart Account.

Затем используя делегацию выполнить простой свап USDC->USDT на Uniswap, используя полученную подпись. Добавь кнопку Execute, которая будет активна только после получения подписи. Нажатие на кнопку отправляет транзу. Отобрази прогрузку транзакции и тот факт что она исполнилась, когда получишь tx receipt.

### Уточнения по ходу работы

**Действующие лица.** Алиса — делегатор, `addressIndex 0` от `EOA_SEED_PHRASE`; её адрес апгрейдится по EIP-7702 и держит USDC. Делегат — `addressIndex 1`, обычный EOA, вся его роль это быть `msg.sender` в `redeemDelegations()` и платить газ. Смарт-аккаунтом делегата делать незачем: `DelegationManager` вызывает `executeFromExecutor` на делегаторе, так что исполнение всё равно идёт от Алисы.

**Бандлер не используется.** Изначально предполагался публичный эндпоинт, но раз делегат — обычный EOA, ERC-4337 из схемы выпадает целиком: Execute шлёт обычную транзакцию.

**7702-авторизация делается локальным ключом** (`yarn authorize`), а не через кошелёк: viem `signAuthorization` не работает с JSON-RPC аккаунтами, и MetaMask не отдаёт авторизацию наружу. Подпись делегации при этом идёт штатно через подключённый RainbowKit кошелёк.

**Caveat enforcers всё-таки используются.** Изначально планировалось без них, но `createDelegation` требует `scope` для корневой делегации, а обойти это можно только собрав структуру `Delegation` вручную — то есть больше кода ради меньшей безопасности. Взят минимальный `ScopeType.FunctionCall`: `targets: [SwapRouter02]`, `selectors: [exactInputSingle]`. Разворачивается в `AllowedTargets`, `AllowedMethods` и `ValueLte(0)`.

**`approve` вынесен из делегации** в отдельную транзакцию Алисы. Два следствия: в делегации остаётся одно исполнение (batch-режим неприменим — все кейвит-энфорсеры несут `onlySingleCallTypeMode` и реверят на `CALLTYPE_BATCH`), и allowance становится потолком ущерба по этой подписи.

**Ограничение текущей схемы:** scope проверяет адрес и метод, но не аргументы, поэтому в его рамках возможен `exactInputSingle` с чужим `recipient`. На стадии 2 закрывается через `exactCalldata`.

## Стадия 2
Детали DeFi операции я опишу позже.

## Источники
https://eips.ethereum.org/EIPS/eip-4337
https://eips.ethereum.org/EIPS/eip-7702
https://docs.metamask.io/smart-accounts-kit/
https://viem.sh/account-abstraction
https://rainbowkit.com/docs/introduction
