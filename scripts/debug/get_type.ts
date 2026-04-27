import { getClaimableUtxoScannerFunction } from "@umbra-privacy/sdk";

type U32 = Parameters<ReturnType<typeof getClaimableUtxoScannerFunction>>[0];
type T = Awaited<ReturnType<ReturnType<typeof getClaimableUtxoScannerFunction>>>;
type PublicReceivedUtxo = T["publicReceived"][number];

// Write it out as a dummy function to see types via tsc error
const val: PublicReceivedUtxo = {} as any;
val.missingProperty; // This will trigger an error showing available properties
