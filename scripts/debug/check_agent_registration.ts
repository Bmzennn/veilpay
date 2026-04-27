import { Connection, PublicKey } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getUserAccountQuerierFunction } from "@umbra-privacy/sdk";
import bs58 from "bs58";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const agentAddress = "CaGuv8Hzsvu9DfBo71wAPrsvaHTXkyV7QtkF69HZndeL";
  const agentSecret = "4ZGgPeqEaXXL3Co3gH42EEaUA72miDAnVCSdR3jhaveyYwWiC9JpD1224j2XLjFuExSgFaqqap98cuLeHQX55B6c";

  const b58 = (bs58 as any).default || bs58;
  const signer = await createSignerFromPrivateKeyBytes(b58.decode(agentSecret));
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    deferMasterSeedSignature: true,
  });

  const querier = getUserAccountQuerierFunction({ client });
  const status = await querier(agentAddress as any);
  console.log("Agent Registration status:", status.state);
  if (status.state === "exists") {
      console.log("Account data:", status.data);
  }
}
run();
