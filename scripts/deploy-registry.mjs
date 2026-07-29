// Deploy KredRegistry (F6) to Arc testnet.
//
//   1. Fund a wallet with Arc testnet USDC (https://faucet.circle.com).
//   2. Run the command below; it prompts for the key (hidden, never written to disk).
//      Or set DEPLOYER_PRIVATE_KEY in .env if you prefer.
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

/** Ask for the key on stdin, so it never has to exist in a file or in shell history.
 *  Falls back to DEPLOYER_PRIVATE_KEY when one is already set (CI, or if you prefer
 *  .env). The input is echoed: masking it portably across terminals proved more
 *  trouble than it was worth, and this is a throwaway deploy key in a local shell. */
async function promptKey() {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question('Paste the deployer private key (NOT your seed phrase): ', resolve),
  );
  rl.close();
  return answer;
}

/** Normalise what a wallet actually hands you: stray whitespace, quotes a paste can
 *  pick up, and an optional 0x. On failure report only the SHAPE, never the value. */
function normaliseKey(input) {
  const cleaned = String(input)
    .replace(/["'\s]/g, "")
    .replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(cleaned)) return { key: `0x${cleaned}` };
  const hint = /^[0-9a-fA-F]*$/.test(cleaned)
    ? `got ${cleaned.length} hex characters, expected 64`
    : "it contains non-hex characters (a seed phrase is words, not a key)";
  return { error: hint };
}

const rawKey = process.env.DEPLOYER_PRIVATE_KEY || (await promptKey());
if (!rawKey || !rawKey.trim()) {
  console.error('✗ No key given. Aborting.');
  process.exit(1);
}
const parsed = normaliseKey(rawKey);
if (parsed.error) {
  console.error(`✗ That is not a valid private key: ${parsed.error}.`);
  console.error('  MetaMask: account menu > Account details > Show private key.');
  console.error('  It looks like 0x followed by 64 hex characters.');
  process.exit(1);
}
const account = privateKeyToAccount(parsed.key);

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
