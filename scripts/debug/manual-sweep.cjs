const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} = require("@solana/spl-token");
const bs58 = require("bs58");

const SECRET = "BpDiSnwKHwzcpbQDgs7ShLTfGaN1kfPDXZ5aN7a9EwzT";
const RECIPIENT = "9zR7oowavLh3zH53Tp9GxaUwV5C48tmeUeuvGMxqCcvN";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function run() {
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const seed = (bs58.default || bs58).decode(SECRET).slice(0, 32);
  const ephemeralKeypair = Keypair.fromSeed(seed);
  const ephemeralPubkey = ephemeralKeypair.publicKey;
  const recipientPubkey = new PublicKey(RECIPIENT);

  console.log(`Ephemeral: ${ephemeralPubkey.toString()}`);
  console.log(`Recipient: ${recipientPubkey.toString()}`);

  const { blockhash } = await connection.getLatestBlockhash();

  // STEP 1: Sweep USDC
  const mintPubkey = new PublicKey(USDC_MINT);
  const ephemeralAta = getAssociatedTokenAddressSync(mintPubkey, ephemeralPubkey);
  const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

  const tokenTx = new Transaction();
  try {
    const info = await connection.getTokenAccountBalance(ephemeralAta);
    const amount = info.value.amount;
    if (BigInt(amount) > 0n) {
      console.log(`Found ${info.value.uiAmount} USDC. Sweeping token...`);
      tokenTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          ephemeralPubkey,
          recipientAta,
          recipientPubkey,
          mintPubkey
        ),
        createTransferInstruction(ephemeralAta, recipientAta, ephemeralPubkey, BigInt(amount)),
        createCloseAccountInstruction(ephemeralAta, recipientPubkey, ephemeralPubkey)
      );
      tokenTx.recentBlockhash = blockhash;
      tokenTx.feePayer = ephemeralPubkey;
      tokenTx.sign(ephemeralKeypair);
      const sig = await connection.sendRawTransaction(tokenTx.serialize());
      console.log(`Token sweep submitted: ${sig}`);
      await connection.confirmTransaction(sig);
      console.log("✅ Token sweep confirmed!");
    }
  } catch (e) {
    console.log("No USDC found or already swept.");
  }

  // STEP 2: Sweep remaining SOL
  const solTx = new Transaction();
  const balance = await connection.getBalance(ephemeralPubkey);
  console.log(`Remaining SOL balance: ${balance / LAMPORTS_PER_SOL} SOL.`);

  const fee = 5000;
  const lamportsToSweep = balance - fee;
  
  if (lamportsToSweep > 0) {
    console.log(`Sweeping ${lamportsToSweep / LAMPORTS_PER_SOL} SOL...`);
    solTx.add(
      SystemProgram.transfer({
        fromPubkey: ephemeralPubkey,
        toPubkey: recipientPubkey,
        lamports: lamportsToSweep,
      })
    );
    const { blockhash: bh2 } = await connection.getLatestBlockhash();
    solTx.recentBlockhash = bh2;
    solTx.feePayer = ephemeralPubkey;
    solTx.sign(ephemeralKeypair);
    const sig = await connection.sendRawTransaction(solTx.serialize());
    console.log(`SOL sweep submitted: ${sig}`);
    await connection.confirmTransaction(sig);
    console.log("✅ SOL sweep confirmed!");
  } else {
    console.log("No SOL left to sweep.");
  }
}

run().catch(console.error);
