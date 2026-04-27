import fs from 'fs';
let code = fs.readFileSync('src/lib/umbra.ts', 'utf8');
code = code.replace(
  "originalAmountRaw = BigInt(existingBalanceResult!.balance.toString());",
  "originalAmountRaw = BigInt((existingBalanceResult as any)!.balance.toString());"
);
fs.writeFileSync('src/lib/umbra.ts', code);
