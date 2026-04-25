import { Connection, Keypair } from "@solana/web3.js";
import { log, warn } from "./logger";
import { makeZkProverDeps, createBrowserSigner } from "./umbra";
import { 
  getUmbraClient, 
  createSignerFromPrivateKeyBytes, 
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction 
} from "@umbra-privacy/sdk";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";
import { RPC_URL, RPC_WS_URL, UMBRA_INDEXER_URL, NETWORK, TOKEN_CONFIG } from "./constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import bs58 from "bs58";

export interface X402FetchOptions extends RequestInit {
  agentPrivateKeyBase58: string; // The Agent's funding wallet
}

/**
 * AI Agent SDK: Automatically handles 402 Payment Required challenges
 * by executing a shielded Umbra Stealth Deposit.
 */
export async function x402Fetch(url: string, options: X402FetchOptions): Promise<Response> {
  const { agentPrivateKeyBase58, ...fetchOptions } = options;

  // 1. Initial Request
  log(`[x402Client] Fetching ${url}...`);
  let response = await fetch(url, fetchOptions);

  // 2. If not 402 Payment Required, return immediately
  if (response.status !== 402) {
    return response;
  }

  log(`[x402Client] 402 Payment Required intercepted. Extracting invoice...`);

  // 3. Parse Invoice
  const authHeader = response.headers.get("Www-Authenticate");
  if (!authHeader || !authHeader.includes("x402")) {
    throw new Error("Received 402 but no valid x402 Www-Authenticate header found.");
  }

  const responseBody = await response.json();
  const invoice = responseBody.invoice;
  
  if (!invoice || !invoice.amount || !invoice.token || !invoice.destination || !invoice.invoiceId) {
    throw new Error("Invalid x402 invoice payload from server.");
  }

  log(`[x402Client] Invoice received: ${invoice.amount} ${invoice.token} to ${invoice.destination}`);

  // 4. Prepare Solana/Umbra Client
  const agentKeypair = Keypair.fromSecretKey(bs58.decode(agentPrivateKeyBase58));
  const signer = await createSignerFromPrivateKeyBytes(agentKeypair.secretKey);
  
  const client = await getUmbraClient({
    signer,
    network: NETWORK,
    rpcUrl: RPC_URL,
    rpcSubscriptionsUrl: RPC_WS_URL,
    indexerApiEndpoint: UMBRA_INDEXER_URL,
    deferMasterSeedSignature: true,
  });

  const tokenCfg = TOKEN_CONFIG[invoice.token as Token];
  if (!tokenCfg) throw new Error(`Unsupported token: ${invoice.token}`);

  const amountRaw = BigInt(Math.round(invoice.amount * 10 ** tokenCfg.decimals));
  const invoiceIdBytes = new Uint8Array(Buffer.from(invoice.invoiceId, "hex"));

  // 5. Execute Stealth Deposit (Two steps: Proof + Deposit)
  log(`[x402Client] Generating ZK Proof for Stealth Deposit... (This takes ~20s)`);
  
  const utxoProver = getCreateReceiverClaimableUtxoFromPublicBalanceProver(makeZkProverDeps());
  const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
    { client },
    { zkProver: utxoProver }
  );

  const result = await createUtxo({
    destinationAddress: invoice.destination as Address,
    mint: tokenCfg.mint as Address,
    amount: amountRaw as any,
  }, {
    optionalData: invoiceIdBytes as any
  });

  const depositTxSig = result.createUtxoSignature;
  const proofTxSig = result.createProofAccountSignature;

  log(`[x402Client] Deposit successful!`);
  log(`  Proof TX: ${proofTxSig}`);
  log(`  Deposit TX: ${depositTxSig}`);

  // 6. Retry Request with Proof of Payment
  log(`[x402Client] Retrying request with Proof of Payment...`);
  
  const retryHeaders = new Headers(fetchOptions.headers);
  retryHeaders.set("Authorization", `x402 ${proofTxSig}:${depositTxSig}:${invoice.invoiceId}`);
  
  response = await fetch(url, {
    ...fetchOptions,
    headers: retryHeaders,
  });

  log(`[x402Client] Server responded with status ${response.status}`);
  return response;
}
