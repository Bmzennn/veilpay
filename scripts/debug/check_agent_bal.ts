import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const address = new PublicKey("CaGuv8Hzsvu9DfBo71wAPrsvaHTXkyV7QtkF69HZndeL");
  const sol = await connection.getBalance(address);
  console.log("SOL Balance:", sol / 1e9);
  
  const tokens = await connection.getParsedTokenAccountsByOwner(address, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
  });
  for (const t of tokens.value) {
    console.log(`Mint: ${t.account.data.parsed.info.mint} | Balance: ${t.account.data.parsed.info.tokenAmount.uiAmount}`);
  }
}
run();
