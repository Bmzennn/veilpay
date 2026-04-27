import fs from 'fs';

let content = fs.readFileSync('src/components/ui/TokenSelector.tsx', 'utf8');

// I replaced `SolanaIcon` using a regex but left the `      >` hanging because the original component had it attached to the closing bracket.
// Let's fix the syntax error directly by removing the stray `      >`

content = content.replace(/}\n      >\n        <div className="w-8 h-8/g, `}\n\nconst TOKENS: {
  symbol: Token;
  name: string;
  Icon: typeof UsdcIcon;
}[] = [
  { symbol: "USDC", name: "USD Coin",  Icon: UsdcIcon },
  { symbol: "SOL",  name: "Solana",    Icon: SolanaIcon },
];

interface TokenSelectorProps {
  value: Token;
  onChange: (v: Token) => void;
}

export function TokenSelector({ value, onChange }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = TOKENS.find((t) => t.symbol === value) ?? TOKENS[0];

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-4 py-3 rounded-2xl w-full
                   bg-black/[0.04] border border-black/[0.08] hover:bg-black/[0.06]
                   transition-colors duration-200"
        whileTap={{ scale: 0.98 }}
      >
        <div className="w-8 h-8`);

fs.writeFileSync('src/components/ui/TokenSelector.tsx', content);
