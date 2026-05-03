import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Umbra program IDs ────────────────────────────────────────────────────────

const UMBRA_PROGRAM_IDS = {
  mainnet: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
  devnet:  "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
} as const;

const SOL_MINT = "So11111111111111111111111111111111111111112";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VeilPayServerConfig {
  /** Solana RPC endpoint. Defaults to public mainnet. */
  rpcUrl?: string;
  /** "mainnet" | "devnet". Determines which Umbra program ID to check against. */
  network?: "mainnet" | "devnet";
  /** Supabase URL (e.g. https://xyz.supabase.co). Required for production. */
  supabaseUrl?: string;
  /** Supabase service-role key (server-only, bypasses RLS). Required for production. */
  supabaseServiceRoleKey?: string;
}

export interface X402Invoice {
  /** Amount in token units (e.g. 0.1 for 0.1 SOL, 1.0 for 1 USDC). */
  amount: number;
  /** Token symbol, e.g. "SOL" or "USDC". */
  token: string;
  /** SPL token mint address. For SOL use So111...112. */
  mint: string;
  /** Token decimals (9 for SOL, 6 for USDC). */
  decimals: number;
  /** Server's Solana address — the UTXO destination. */
  destination: string;
  /** 64-char hex string uniquely identifying this invoice. */
  invoiceId: string;
  /** ISO timestamp when this invoice expires (default: 10 minutes from issue). */
  expiresAt: string;
}

export interface VerifyX402DepositParams {
  /** Proof account creation tx signature (first part of the x402 header). */
  proofTxSignature: string;
  /** UTXO creation tx signature (second part of the x402 header). */
  depositTxSignature: string;
  /** The server's Solana address (for replay record only, not verified in tx). */
  serverSolanaAddress: string;
  /** 32-byte invoice ID as Uint8Array. */
  expectedInvoiceId: Uint8Array;
  /** Amount in token units (must match the invoice). */
  expectedAmount: number;
  /** Token symbol, e.g. "SOL" or "USDC". */
  expectedToken: string;
  /** SPL mint address (or SOL_MINT for native SOL). */
  expectedMint: string;
  /** Token decimals. */
  expectedDecimals: number;
}

// ─── VeilPayServer ────────────────────────────────────────────────────────────

export class VeilPayServer {
  private connection: Connection;
  private umbraProgram: PublicKey;
  private supabase: SupabaseClient | null = null;
  private invoiceTtlMs: number;

  constructor(config: VeilPayServerConfig = {}) {
    const network  = config.network ?? "mainnet";
    const rpcUrl   = config.rpcUrl  ?? (
      network === "mainnet"
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com"
    );

    this.connection    = new Connection(rpcUrl, "confirmed");
    this.umbraProgram  = new PublicKey(UMBRA_PROGRAM_IDS[network]);
    this.invoiceTtlMs  = 10 * 60 * 1000; // 10 minutes

    if (config.supabaseUrl && config.supabaseServiceRoleKey) {
      this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  /**
   * Issue a new x402 invoice. Store it in Supabase (required for distributed
   * deployments — without Supabase, invoices are lost across serverless instances).
   *
   * Returns the invoice object to embed in your 402 response body.
   */
  async issueInvoice(opts: {
    amount: number;
    token: string;
    mint: string;
    decimals: number;
    serverAddress: string;
  }): Promise<X402Invoice> {
    const invoiceId  = crypto.getRandomValues(new Uint8Array(32));
    const invoiceIdHex = Buffer.from(invoiceId).toString("hex");
    const expiresAt  = new Date(Date.now() + this.invoiceTtlMs).toISOString();

    if (this.supabase) {
      const { error } = await this.supabase
        .from("x402_invoices")
        .insert({ id: invoiceIdHex, expires_at: expiresAt, consumed: false });
      if (error) throw new Error(`[VeilPay] Invoice insert failed: ${error.message}`);
    } else {
      console.warn("[VeilPay] No Supabase configured — invoice stored in-memory. Will break across serverless instances.");
    }

    return {
      amount:      opts.amount,
      token:       opts.token,
      mint:        opts.mint,
      decimals:    opts.decimals,
      destination: opts.serverAddress,
      invoiceId:   invoiceIdHex,
      expiresAt,
    };
  }

  /**
   * Parse the X-402-Payment header into its three components.
   * Returns null if the header is missing or malformed.
   */
  parsePaymentHeader(header: string | null): {
    proofTxSig: string;
    depositTxSig: string;
    invoiceIdHex: string;
  } | null {
    if (!header?.startsWith("x402 ")) return null;
    const parts = header.substring(5).split(":");
    if (parts.length !== 3) return null;

    const [proofTxSig, depositTxSig, invoiceIdHex] = parts;
    const sigRe = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;
    const hexRe = /^[0-9a-fA-F]{64}$/;

    if (!sigRe.test(proofTxSig) || !sigRe.test(depositTxSig) || !hexRe.test(invoiceIdHex)) {
      return null;
    }

    return { proofTxSig, depositTxSig, invoiceIdHex };
  }

  /**
   * Consume an invoice (mark it used). Must be called before verifyPayment to
   * prevent double-use. Returns false if the invoice is unknown or expired.
   */
  async consumeInvoice(invoiceIdHex: string): Promise<boolean> {
    if (!this.supabase) {
      console.warn("[VeilPay] No Supabase — cannot consume invoice. Rejecting.");
      return false;
    }

    const { data, error } = await this.supabase
      .from("x402_invoices")
      .update({ consumed: true })
      .eq("id", invoiceIdHex)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      console.error("[VeilPay] Supabase consume error:", error.message);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Verify an x402 payment on-chain. Call this after consumeInvoice succeeds.
   *
   * - SOL payments: sums native lamport delta across both txs (proof + deposit).
   * - SPL token payments (USDC etc.): checks payer's token balance delta in the
   *   deposit tx via preTokenBalances / postTokenBalances.
   * - Replay protection: checks the deposit sig against the payments table.
   * - On success, records the payment to Supabase to prevent replay.
   */
  async verifyPayment(params: VerifyX402DepositParams): Promise<boolean> {
    const {
      proofTxSignature,
      depositTxSignature,
      serverSolanaAddress,
      expectedInvoiceId,
      expectedAmount,
      expectedToken,
      expectedMint,
      expectedDecimals,
    } = params;

    if (!this.supabase) {
      console.error("[VeilPay] No Supabase — cannot check replay. Rejecting.");
      return false;
    }

    // ── Replay protection ──────────────────────────────────────────────────
    const { data: existing } = await this.supabase
      .from("payments")
      .select("id")
      .eq("deposit_sig", depositTxSignature)
      .single();

    if (existing) {
      console.error(`[VeilPay] Replay — sig ${depositTxSignature.slice(0, 12)} already used`);
      return false;
    }

    // ── Fetch both txs in parallel ─────────────────────────────────────────
    const txOpts = { maxSupportedTransactionVersion: 0, commitment: "confirmed" } as const;
    const [proofTx, depositTx] = await Promise.all([
      this.connection.getParsedTransaction(proofTxSignature, txOpts),
      this.connection.getParsedTransaction(depositTxSignature, txOpts),
    ]);

    if (!proofTx)           { console.error("[VeilPay] Proof tx not found");              return false; }
    if (!depositTx)         { console.error("[VeilPay] Deposit tx not found");            return false; }
    if (proofTx.meta?.err)  { console.error("[VeilPay] Proof tx failed:", proofTx.meta.err);   return false; }
    if (depositTx.meta?.err){ console.error("[VeilPay] Deposit tx failed:", depositTx.meta.err); return false; }

    // ── Confirm Umbra program is invoked ───────────────────────────────────
    const accountKeys = depositTx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    if (!accountKeys.includes(this.umbraProgram.toBase58())) {
      console.error("[VeilPay] Deposit tx does not invoke the Umbra program");
      return false;
    }

    // ── Amount check ───────────────────────────────────────────────────────
    const payerAddress = accountKeys[0];
    const isSol = expectedMint === SOL_MINT;

    if (isSol) {
      // Native SOL: sum balance delta across both txs
      const proofDelta   = (proofTx.meta?.preBalances?.[0]   ?? 0) - (proofTx.meta?.postBalances?.[0]   ?? 0);
      const depositDelta = (depositTx.meta?.preBalances?.[0] ?? 0) - (depositTx.meta?.postBalances?.[0] ?? 0);
      const spent        = proofDelta + depositDelta;
      const required     = Math.round(expectedAmount * LAMPORTS_PER_SOL);

      if (spent < required) {
        console.error(`[VeilPay] SOL underpayment: ${spent} lamports, required ${required}`);
        return false;
      }
    } else {
      // SPL token: check payer's token balance delta in the deposit tx
      const pre  = (depositTx.meta?.preTokenBalances  ?? []).find(
        (b) => b.owner === payerAddress && b.mint === expectedMint
      );
      const post = (depositTx.meta?.postTokenBalances ?? []).find(
        (b) => b.owner === payerAddress && b.mint === expectedMint
      );

      if (!pre) {
        console.error(`[VeilPay] No pre-balance for payer's ${expectedToken} account`);
        return false;
      }

      const spent    = BigInt(pre.uiTokenAmount.amount) - BigInt(post?.uiTokenAmount.amount ?? "0");
      const required = BigInt(Math.round(expectedAmount * 10 ** expectedDecimals));

      if (spent < required) {
        console.error(`[VeilPay] ${expectedToken} underpayment: ${spent} raw, required ${required}`);
        return false;
      }
    }

    // ── Record payment (replay protection) ─────────────────────────────────
    await this.supabase.from("payments").insert({
      deposit_sig: depositTxSignature,
      proof_sig:   proofTxSignature,
      invoice_id:  Buffer.from(expectedInvoiceId).toString("hex"),
      recipient:   serverSolanaAddress,
      token:       expectedToken,
      amount:      expectedAmount,
      verified_at: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Convenience method: parse header → consume invoice → verify payment.
   * Returns the parsed payment proof on success, null on any failure.
   */
  async handlePayment(opts: {
    header: string | null;
    serverAddress: string;
    expectedAmount: number;
    expectedToken: string;
    expectedMint: string;
    expectedDecimals: number;
  }): Promise<{ proofTxSig: string; depositTxSig: string; invoiceIdHex: string } | null> {
    const parsed = this.parsePaymentHeader(opts.header);
    if (!parsed) return null;

    const { proofTxSig, depositTxSig, invoiceIdHex } = parsed;
    const invoiceId = new Uint8Array(invoiceIdHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

    const consumed = await this.consumeInvoice(invoiceIdHex);
    if (!consumed) return null;

    const valid = await this.verifyPayment({
      proofTxSignature:    proofTxSig,
      depositTxSignature:  depositTxSig,
      serverSolanaAddress: opts.serverAddress,
      expectedInvoiceId:   invoiceId,
      expectedAmount:      opts.expectedAmount,
      expectedToken:       opts.expectedToken,
      expectedMint:        opts.expectedMint,
      expectedDecimals:    opts.expectedDecimals,
    });

    return valid ? parsed : null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { SOL_MINT };
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT_MAINNET = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
