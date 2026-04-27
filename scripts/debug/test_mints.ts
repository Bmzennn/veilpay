import { fetchRelayerSupportedMints } from "./src/lib/solana";
async function run() {
  const mints = await fetchRelayerSupportedMints();
  console.log("Supported mints:", mints);
}
run();
