/**
 * Sweep leftover SOL from a stranded ephemeral account back to your overage wallet.
 *
 * Usage:
 *   LINK_URL="https://veilpay.xyz/claim#<secret>:SOL" node scripts/sweep-ephemeral.mjs
 *
 * Or pass the hash fragment directly:
 *   CLAIM_HASH="<secret>:USDC" node scripts/sweep-ephemeral.mjs
 *
 * The script reads NEXT_PUBLIC_RPC_URL and NEXT_PUBLIC_OVERAGE_WALLET from .env.local.
 */

import { Keypair, Connection, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && !k.startsWith("#")) env[k.trim()] = rest.join("=").trim();
  });
}

const RPC_URL      = env.NEXT_PUBLIC_RPC_URL      ?? "https://api.mainnet-beta.solana.com";
const OVERAGE_ADDR = env.NEXT_PUBLIC_OVERAGE_WALLET;

if (!OVERAGE_ADDR) {
  console.error("❌  NEXT_PUBLIC_OVERAGE_WALLET is not set in .env.local");
  process.exit(1);
}

// ── Parse the claim secret from the URL or CLAIM_HASH env var ─────────────
let rawHash = process.env.CLAIM_HASH ?? "";

if (!rawHash && process.env.LINK_URL) {
  const u = new URL(process.env.LINK_URL);
  rawHash = u.hash.replace("#", "");
}

if (!rawHash) {
  console.error("❌  Provide the claim secret via LINK_URL or CLAIM_HASH env var.");
  console.error("    Example: CLAIM_HASH=\"<secret>:USDC\" node scripts/sweep-ephemeral.mjs");
  process.exit(1);
}

// Hash format: <bs58_key>:<TOKEN>[:<memo>]
const claimSecret = rawHash.split(":")[0];
let ephemeralPrivateKey;
try {
  const b58 = bs58.default ?? bs58;
  ephemeralPrivateKey = b58.decode(claimSecret);
} catch {
  console.error("❌  Could not decode claim secret — is the URL correct?");
  process.exit(1);
}

const ephemeralKeypair = Keypair.fromSeed(
  ephemeralPrivateKey.length === 32
    ? ephemeralPrivateKey
    : ephemeralPrivateKey.slice(0, 32)
);

const ephemeralAddress = ephemeralKeypair.publicKey.toString();
const overageWallet    = new PublicKey(OVERAGE_ADDR);
const connection       = new Connection(RPC_URL, "confirmed");

// ── Check balance ────────────────────────────────────────────────────────────
const balance = await connection.getBalance(ephemeralKeypair.publicKey, "confirmed");
console.log(`\nEphemeral address : ${ephemeralAddress}`);
console.log(`Current balance   : ${balance} lamports (${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
console.log(`Destination       : ${OVERAGE_ADDR}\n`);

if (balance === 0) {
  console.log("✅  Nothing to sweep — balance is 0.");
  process.exit(0);
}

// ── Build sweep tx ───────────────────────────────────────────────────────────
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction();
tx.recentBlockhash = blockhash;
tx.feePayer = ephemeralKeypair.publicKey;

// Estimate fee with a dummy transfer
tx.add(SystemProgram.transfer({ fromPubkey: ephemeralKeypair.publicKey, toPubkey: overageWallet, lamports: 1000 }));
const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
const fee = feeCalc.value ?? 5000;
tx.instructions = []; // clear dummy

const sweepAmount = balance - fee;
if (sweepAmount <= 0) {
  console.log(`✅  Balance (${balance}) is less than the estimated fee (${fee}) — nothing to sweep.`);
  process.exit(0);
}

tx.add(SystemProgram.transfer({
  fromPubkey: ephemeralKeypair.publicKey,
  toPubkey:   overageWallet,
  lamports:   sweepAmount,
}));
tx.sign(ephemeralKeypair);

// ── Send + poll ───────────────────────────────────────────────────────────────
console.log(`Sweeping ${sweepAmount} lamports (${(sweepAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL) to overage wallet…`);
const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
console.log(`Submitted: ${sig}`);
console.log(`Solscan  : https://solscan.io/tx/${sig}\n`);

let confirmed = false;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: false });
  const conf = status.value?.confirmationStatus;
  process.stdout.write(`  poll ${i + 1}: ${conf ?? "pending"}\r`);
  if (conf === "confirmed" || conf === "finalized") { confirmed = true; break; }
  if (status.value?.err) {
    console.error(`\n❌  Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
    process.exit(1);
  }
}

console.log(confirmed
  ? `\n✅  Swept ${(sweepAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL to ${OVERAGE_ADDR}`
  : `\n⚠️  Transaction not confirmed after 60s — check Solscan: https://solscan.io/tx/${sig}`
);
