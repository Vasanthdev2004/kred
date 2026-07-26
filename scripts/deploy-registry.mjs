// Deploy KredRegistry (F6) to Arc testnet.
//
//   1. Fund a wallet with Arc testnet USDC (https://faucet.circle.com).
//   2. Put its key in .env as DEPLOYER_PRIVATE_KEY=0x...   (never commit this).
//   3. Run:  npm run deploy:registry
//   4. Copy the printed address into NEXT_PUBLIC_KRED_REGISTRY_ADDRESS
//      (local .env + Railway Variables), then redeploy.
//
// The key is read from env and used only to sign the deploy tx here; it is never
// written to disk or committed.
import dotenv from "dotenv";
// Load .env.local first (dev overrides), then .env — matching Next.js precedence,
// so DEPLOYER_PRIVATE_KEY is found wherever you put it. First load wins.
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Arc testnet — kept in sync with config/arc.ts (verified 2026-07-20).
const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rawKey) {
  console.error(
    "✗ Set DEPLOYER_PRIVATE_KEY in .env (a funded Arc testnet key). Aborting.",
  );
  process.exit(1);
}
const account = privateKeyToAccount(
  rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`,
);

// --- compile ---------------------------------------------------------------
const source = fs.readFileSync(
  path.join(__dirname, "../contracts/KredRegistry.sol"),
  "utf8",
);
const input = {
  language: "Solidity",
  sources: { "KredRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const fatal = (output.errors ?? []).filter((e) => e.severity === "error");
if (fatal.length) {
  console.error("✗ Solidity compile errors:");
  for (const e of fatal) console.error(e.formattedMessage);
  process.exit(1);
}
const artifact = output.contracts["KredRegistry.sol"].KredRegistry;
const abi = artifact.abi;
const bytecode = `0x${artifact.evm.bytecode.object}`;

// --- deploy ----------------------------------------------------------------
const wallet = createWalletClient({ account, chain: arc, transport: http() });
const publicClient = createPublicClient({ chain: arc, transport: http() });

console.log(`Deploying KredRegistry from ${account.address} → Arc testnet…`);
const hash = await wallet.deployContract({ abi, bytecode });
console.log(`  deploy tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("✗ Deploy failed:", receipt.status);
  process.exit(1);
}

// Prove there is actually code at the address before printing something to paste into
// NEXT_PUBLIC_KRED_REGISTRY_ADDRESS. A no-code address dark-fails the whole site: viem's
// multicall throws, readAnchor returns `unknown`, and — because every gate fails closed —
// EVERY verify page renders "Can't confirm status" with no error anywhere to explain it.
const code = await publicClient.getCode({ address: receipt.contractAddress });
if (!code || code === "0x") {
  console.error(
    `✗ No bytecode at ${receipt.contractAddress} — the deploy did not stick.`,
  );
  console.error("  Do NOT set NEXT_PUBLIC_KRED_REGISTRY_ADDRESS to it. Aborting.");
  process.exit(1);
}

console.log(`\n✅ KredRegistry deployed at: ${receipt.contractAddress}`);
console.log(`   bytecode verified on-chain (${(code.length - 2) / 2} bytes)`);
console.log(
  `   explorer: https://testnet.arcscan.app/address/${receipt.contractAddress}`,
);
console.log(`\nNext — set this everywhere the app reads it:`);
console.log(`   NEXT_PUBLIC_KRED_REGISTRY_ADDRESS=${receipt.contractAddress}`);
console.log(`   • local .env`);
console.log(`   • Railway → Variables → then redeploy`);
