import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2A4oesB5NuQqv2ituDNdfrRLTSbq57LLPoZXKTuNfY8hhLGNnjj9DuCJNm3QQonC9URQhpTXzdbhUo4XtcAeccig";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  for (const inner of tx!.meta!.innerInstructions!) {
    console.log("Inner for parent index:", inner.index);
    for (const ix of inner.instructions) {
      if ('parsed' in ix) {
        console.log(`  Parsed Program: ${ix.program} Type: ${ix.parsed.type} Info:`, ix.parsed.info);
      } else {
        console.log(`  Unparsed Program: ${ix.programId.toBase58()}`);
      }
    }
  }
}
run();
