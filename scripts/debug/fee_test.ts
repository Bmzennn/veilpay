import { getHardcodedWithdrawalProtocolFeeProvider } from "@umbra-privacy/sdk";
async function run() {
  const provider = getHardcodedWithdrawalProtocolFeeProvider();
  console.log(await provider(0n));
  console.log(await provider(10000000000n));
}
run();
