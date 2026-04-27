import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sender = new PublicKey("23tkn4QmiZPqU7u1bou3QpMc9w7r7FbVydL7oLER5yqn");
  const tokens = await connection.getParsedTokenAccountsByOwner(sender, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
  });
  for (const t of tokens.value) {
    console.log(`Mint: ${t.account.data.parsed.info.mint}`);
    console.log(`Balance: ${t.account.data.parsed.info.tokenAmount.uiAmount}`);
  }
}
run();
