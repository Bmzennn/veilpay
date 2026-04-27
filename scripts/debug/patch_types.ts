import fs from "fs";
let code = fs.readFileSync("src/lib/umbra.ts", "utf8");
code = code.replace(
  /availableBalance as unknown as U32/g,
  "availableBalance as unknown as U64"
);
// Make sure U64 is imported or we can just ignore it since it's an alias? 
// The SDK exports U64 type.
if (!code.includes("type U64 =")) {
    code = code.replace(
      "type U32 = Parameters<ClaimableUtxoScannerFunction>[0];",
      "type U32 = Parameters<ClaimableUtxoScannerFunction>[0];\ntype U64 = Parameters<typeof getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction>[0]['withdrawalAmount'];"
    );
}

fs.writeFileSync("src/lib/umbra.ts", code);
