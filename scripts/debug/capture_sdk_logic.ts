import { Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getPublicBalanceToReceiverClaimableUtxoCreatorFunction } from "@umbra-privacy/sdk";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";
import bs58 from "bs58";

const assetProvider = {
  async getAssetUrls(type: string, variant: string) {
    const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";
    const res = await fetch(`${CDN_BASE}/manifest.json`);
    const manifest: any = await res.json();
    const entry = manifest.assets[type];
    const url = variant ? entry[variant].url : entry.url;
    const fullZkeyUrl = url.startsWith("http") ? url : `${CDN_BASE}/${url}`;
    const fullWasmUrl = fullZkeyUrl.replace(/\.zkey$/i, ".wasm");
    return { zkeyUrl: fullZkeyUrl, wasmUrl: fullWasmUrl };
  }
};

async function run() {
  const agentKeypair = Keypair.generate();
  const serverKeypair = Keypair.generate();
  
  const b58 = (bs58 as any).default || bs58;
  const signer = await createSignerFromPrivateKeyBytes(agentKeypair.secretKey);
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    deferMasterSeedSignature: true,
  });

  const prover = getCreateReceiverClaimableUtxoFromPublicBalanceProver({ assetProvider, callbacks: {} });
  const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction({ client }, { zkProver: prover });

  console.log("Generating sample deposit (no broadcast)...");
  
  const invoiceId = crypto.getRandomValues(new Uint8Array(32));
  
  // This will fail because we aren't broadcasting, but it should generate the AES data first!
  try {
      // Monkey-patch the transaction forwarder to capture the data
      (client as any).transactionForwarder = {
          fireAndForget: async (tx: any) => {
              console.log("CAPTURED Transaction Message Bytes Length:", tx.messageBytes.length);
              return "mock_sig";
          }
      };

      // We need to look inside the SDK to see where it encrypts
      // Actually, I'll just check the SDK source code patterns if I can.
      console.log("Mocking complete. Just running check...");

  } catch (e) {}
}
run();
