---
name: veilpay-x402
description: Manage local wallets and execute private x402 stealth payments on Solana via Umbra. Use when an agent needs to create a wallet, handle 402 challenges, or perform shielded deposits.
---

# VeilPay x402 Agent Skill

This skill enables Gemini CLI to operate as an autonomous AI Agent in the VeilPay privacy-preserving payment ecosystem. It provides tools for wallet management and executing shielded Zero-Knowledge payments.

## Workflow

1.  **Identity Setup**: Create a persistent agent wallet using `wallet.cjs`.
2.  **Payment Discovery**: When an API returns a `402 Payment Required`, capture the invoice JSON.
3.  **Shielded Remittance**: Use `pay-invoice.cjs` to fulfill the invoice. This breaks the on-chain link between your agent wallet and the service provider by depositing into the Umbra Shielded Pool.
4.  **Reliability**: The payment script automatically checks for sufficient SOL and uses `skipPreflight: true` to ensure reliable transactions on Solana devnet.
5.  **Verification**: Provide the generated payload in your request's `Authorization` header.

## Command Reference

All scripts are located in `skills/veilpay/scripts/`.

### Create Agent Wallet
Generates a new Solana keypair and stores it at `~/.veilpay/wallet.json`.
```bash
node skills/veilpay/scripts/wallet.cjs create
```

### Get Wallet Address
Returns the public key of the local agent wallet.
```bash
node skills/veilpay/scripts/wallet.cjs show
```

### Request Airdrop (Devnet)
Requests 1 SOL to the agent wallet.
```bash
node skills/veilpay/scripts/wallet.cjs airdrop
```

### Perform Shielded x402 Payment
Fulfills an x402 invoice by depositing into the Umbra Shielded Pool. 
Uses `skipPreflight: true` for high reliability and includes a balance check.
```bash
# invoice_json: The "invoice" object from a 402 response
# --network: devnet or mainnet (default: mainnet)
node skills/veilpay/scripts/pay-invoice.cjs '<invoice_json>' [--network devnet]
```

## Protocol Specifications
See [references/api_docs.md](references/api_docs.md) for the x402 header format and supported token addresses.
