import fs from 'fs';

let code = fs.readFileSync('src/lib/umbra.ts', 'utf8');

// 1. Update the call in claimPaymentLink
code = code.replace(
  /await sweepEphemeral\([\s\S]*?ephemeralPrivateKey,[\s\S]*?token,[\s\S]*?recipientAddress[\s\S]*?\);/g,
  `await sweepEphemeral(
      ephemeralPrivateKey,
      token,
      recipientAddress,
      BigInt(utxo.amount.toString())
    );`
);

// 2. Update the sweepEphemeral function signature
code = code.replace(
  /async function sweepEphemeral\(\s*ephemeralPrivateKey: Uint8Array,\s*token: Token,\s*recipientAddress: string\s*\): Promise<void> \{/,
  `const OVERAGE_WALLET = new PublicKey("8FQFxAZt7U3WeCZfgbcpbujYASLUQqC7rcXGQ3gSGhY1");\n\nasync function sweepEphemeral(
  ephemeralPrivateKey: Uint8Array,
  token: Token,
  recipientAddress: string,
  originalAmountRaw: bigint
): Promise<void> {`
);

// 3. Update the SOL sweeping logic
const oldSolSweep = `  // Next, sweep all remaining SOL
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
  tx.feePayer = ephemeralPubkey;

  try {
    // Add a dummy transfer to estimate the fee accurately
    const dummyTransfer = SystemProgram.transfer({
      fromPubkey: ephemeralPubkey,
      toPubkey: recipientPubkey,
      lamports: 1000,
    });
    tx.add(dummyTransfer);
    
    const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
    const fee = feeCalc.value || 5000;
    
    // Replace dummy transfer with the real sweep transfer
    tx.instructions.pop();
    const solToSend = solBalance - fee;
    if (solToSend > 0) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: ephemeralPubkey,
          toPubkey: recipientPubkey,
          lamports: solToSend,
        })
      );
    }

    if (tx.instructions.length > 0) {
      await sendAndConfirmTransaction(connection, tx, [ephemeralKeypair], { skipPreflight: false });
    }
  } catch (e) {
    console.warn("Failed to sweep remaining ephemeral SOL:", e);
    if (token === "SOL") {
      throw new Error(\`Failed to sweep SOL to your wallet: \${e instanceof Error ? e.message : String(e)}\`);
    }
  }`;

const newSolSweep = `  // Next, sweep all remaining SOL
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

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = ephemeralPubkey;

  try {
    let recipientSol = 0n;
    let overageSol = 0n;
    
    let addedRecipientTransfer = false;
    let addedOverageTransfer = false;

    // Add dummy transfers to estimate the exact network fee
    if (token === "SOL") {
      tx.add(SystemProgram.transfer({ fromPubkey: ephemeralPubkey, toPubkey: recipientPubkey, lamports: 1000 }));
      addedRecipientTransfer = true;
    }
    tx.add(SystemProgram.transfer({ fromPubkey: ephemeralPubkey, toPubkey: OVERAGE_WALLET, lamports: 1000 }));
    addedOverageTransfer = true;
    
    const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
    const fee = BigInt(feeCalc.value || 5000);
    
    // Remove the dummies
    if (addedOverageTransfer) tx.instructions.pop();
    if (addedRecipientTransfer) tx.instructions.pop();

    const totalAvailableSol = BigInt(solBalance) - fee;

    if (token === "SOL") {
      if (totalAvailableSol >= originalAmountRaw) {
        recipientSol = originalAmountRaw;
        overageSol = totalAvailableSol - originalAmountRaw;
      } else {
        recipientSol = totalAvailableSol > 0n ? totalAvailableSol : 0n;
        overageSol = 0n;
      }
    } else {
      recipientSol = 0n;
      overageSol = totalAvailableSol > 0n ? totalAvailableSol : 0n;
    }

    if (recipientSol > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: ephemeralPubkey,
          toPubkey: recipientPubkey,
          lamports: recipientSol,
        })
      );
    }

    if (overageSol > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: ephemeralPubkey,
          toPubkey: OVERAGE_WALLET,
          lamports: overageSol,
        })
      );
    }

    if (tx.instructions.length > 0) {
      await sendAndConfirmTransaction(connection, tx, [ephemeralKeypair], { skipPreflight: false });
    }
  } catch (e) {
    console.warn("Failed to sweep remaining ephemeral SOL:", e);
    if (token === "SOL") {
      throw new Error(\`Failed to sweep SOL to your wallet: \${e instanceof Error ? e.message : String(e)}\`);
    }
  }`;

if (!code.includes(oldSolSweep.substring(0, 100))) {
  console.error("Could not find old SOL sweep code");
  process.exit(1);
}

code = code.replace(oldSolSweep, newSolSweep);

fs.writeFileSync('src/lib/umbra.ts', code);
