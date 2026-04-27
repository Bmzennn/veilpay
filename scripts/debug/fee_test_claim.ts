import { getHardcodedClaimUtxoProtocolFeeProvider, getHardcodedClaimUtxoRelayerFeeProvider } from "@umbra-privacy/sdk";
async function run() {
  const p1 = getHardcodedClaimUtxoProtocolFeeProvider();
  console.log("Protocol:", await p1(0n));
  const p2 = getHardcodedClaimUtxoRelayerFeeProvider();
  console.log("Relayer:", await p2(0n));
}
run();
