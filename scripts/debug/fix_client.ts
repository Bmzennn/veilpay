import fs from 'fs';
let code = fs.readFileSync('src/lib/x402-client.ts', 'utf8');

code = code.replace(
  'import { getCreatePublicStealthPoolDepositInputBufferProver } from "@umbra-privacy/web-zk-prover";',
  ''
);

code = code.replace(
  'const zkProver = getCreatePublicStealthPoolDepositInputBufferProver(makeZkProverDeps());\n  const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction(\n    { client },\n    { zkProver }\n  );',
  'const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client }, {});'
);

code = code.replace(
  'console.log(`  Proof TX: ${depositResult.createProofAccountSignature}`);\n  console.log(`  Deposit TX: ${depositResult.depositSignature}`);',
  'console.log(`  Deposit TX: ${depositResult.queueSignature}`);'
);

code = code.replace(
  'retryHeaders.set("Authorization", `x402 ${depositResult.createProofAccountSignature}:${depositResult.depositSignature}:${invoice.invoiceId}`);',
  'retryHeaders.set("Authorization", `x402 ${depositResult.queueSignature}:${depositResult.queueSignature}:${invoice.invoiceId}`); // The Direct deposit only produces one signature!'
);

fs.writeFileSync('src/lib/x402-client.ts', code);
