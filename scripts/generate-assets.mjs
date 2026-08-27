import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Every shape is original vector artwork. No downloaded image or sound is used.
// The OG uses system Japanese fonts. For consistent regeneration, install
// Yu Gothic / Meiryo (Windows) or Noto Sans CJK JP (Linux).
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const iconsDir = resolve(publicDir, "icons");
const fontFamily = "'Yu Gothic', 'Meiryo', 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif";

const defs = `
  <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#202328"/><stop offset=".5" stop-color="#111317"/><stop offset="1" stop-color="#090a0c"/>
  </linearGradient>
  <linearGradient id="metal" x1=".25" y1="0" x2=".7" y2="1">
    <stop stop-color="#5c6066"/><stop offset=".14" stop-color="#292c32"/><stop offset=".54" stop-color="#101216"/><stop offset=".86" stop-color="#34373d"/><stop offset="1" stop-color="#111216"/>
  </linearGradient>
  <linearGradient id="bezel" x1=".1" y1="0" x2=".8" y2="1">
    <stop stop-color="#141518"/><stop offset=".5" stop-color="#08090a"/><stop offset="1" stop-color="#4b4c50"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
    <stop stop-color="#c52428"/><stop offset=".58" stop-color="#9b1119"/><stop offset="1" stop-color="#530910"/>
  </linearGradient>
  <radialGradient id="redFace" cx=".37" cy=".22" r=".92">
    <stop stop-color="#ff6962"/><stop offset=".3" stop-color="#f34540"/><stop offset=".64" stop-color="#d52b2f"/><stop offset="1" stop-color="#ad1721"/>
  </radialGradient>
  <linearGradient id="faceRim" x1="0" y1="0" x2=".3" y2="1">
    <stop stop-color="#ffa194" stop-opacity=".85"/><stop offset=".45" stop-color="#f8746a" stop-opacity=".13"/><stop offset="1" stop-color="#f87a71" stop-opacity=".2"/>
  </linearGradient>
  <radialGradient id="shine" cx=".35" cy=".05" r=".8">
    <stop stop-color="#fff2e8" stop-opacity=".28"/><stop offset=".65" stop-color="#ffe4dd" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="redHalo">
    <stop stop-color="#ef3c3b" stop-opacity=".15"/><stop offset="1" stop-color="#e63234" stop-opacity="0"/>
  </radialGradient>
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="220%">
    <feDropShadow dx="0" dy="17" stdDeviation="17" flood-color="#000" flood-opacity=".75"/>
  </filter>
  <filter id="faceShadow" x="-40%" y="-40%" width="180%" height="200%">
    <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000" flood-opacity=".55"/>
  </filter>
`;

function buttonArtwork({ label = false } = {}) {
  const ticks = Array.from({ length: 48 }, (_, index) => {
    const angle = (index * Math.PI) / 24;
    const inner = index % 4 === 0 ? 174 : 179;
    const outer = 184;
    return `<line x1="${(256 + Math.sin(angle) * inner).toFixed(2)}" y1="${(260 - Math.cos(angle) * inner).toFixed(2)}" x2="${(256 + Math.sin(angle) * outer).toFixed(2)}" y2="${(260 - Math.cos(angle) * outer).toFixed(2)}" stroke="#9ba0a8" stroke-opacity="${index % 4 === 0 ? ".28" : ".12"}" stroke-width="1.5"/>`;
  }).join("");

  return `
    <circle cx="256" cy="266" r="232" fill="url(#redHalo)"/>
    <g filter="url(#shadow)">
      <circle cx="256" cy="264" r="189" fill="#070809"/>
      <circle cx="256" cy="260" r="189" fill="url(#metal)" stroke="#62666d" stroke-opacity=".45" stroke-width="1"/>
      ${ticks}
      <circle cx="256" cy="260" r="167" fill="url(#bezel)" stroke="#08090b" stroke-width="2"/>
      <circle cx="256" cy="260" r="151" fill="#060607"/>
    </g>
    <g filter="url(#faceShadow)">
      <rect x="111" y="240" width="290" height="34" fill="url(#edge)"/>
      <ellipse cx="256" cy="269" rx="145" ry="140" fill="url(#edge)"/>
      <circle cx="256" cy="243" r="145" fill="url(#redFace)"/>
      <circle cx="256" cy="243" r="143.8" fill="none" stroke="url(#faceRim)" stroke-width="2.4"/>
      <circle cx="256" cy="243" r="139" fill="url(#shine)"/>
      <path d="M160 151 A137 137 0 0 1 332 131" fill="none" stroke="#ffb1a5" stroke-opacity=".32" stroke-linecap="round" stroke-width="2"/>
      ${label ? `<g fill="#fff7f4" text-anchor="middle" font-family="${fontFamily}">
        <text x="256" y="236" font-size="15" font-weight="700" letter-spacing="2.3">DO NOT PRESS</text>
        <text x="256" y="264" font-size="13" font-weight="500" opacity=".78">押さないでください</text>
      </g>` : `<path d="M239 236 h34 M256 219 v34" fill="none" stroke="#fff2eb" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`}
    </g>
  `;
}

function iconSvg({ square = false, maskable = false } = {}) {
  // All essential content stays inside the central 80% safe circle; the
  // maskable variant adds another 10% margin for particularly tight masks.
  const transform = maskable ? 'translate(25.6 25.6) scale(.9)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title">
    <title id="title">後悔ボタン — 赤い実験用ボタン</title>
    <defs>${defs}</defs>
    <rect width="512" height="512" rx="${square ? 0 : 112}" fill="url(#background)"/>
    <g transform="${transform}">${buttonArtwork()}</g>
  </svg>`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>${defs}
      <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="#fff" stroke-opacity=".025" stroke-width="1"/>
      </pattern>
      <radialGradient id="ambient" cx=".75" cy=".5" r=".65">
        <stop stop-color="#4a2226" stop-opacity=".3"/><stop offset="1" stop-color="#121418" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#background)"/>
    <rect width="1200" height="630" fill="url(#grid)"/>
    <rect width="1200" height="630" fill="url(#ambient)"/>
    <path d="M56 84V56H84 M1116 56H1144V84 M1144 546V574H1116 M84 574H56V546" fill="none" stroke="#70727b" stroke-opacity=".38" stroke-width="1.2"/>
    <circle cx="86" cy="109" r="4" fill="#f04d49"/>
    <text x="104" y="114" fill="#bfc0c5" font-family="Arial, sans-serif" font-size="13" letter-spacing="3.1">REGRET RESEARCH LAB</text>
    <text x="1120" y="114" fill="#757984" font-family="Arial, sans-serif" font-size="11" letter-spacing="2" text-anchor="end">EXPERIMENT 001</text>
    <g font-family="${fontFamily}">
      <text x="79" y="292" fill="#f3f1ef" font-size="77" font-weight="700" letter-spacing="-2.5">後悔ボタン</text>
      <text x="84" y="356" fill="#c7c7ce" font-size="26" font-weight="500" letter-spacing=".1">押しても、何も起きません。</text>
      <text x="85" y="402" fill="#818590" font-size="18" letter-spacing=".3">それでも、押してしまうあなたへ。</text>
    </g>
    <path d="M86 461H131" stroke="#ea4a45" stroke-width="2"/>
    <text x="86" y="495" fill="#81858f" font-family="Arial, sans-serif" font-size="11" letter-spacing="2.4">PRESS AT YOUR OWN CURIOSITY</text>
    <g transform="translate(617 58) scale(1.08)">${buttonArtwork({ label: true })}</g>
    <circle cx="867" cy="554" r="3" fill="#e96359"/>
    <text x="881" y="558" fill="#91949c" font-family="Arial, sans-serif" font-size="10" letter-spacing="1.6">100% HARMLESS. 0% PRODUCTIVE.</text>
  </svg>`;
}

function makeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [index, { size, data }] of images.entries()) {
    const start = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, start);
    header.writeUInt8(size === 256 ? 0 : size, start + 1);
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(data.length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += data.length;
  }
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

await mkdir(iconsDir, { recursive: true });
const standardIcon = Buffer.from(iconSvg());
await writeFile(resolve(publicDir, "icon.svg"), standardIcon);
await sharp(standardIcon).resize(192, 192).png().toFile(resolve(iconsDir, "icon-192.png"));
await sharp(standardIcon).resize(512, 512).png().toFile(resolve(iconsDir, "icon-512.png"));
await sharp(Buffer.from(iconSvg({ square: true, maskable: true }))).resize(512, 512).png().toFile(resolve(iconsDir, "maskable-512.png"));
await sharp(Buffer.from(iconSvg({ square: true }))).resize(180, 180).png().toFile(resolve(iconsDir, "apple-touch-icon.png"));

const icoImages = await Promise.all([16, 32, 48, 64, 128, 256].map(async (size) => ({
  size,
  data: await sharp(standardIcon).resize(size, size).png().toBuffer(),
})));
await writeFile(resolve(publicDir, "favicon.ico"), makeIco(icoImages));
await sharp(Buffer.from(ogSvg())).png().toFile(resolve(publicDir, "og.png"));
console.log("Generated original icons, multi-size favicon, and 1200×630 OG image.");
console.log("Inspect public/og.png after regenerating to confirm Japanese font rendering.");
