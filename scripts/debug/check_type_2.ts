import { getPublicBalanceToReceiverClaimableUtxoCreatorFunction } from "@umbra-privacy/sdk";
type T = ReturnType<typeof getPublicBalanceToReceiverClaimableUtxoCreatorFunction>;
type R = Awaited<ReturnType<T>>;
const val: R = {} as any;
console.log("Keys of result:", Object.keys(val));
