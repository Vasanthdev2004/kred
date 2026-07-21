import { defineChain } from "viem";

/**
 * Arc testnet — every value here was verified first-hand on 2026-07-20.
 * See docs/arc-notes.md. Do not edit constants elsewhere.
 */
export const ARC_TESTNET_ID = 5042002;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  name: "Arc Testnet",
  // USDC is the native gas coin — 18 decimals as the NATIVE coin (ERC-20 is 6).
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  contracts: {
    // Standard Multicall3, verified live on Arc (getBlockNumber responds). Declaring
    // it lets viem/wagmi batch multiple reads into ONE eth_call — essential because
    // the public Arc RPC rate-limits rapid separate calls (the 2nd silently -32011s,
    // which is why the wallet EURC balance was reading 0).
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

export const ARC = {
  chainId: ARC_TESTNET_ID,
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com",
  contracts: {
    /** ERC-20 USDC interface (6 decimals). */
    usdc: "0x3600000000000000000000000000000000000000",
    /** ERC-20 EURC interface (6 decimals). */
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    /** Memo contract — wraps a call + emits Memo event. */
    memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
    /** CALL_FROM precompile — preserves msg.sender through the memo wrapper. */
    callFrom: "0x1800000000000000000000000000000000000003",
    /**
     * USDC is Arc's NATIVE coin: its ERC-20 `Transfer` events are emitted by this
     * system address in 18 decimals (not by the 0x3600 contract, not 6 decimals).
     * Divide native USDC values by 1e12 to get the 6-decimal ERC-20 amount.
     */
    nativeUsdcEmitter: "0xfffffffffffffffffffffffffffffffffffffffe",
  },
} as const;

/** Build an explorer URL for a tx / address / token. */
export function explorerTx(hash: string): string {
  return `${ARC.explorerUrl}/tx/${hash}`;
}
export function explorerAddress(addr: string): string {
  return `${ARC.explorerUrl}/address/${addr}`;
}
