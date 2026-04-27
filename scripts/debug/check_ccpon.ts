import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sender = new PublicKey("CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e");
  const tokens = await connection.getParsedTokenAccountsByOwner(sender, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
  });
  console.log(`Checking tokens for ${sender.toBase58()}...`);
  for (const t of tokens.value) {
    const info = t.account.data.parsed.info;
    if (info.tokenAmount.uiAmount > 0) {
      console.log(`Mint: ${info.mint} | Balance: ${info.tokenAmount.uiAmount}`);
    }
  }
}
run();
