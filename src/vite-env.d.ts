/// <reference types="vite/client" />

/** Виртуальный модуль, который наполняет vite.config.ts из .env */
declare module 'virtual:demo-env' {
  export const ALICE_ADDRESS: string
  export const DELEGATE_ADDRESS: string
  export const DELEGATE_PRIVATE_KEY: string
  export const RPC_URL: string
  export const WC_PROJECT_ID: string
}
