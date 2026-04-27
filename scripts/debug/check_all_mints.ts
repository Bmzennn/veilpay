import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallets = [
    "CaGuv8Hzsvu9DfBo71wAPrsvaHTXkyV7QtkF69HZndeL",
    "CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e",
    "3uv92PZpiUukiroGamD2KCnGSyC1wgFYsQZxr6ZwgfUz"
  ];
  for (const w of wallets) {
    console.log(`Wallet: ${w}`);
    const tokens = await connection.getParsedTokenAccountsByOwner(new PublicKey(w), {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    });
    for (const t of tokens.value) {
      console.log(`  Mint: ${t.account.data.parsed.info.mint} | Balance: ${t.account.data.parsed.info.tokenAmount.uiAmount}`);
    }
  }
}
run();
