import fs from 'fs';
let code = fs.readFileSync('src/app/api/premium-data/route.ts', 'utf8');

code = code.replace(
  /const SERVER_PRIVATE_KEY_BASE58 = "[^"]*";.*?\nconst SERVER_SOLANA_ADDRESS = "[^"]*";.*?\n/m,
  `const SERVER_PRIVATE_KEY_BASE58 = process.env.X402_SERVER_PRIVATE_KEY || "";
const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

if (!SERVER_PRIVATE_KEY_BASE58 || !SERVER_SOLANA_ADDRESS) {
  throw new Error("Missing X402_SERVER_PRIVATE_KEY or NEXT_PUBLIC_X402_SERVER_ADDRESS in environment variables.");
}
`
);

fs.writeFileSync('src/app/api/premium-data/route.ts', code);
