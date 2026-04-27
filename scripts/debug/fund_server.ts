import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const agentSecret = "4ZGgPeqEaXXL3Co3gH42EEaUA72miDAnVCSdR3jhaveyYwWiC9JpD1224j2XLjFuExSgFaqqap98cuLeHQX55B6c";
  const serverAddress = new PublicKey("GeJteRhubuj2iyaCeh29qmAvHhMvNimVkLhyuWqZP6z7");

  const b58 = (bs58 as any).default || bs58;
  const agentKeypair = Keypair.fromSecretKey(b58.decode(agentSecret));
  
  console.log(`Funding server ${serverAddress.toBase58()} with 0.05 SOL from agent...`);
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: agentKeypair.publicKey,
      toPubkey: serverAddress,
      lamports: 0.05 * 1e9,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [agentKeypair]);
  console.log("Success! Sig:", sig);
}
run();
