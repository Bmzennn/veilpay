import { ReadServiceClient } from "@umbra-privacy/indexer-read-service-client";
async function run() {
    const client = new ReadServiceClient({ endpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com" });
    try {
        console.log("Calling getStats...");
        const stats = await client.getStats();
        console.log("Stats:", stats);
        
        console.log("Calling getUtxoData...");
        const data = await client.getUtxoData({ start: 0n, end: 1n, limit: 1n });
        console.log("Data:", data.items.length);
    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.stack) console.error(e.stack);
    }
}
run();
