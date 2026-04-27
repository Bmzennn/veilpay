import fs from 'fs';
let code = fs.readFileSync('src/lib/x402.ts', 'utf8');

code = code.replace(
  "let aesEncryptedData: Uint8Array | null = null;\n    let optionalData: Uint8Array | null = null;",
  "let aesEncryptedData: any = null;\n    let optionalData: any = null;"
);
code = code.replace(
  "depositorX25519PubKey",
  "depositorX25519PubKey as any"
);
code = code.replace(
  "decryptor(aesKey, aesEncryptedData)",
  "decryptor(aesKey as any, aesEncryptedData)"
);

fs.writeFileSync('src/lib/x402.ts', code);
