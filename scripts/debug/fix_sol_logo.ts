import fs from 'fs';

let content = fs.readFileSync('src/components/ui/TokenSelector.tsx', 'utf8');

// I'll grab the exact SVG paths for Solana and USDC from cryptologos to be completely accurate to their standard icons.
// Solana is a black circle with the green/purple gradient bars.
// USDC is a blue circle with the white dollar sign.

const exactUsdc = `function UsdcIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1000" cy="1000" r="1000" fill="#2775CA"/>
      <path d="M1276.51 1152.09C1276.51 1007.41 1184.87 957.545 1001.3 936.81C870.211 922.378 843.832 888.75 843.832 833.093C843.832 777.674 887.653 746.421 974.772 746.421C1052.48 746.421 1097.35 771.602 1118.9 835.347C1122.95 845.86 1133.04 852.793 1144.3 852.793H1199.53C1211.53 852.793 1221.57 842.923 1221.36 830.932C1216.59 713.882 1132.88 630.906 979.799 611.168V553.864C979.799 539.566 968.212 527.979 953.914 527.979H901.748C887.45 527.979 875.863 539.566 875.863 553.864V613.689C743.829 634.821 662.348 720.613 662.348 837.241C662.348 984.774 755.972 1039.38 937.199 1060.78C1064.6 1076.2 1092.17 1111.45 1092.17 1167.31C1092.17 1225.26 1045.74 1256.78 954.912 1256.78C859.98 1256.78 814.73 1227.18 791.758 1162.77C788.169 1152.09 778.077 1144.89 766.726 1144.89H710.222C698.118 1144.89 688.046 1154.94 688.384 1167.04C694.022 1289.47 782.909 1374.32 875.863 1391.24V1449.6C875.863 1463.9 887.45 1475.49 901.748 1475.49H953.914C968.212 1475.49 979.799 1463.9 979.799 1449.6V1389.28C1113.88 1369.34 1276.51 1290.87 1276.51 1152.09Z" fill="white"/>
      <path d="M1294.07 1515.2C1111.97 1696.53 816.279 1695.53 635.434 1512.98C624.408 1501.85 606.335 1502.04 595.49 1513.39C586.208 1523.1 586.43 1538.3 596.028 1547.78C805.696 1754.89 1146.03 1756.2 1356.59 1549.91C1365.99 1540.68 1366.13 1525.68 1356.9 1516.25C1345.98 1505.11 1328.09 1505.02 1317.06 1515.96L1294.07 1515.2Z" fill="white"/>
      <path d="M1362.59 459.728C1151.78 253.948 812.578 254.497 602.827 461.502C593.446 470.764 593.266 485.922 602.43 495.244C613.311 506.31 631.339 506.278 642.308 495.457C823.125 315.656 1117.82 315.112 1299.72 494.278C1310.66 505.155 1328.61 505.076 1339.42 494.043C1348.64 484.648 1348.56 469.314 1339.26 460.06L1362.59 459.728Z" fill="white"/>
    </svg>
  );
}`;

const exactSol = `function SolanaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="128" fill="black"/>
      <path d="M54.805 180.081C53.5283 182.292 55.122 185.068 57.6698 185.068H204.331C206.879 185.068 208.156 182.029 206.357 180.231L200.285 174.135C199.887 173.733 199.345 173.509 198.778 173.509H51.8687C49.2818 173.509 48.031 176.685 49.9189 178.455L54.805 180.081Z" fill="url(#paint0_linear)"/>
      <path d="M52.5358 129.758C49.99 129.758 48.7131 126.685 50.5134 124.884L56.5861 118.788C56.9845 118.386 57.5269 118.162 58.0938 118.162H205.003C207.59 118.162 208.84 121.338 206.953 123.108L202.066 124.781C203.343 122.569 201.75 119.794 199.202 119.794H52.5358V129.758Z" fill="url(#paint1_linear)"/>
      <path d="M54.805 80.6865C53.5283 82.8972 55.122 85.6732 57.6698 85.6732H204.331C206.879 85.6732 208.156 82.6335 206.357 80.8354L200.285 74.7397C199.887 74.3377 199.345 74.1137 198.778 74.1137H51.8687C49.2818 74.1137 48.031 77.2897 49.9189 79.0594L54.805 80.6865Z" fill="url(#paint2_linear)"/>
      <defs>
        <linearGradient id="paint0_linear" x1="161.916" y1="173.509" x2="78.136" y2="193.931" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="paint1_linear" x1="161.916" y1="118.162" x2="78.136" y2="138.583" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="paint2_linear" x1="161.916" y1="74.1137" x2="78.136" y2="94.5356" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}`;

content = content.replace(/function UsdcIcon\(\{\s*size = 32\s*\}\:\s*\{\s*size\?\:\s*number\s*\}\) \{[\s\S]*?\}\s*\}/, exactUsdc);
content = content.replace(/function SolanaIcon\(\{\s*size = 32\s*\}\:\s*\{\s*size\?\:\s*number\s*\}\) \{[\s\S]*?\}\s*\}/, exactSol);

fs.writeFileSync('src/components/ui/TokenSelector.tsx', content);
