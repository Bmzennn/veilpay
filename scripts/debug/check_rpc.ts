import { Connection } from "@solana/web3.js";
import { RPC_URL } from "../../src/lib/constants";
async function run() {
  console.log("Using RPC:", RPC_URL);
  const connection = new Connection(RPC_URL, "confirmed");
  try {
    const start = Date.now();
    const version = await connection.getVersion();
    console.log("Version:", version, `(${Date.now() - start}ms)`);
  } catch (e) {
    console.error("RPC Error:", e);
  }
}
run();
