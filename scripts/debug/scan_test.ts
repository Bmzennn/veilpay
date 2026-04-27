import { getUmbraClient, createSignerFromPrivateKeyBytes, getClaimableUtxoScannerFunction } from "@umbra-privacy/sdk";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

async function run() {
  const secret = bs58.decode("4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK");
  const kp = Keypair.fromSeed(secret.length === 32 ? secret : secret.slice(0, 32));
  const signer = await createSignerFromPrivateKeyBytes(kp.secretKey);
  const client = await getUmbraClient({
      signer,
      network: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
      rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
      indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
      deferMasterSeedSignature: true,
  });
  
  const scanner = getClaimableUtxoScannerFunction({ client });
  // Just scan tree 0
  const result = await scanner(0n as any, 0n as any);
  console.log("Public received count:", result.publicReceived.length);
  if (result.publicReceived.length > 0) {
    console.log(result.publicReceived[0]);
  }
}
run();
