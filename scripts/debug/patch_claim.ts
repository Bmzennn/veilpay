import fs from 'fs';

let code = fs.readFileSync('src/lib/umbra.ts', 'utf8');

const regex = /\/\/\s*Re-scan to get the UTXO[\s\S]*?await sweepEphemeral\([\s\S]*?ephemeralPrivateKey,[\s\S]*?token,[\s\S]*?recipientAddress,[\s\S]*?BigInt\(utxo\.amount\.toString\(\)\)\n\s+\);/m;

const match = code.match(regex);
if (!match) {
  console.log("Could not find the target block in umbra.ts to patch.");
  process.exit(1);
}

const replacement = `// Re-scan to get the UTXO
    onStatusChange("Scanning shielded pool…");
    const scanner = getClaimableUtxoScannerFunction({ client });
    const treeIndices = await getRecentTreeIndices();
    let utxo: Awaited<ReturnType<typeof scanner>>["publicReceived"][number] | null = null;
    for (const treeIndex of treeIndices) {
      const { publicReceived } = await scanner(treeIndex as U32, 0n as U32);
      if (publicReceived.length > 0) {
        utxo = publicReceived[0];
        break;
      }
    }

    const tokenCfg = TOKEN_CONFIG[token];
    const mintAddress = tokenCfg.mint as Address;
    
    // Fast-path recovery check: Did the user already complete the ZK proof step?
    const querier = getEncryptedBalanceQuerierFunction({ client });
    const balanceMap = await querier([mintAddress]);
    const existingBalanceResult = balanceMap.get(mintAddress);
    const hasEncryptedBalance = existingBalanceResult?.state === "shared" && BigInt(existingBalanceResult.balance.toString()) > 0n;

    if (!utxo && !hasEncryptedBalance) {
      throw new Error("This payment link has already been claimed or does not exist.");
    }

    let originalAmountRaw = 0n;

    // If we have a UTXO, run the heavy ZK proof generation to move it into the encrypted balance
    if (utxo) {
      originalAmountRaw = BigInt(utxo.amount.toString());
      // Claim UTXO → ephemeral encrypted balance (relayer pays fees)
      onStatusChange("Breaking on-chain link…");
      const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
      const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(makeZkProverDeps());

      if (!client.fetchBatchMerkleProof) {
        throw new Error("Umbra indexer is unavailable — fetchBatchMerkleProof missing.");
      }

      const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
        { client },
        {
          fetchBatchMerkleProof: client.fetchBatchMerkleProof,
          zkProver: claimProver,
          relayer,
        }
      );
      const claimResult = await claim([utxo]);

      // Poll each batch until the ZK computation finalizes
      onStatusChange("Waiting for ZK proof verification…");
      for (const [, batch] of claimResult.batches) {
        await pollClaimUntilTerminal(
          (rid) => relayer.pollClaimStatus(rid),
          batch.requestId,
          {
            onProgress: (event) => {
              if (event.status === "submitting" || event.status === "submitted") {
                onStatusChange("ZK proof submitting on-chain…");
              } else if (event.status === "awaiting_callback" || event.status === "finalizing") {
                onStatusChange("ZK proof verifying on-chain…");
              }
            },
          }
        );
      }
      
      // We add a retry block with a generous initial delay here. The Relayer may mark
      // the ZK proof as verified, but the on-chain state might still be propagating.
      await new Promise(r => setTimeout(r, 10000)); // Initial 10s delay
    } else {
      // If we don't have a UTXO but DO have an encrypted balance, we are resuming a failed withdrawal
      onStatusChange("Resuming pending withdrawal…");
      // Since the UTXO is gone, we don't have the pre-fee original amount easily available.
      // For resumes, we will just use the current encrypted balance as the original amount
      // to ensure the full remainder gets swept to the recipient.
      originalAmountRaw = BigInt(existingBalanceResult!.balance.toString());
    }

    // Withdraw from ephemeral encrypted balance → recipient public ATA
    onStatusChange("Sending to your wallet…");
    const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });

    let withdrawResult;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        // Query the exact encrypted balance available.
        const currentBalanceMap = await querier([mintAddress]);
        const balanceResult = currentBalanceMap.get(mintAddress);

        if (!balanceResult || balanceResult.state !== "shared") {
          throw new Error("Encrypted balance not found or not in shared state.");
        }

        const availableBalance = BigInt(balanceResult.balance.toString());
        console.log(\`[withdraw] Attempt \${attempt}: Available balance is \${availableBalance}\`);
        if (availableBalance === 0n) {
          throw new Error("Encrypted balance is 0. Waiting for RPC to sync the claim...");
        }

        // Note: The Umbra SDK direct withdrawal instruction forces the destination
        // ATA to be derived from the userAddress (which here is the ephemeralSigner).
        // Therefore, we pass ephemeralSigner.address, and later sweep the funds manually.
        withdrawResult = await withdraw(
          ephemeralSigner.address as Address,
          mintAddress,
          availableBalance as any
        );
        break; // Success
      } catch (e) {
        console.warn(\`Withdrawal attempt \${attempt} failed, retrying in 8s...\`, e);
        if (attempt === 5) throw e;
        await new Promise(r => setTimeout(r, 8000));
      }
    }
    
    if (!withdrawResult) throw new Error("Withdrawal failed: RPC did not sync the encrypted balance in time.");

    // The SDK ignores destinationAddress and withdraws to the signer (ephemeral wallet).
    // We now sweep the ephemeral wallet's balance to the actual recipient.
    onStatusChange("Sweeping funds to your wallet…");
    await sweepEphemeral(
      ephemeralPrivateKey,
      token,
      recipientAddress,
      originalAmountRaw
    );`;

code = code.replace(regex, replacement);

fs.writeFileSync('src/lib/umbra.ts', code);
console.log("Successfully patched umbra.ts with smart recovery.");
