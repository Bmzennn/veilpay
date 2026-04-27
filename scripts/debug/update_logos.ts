import fs from 'fs';

let content = fs.readFileSync('src/components/ui/TokenSelector.tsx', 'utf8');

const oldUsdc = `// Official USDC logo (Circle)
function UsdcIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.234-2.194-.702-2.194-1.518s.61-1.326 1.83-1.326c1.1 0 1.71.364 2.02 1.286a.35.35 0 00.33.234h.75a.344.344 0 00.344-.352v-.04a3.04 3.04 0 00-2.73-2.49V9.826a.352.352 0 00-.352-.342h-.71a.352.352 0 00-.352.342v.916c-1.83.234-2.994 1.406-2.994 2.952 0 2.008 1.25 2.79 3.81 3.094 1.7.2 2.226.668 2.226 1.584s-.752 1.54-1.972 1.54c-1.554 0-2.11-.65-2.304-1.586a.35.35 0 00-.34-.27h-.776a.344.344 0 00-.344.352v.04c.234 1.718 1.36 2.914 3.5 3.194v.92a.352.352 0 00.352.342h.71a.352.352 0 00.352-.342v-.906c1.868-.28 3.04-1.45 3.04-3.136z"
        fill="white"
      />
    </svg>
  );
}`;

const oldSol = `// Official Solana logo (gradient bars)
function SolanaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sol-a" x1="90.91%" x2="35.49%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient id="sol-b" x1="65.58%" x2="10.05%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient id="sol-c" x1="78.02%" x2="22.3%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        d="M64.6 237.9a7.69 7.69 0 015.5-2.3H391c3.5 0 5.2 4.2 2.8 6.7l-55.6 55.6a7.69 7.69 0 01-5.5 2.3H6.1c-3.5 0-5.2-4.2-2.8-6.7z"
        fill="url(#sol-a)"
      />
      <path
        d="M64.6 18.3A7.86 7.86 0 0170.1 16H391c3.5 0 5.2 4.2 2.8 6.7l-55.6 55.6a7.69 7.69 0 01-5.5 2.3H6.1c-3.5 0-5.2-4.2-2.8-6.7z"
        fill="url(#sol-b)"
      />
      <path
        d="M333.1 127.8a7.69 7.69 0 00-5.5-2.3H6.1c-3.5 0-5.2 4.2-2.8 6.7l55.6 55.6a7.69 7.69 0 005.5 2.3H391c3.5 0 5.2-4.2 2.8-6.7z"
        fill="url(#sol-c)"
      />
    </svg>
  );
}`;

const newUsdc = `// Official USDC logo (Circle) from cryptologos.cc
function UsdcIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1000 2000C1552.28 2000 2000 1552.28 2000 1000C2000 447.715 1552.28 0 1000 0C447.715 0 0 447.715 0 1000C0 1552.28 447.715 2000 1000 2000Z" fill="#2775CA"/>
      <path d="M1276.51 1152.09C1276.51 1007.41 1184.87 957.545 1001.3 936.81C870.211 922.378 843.832 888.75 843.832 833.093C843.832 777.674 887.653 746.421 974.772 746.421C1052.48 746.421 1097.35 771.602 1118.9 835.347C1122.95 845.86 1133.04 852.793 1144.3 852.793H1199.53C1211.53 852.793 1221.57 842.923 1221.36 830.932C1216.59 713.882 1132.88 630.906 979.799 611.168V553.864C979.799 539.566 968.212 527.979 953.914 527.979H901.748C887.45 527.979 875.863 539.566 875.863 553.864V613.689C743.829 634.821 662.348 720.613 662.348 837.241C662.348 984.774 755.972 1039.38 937.199 1060.78C1064.6 1076.2 1092.17 1111.45 1092.17 1167.31C1092.17 1225.26 1045.74 1256.78 954.912 1256.78C859.98 1256.78 814.73 1227.18 791.758 1162.77C788.169 1152.09 778.077 1144.89 766.726 1144.89H710.222C698.118 1144.89 688.046 1154.94 688.384 1167.04C694.022 1289.47 782.909 1374.32 875.863 1391.24V1449.6C875.863 1463.9 887.45 1475.49 901.748 1475.49H953.914C968.212 1475.49 979.799 1463.9 979.799 1449.6V1389.28C1113.88 1369.34 1276.51 1290.87 1276.51 1152.09Z" fill="white"/>
      <path d="M1294.07 1515.2C1111.97 1696.53 816.279 1695.53 635.434 1512.98C624.408 1501.85 606.335 1502.04 595.49 1513.39C586.208 1523.1 586.43 1538.3 596.028 1547.78C805.696 1754.89 1146.03 1756.2 1356.59 1549.91C1365.99 1540.68 1366.13 1525.68 1356.9 1516.25C1345.98 1505.11 1328.09 1505.02 1317.06 1515.96L1294.07 1515.2Z" fill="white"/>
      <path d="M1362.59 459.728C1151.78 253.948 812.578 254.497 602.827 461.502C593.446 470.764 593.266 485.922 602.43 495.244C613.311 506.31 631.339 506.278 642.308 495.457C823.125 315.656 1117.82 315.112 1299.72 494.278C1310.66 505.155 1328.61 505.076 1339.42 494.043C1348.64 484.648 1348.56 469.314 1339.26 460.06L1362.59 459.728Z" fill="white"/>
    </svg>
  );
}`;

const newSol = `// Official Solana logo from cryptologos.cc
function SolanaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1000" cy="1000" r="1000" fill="black"/>
      <path d="M428.649 1406.87C418.528 1424.4 431.189 1446.42 451.408 1446.42H1615.71C1635.91 1446.42 1646.06 1422.02 1631.78 1407.72L1583.57 1359.35C1580.41 1356.17 1576.11 1354.39 1571.61 1354.39H405.344C384.814 1354.39 374.887 1379.6 389.871 1393.63L428.649 1406.87Z" fill="url(#paint0_linear)"/>
      <path d="M410.64 1007.49C390.435 1007.49 380.298 983.1 394.572 968.802L442.784 920.433C445.945 917.251 450.247 915.474 454.747 915.474H1621C1641.53 915.474 1651.46 940.686 1636.48 954.717L1597.7 967.954C1607.82 950.418 1595.16 928.397 1574.94 928.397H410.64V1007.49Z" fill="url(#paint1_linear)"/>
      <path d="M428.649 617.925C418.528 635.461 431.189 657.482 451.408 657.482H1615.71C1635.91 657.482 1646.06 633.082 1631.78 618.784L1583.57 570.415C1580.41 567.234 1576.11 565.457 1571.61 565.457H405.344C384.814 565.457 374.887 590.669 389.871 604.699L428.649 617.925Z" fill="url(#paint2_linear)"/>
      <defs>
        <linearGradient id="paint0_linear" x1="1268.04" y1="1354.39" x2="603.208" y2="1516.48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="paint1_linear" x1="1268.04" y1="915.474" x2="603.208" y2="1077.56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="paint2_linear" x1="1268.04" y1="565.457" x2="603.208" y2="727.545" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/>
          <stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}`;

content = content.replace(oldUsdc, newUsdc);
content = content.replace(oldSol, newSol);

fs.writeFileSync('src/components/ui/TokenSelector.tsx', content);
