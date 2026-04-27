import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getUserAccountQuerierFunction } from "@umbra-privacy/sdk";
import bs58 from "bs58";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const serverAddressString = "3uv92PZpiUukiroGamD2KCnGSyC1wgFYsQZxr6ZwgfUz";
  const serverSecretSeed = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";

  const b58 = (bs58 as any).default || bs58;
  const seed = b58.decode(serverSecretSeed);
  const keypair = Keypair.fromSeed(seed);
  
  const signer = await createSignerFromPrivateKeyBytes(keypair.secretKey);
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    deferMasterSeedSignature: true,
  });

  const querier = getUserAccountQuerierFunction({ client });
  const status = await querier(serverAddressString as any);
  console.log("Registration status:", status.state);
  if (status.state === "exists") {
      const data = status.data;
      console.log("Account data:");
      console.log("  isUserCommitmentRegistered:", data.isUserCommitmentRegistered);
      console.log("  isUserAccountX25519KeyRegistered:", data.isUserAccountX25519KeyRegistered);
  }
}
run();
