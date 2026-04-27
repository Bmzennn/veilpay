import fs from "fs";

let content = fs.readFileSync(".env.local", "utf8");

content = content.replace(
  /NEXT_PUBLIC_USDC_MINT=.*/,
  "NEXT_PUBLIC_USDC_MINT=GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9"
);

fs.writeFileSync(".env.local", content);
