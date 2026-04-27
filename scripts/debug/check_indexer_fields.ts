import { ReadServiceClient } from "@umbra-privacy/indexer-read-service-client";
async function run() {
  const readClient = new ReadServiceClient({ endpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com" });
  const stats = await readClient.getStats();
  if (stats.latest_absolute_index === null) return;
  const res = await readClient.getUtxoData({ start: stats.latest_absolute_index, end: stats.latest_absolute_index, limit: 1n });
  if (res.items.length > 0) {
    console.log(Object.keys(res.items[0]));
    console.log(res.items[0]);
  }
}
run();
