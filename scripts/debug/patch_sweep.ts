import fs from "fs";

let code = fs.readFileSync("src/lib/umbra.ts", "utf8");

// Fix 1: Throw if availableBalance is 0n to wait for RPC sync
code = code.replace(
  /const availableBalance = BigInt\(balanceResult\.balance\.toString\(\)\);\n\s+console\.log\(`\[withdraw\] Attempt \$\{attempt\}: Available balance is \$\{availableBalance\}`\);/,
  `const availableBalance = BigInt(balanceResult.balance.toString());
        console.log(\`[withdraw] Attempt \${attempt}: Available balance is \${availableBalance}\`);
        if (availableBalance === 0n) {
          throw new Error("Encrypted balance is 0. Waiting for RPC to sync the claim...");
        }`
);

// Fix 2: Improve sweepEphemeral polling and reliability
const oldSweep = `  // Wait for the Arcium callback to finalize its token transfers
  // The SDK withdraw() await blocks until callback, but RPC state can lag by a slot
  await new Promise(r => setTimeout(r, 4000));

  const tx = new Transaction();
  let tokenBalance = 0n;

  if (token !== "SOL") {
    const mintPubkey = new PublicKey(TOKEN_CONFIG[token].mint);
    const ephemeralAta = getAssociatedTokenAddressSync(mintPubkey, ephemeralPubkey, true);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);

    // Poll until the token balance appears in the ephemeral ATA
    for (let i = 0; i < 5; i++) {
      try {
        const balanceInfo = await connection.getTokenAccountBalance(ephemeralAta, "confirmed");
        tokenBalance = BigInt(balanceInfo.value.amount);
        if (tokenBalance > 0n) break;
      } catch (e) {
        // ATA might not exist or balance is 0
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (tokenBalance > 0n) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          ephemeralPubkey, // payer
          recipientAta,    // ata
          recipientPubkey, // owner
          mintPubkey       // mint
        ),
        createTransferInstruction(
          ephemeralAta,
          recipientAta,
          ephemeralPubkey,
          tokenBalance
        ),
        // Close the ephemeral ATA to recover the 0.002 SOL rent
        createCloseAccountInstruction(
          ephemeralAta,
          recipientPubkey,
          ephemeralPubkey
        )
      );
    }
  }

  // Next, sweep all remaining SOL (including the recovered rent).
  // We need the latest blockhash to compute the exact network fee.
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = ephemeralPubkey;

  let solBalance = 0;
  for (let i = 0; i < 5; i++) {
    solBalance = await connection.getBalance(ephemeralPubkey, "confirmed");
    // If it's a SOL link, the callback unwrapped the wSOL, so we expect a large balance
    if (token === "SOL" && solBalance > 20000000) break;
    // If it's USDC, we just need the rent buffer which is > 0
    if (token !== "SOL" && solBalance > 0) break;
    await new Promise(r => setTimeout(r, 3000));
  }`;

const newSweep = `  // Wait for the Arcium callback to finalize its token transfers
  const tx = new Transaction();
  let tokenBalance = 0n;
  
  // Record initial SOL balance before we wait, to detect when funds arrive
  const initialSolBalance = await connection.getBalance(ephemeralPubkey, "confirmed");

  console.log(\`[sweep] Initial SOL balance: \${initialSolBalance}\`);

  if (token !== "SOL") {
    const mintPubkey = new PublicKey(TOKEN_CONFIG[token].mint);
    const ephemeralAta = getAssociatedTokenAddressSync(mintPubkey, ephemeralPubkey, true);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);

    // Poll up to 30 times (90 seconds) for the tokens to arrive
    for (let i = 0; i < 30; i++) {
      try {
        const balanceInfo = await connection.getTokenAccountBalance(ephemeralAta, "confirmed");
        tokenBalance = BigInt(balanceInfo.value.amount);
        if (tokenBalance > 0n) {
          console.log(\`[sweep] Found \${tokenBalance} tokens in ATA after \${i * 3}s\`);
          break;
        }
      } catch (e) {
        // ATA might not exist or balance is 0
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (tokenBalance > 0n) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          ephemeralPubkey, // payer
          recipientAta,    // ata
          recipientPubkey, // owner
          mintPubkey       // mint
        ),
        createTransferInstruction(
          ephemeralAta,
          recipientAta,
          ephemeralPubkey,
          tokenBalance
        ),
        createCloseAccountInstruction(
          ephemeralAta,
          recipientPubkey,
          ephemeralPubkey
        )
      );
    }
  }

  // Next, sweep all remaining SOL
  let solBalance = initialSolBalance;
  for (let i = 0; i < 30; i++) {
    solBalance = await connection.getBalance(ephemeralPubkey, "confirmed");
    // If it's a SOL link, wait for balance to significantly increase vs initial
    if (token === "SOL" && solBalance > initialSolBalance + 1000000) {
      console.log(\`[sweep] Found incoming SOL after \${i * 3}s (balance: \${solBalance})\`);
      break;
    }
    // If it's a token link, we just sweep the rent, but we already waited for the token ATA above
    if (token !== "SOL") break;
    
    await new Promise(r => setTimeout(r, 3000));
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = ephemeralPubkey;`;

if (!code.includes(oldSweep.substring(0, 100))) {
    console.error("Could not find oldSweep in src/lib/umbra.ts");
    process.exit(1);
}

code = code.replace(oldSweep, newSweep);

// Increase the wait interval for withdrawal
code = code.replace(
  /await new Promise\(r => setTimeout\(r, 5000\)\);\n\s+\}\n\s+\}\n\s+if \(\!withdrawResult\) throw new Error\("Withdrawal failed after retries\."\);/,
  `await new Promise(r => setTimeout(r, 8000));
      }
    }
    
    if (!withdrawResult) throw new Error("Withdrawal failed: RPC did not sync the encrypted balance in time.");`
);

fs.writeFileSync("src/lib/umbra.ts", code);
console.log("Successfully patched src/lib/umbra.ts");
