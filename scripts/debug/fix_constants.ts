import fs from 'fs';

let content = fs.readFileSync('src/lib/constants.ts', 'utf8');

content = content.replace(
  /"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"/g,
  `NETWORK === "mainnet" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9"`
);

fs.writeFileSync('src/lib/constants.ts', content);
