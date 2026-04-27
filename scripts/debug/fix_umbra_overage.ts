import fs from 'fs';
let code = fs.readFileSync('src/lib/umbra.ts', 'utf8');

code = code.replace(
  /const OVERAGE_WALLET = new PublicKey\("[^"]*"\);/,
  `const OVERAGE_WALLET = new PublicKey(process.env.NEXT_PUBLIC_OVERAGE_WALLET ?? "8FQFxAZt7U3WeCZfgbcpbujYASLUQqC7rcXGQ3gSGhY1");`
);

fs.writeFileSync('src/lib/umbra.ts', code);
