import fs from "fs";
let code = fs.readFileSync("src/lib/umbra.ts", "utf8");
code = code.replace(
  "availableBalance as unknown as U64",
  "availableBalance as any"
);

fs.writeFileSync("src/lib/umbra.ts", code);
