import fs from 'fs';
let code = fs.readFileSync('scripts/test_x402_e2e.ts', 'utf8');

code = code.replace(
  /const AGENT_PRIVATE_KEY_BASE58 = ".*?"; \/\/ DUMMY/,
  `const AGENT_PRIVATE_KEY_BASE58 = process.env.AGENT_PRIVATE_KEY_BASE58 || "3Mswp1BqV2qLwH2F6kEwG4n5P7hH2vM3pL4wV1n3L7zC5tU2X1rJ2bX1qT1pK2bM3aV2cY3tK1pL1bH1nV1aG3z"; // DUMMY`
);

fs.writeFileSync('scripts/test_x402_e2e.ts', code);
