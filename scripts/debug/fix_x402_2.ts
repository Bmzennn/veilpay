import fs from 'fs';
let code = fs.readFileSync('src/lib/x402.ts', 'utf8');

code = code.replace(
  "const depositorX25519PubKey as any = decodedAcc.x25519PublicKeyForTokenEncryption.first;",
  "const depositorX25519PubKey = decodedAcc.x25519PublicKeyForTokenEncryption.first;"
);

code = code.replace(
  "depositorX25519PubKey\n    );",
  "depositorX25519PubKey as any\n    );"
);

fs.writeFileSync('src/lib/x402.ts', code);
