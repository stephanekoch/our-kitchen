// Regenerates the app icons in public/icons from one drawing (Panda Chef, option B).
// Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const TOMATO = "#B43A1E";
const art = await readFile(new URL("./icon-art.svg.txt", import.meta.url), "utf8");

const svg = (inner, { rounded, scale = 1 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512"${rounded ? ' rx="112"' : ""} fill="${TOMATO}"/>` +
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g></svg>`;

const png = (s, size, file) => sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/icons/${file}`);

await writeFile("public/icons/icon.svg", svg(art, { rounded: true })); // browser tab
await png(svg(art, { rounded: true }), 32, "icon-32.png");
await png(svg(art, { rounded: false }), 180, "apple-touch-icon.png"); // iPhone rounds the corners itself
await png(svg(art, { rounded: true }), 192, "icon-192.png");
await png(svg(art, { rounded: true }), 512, "icon-512.png");
// Android crops adaptive icons to a circle or squircle, so shrink the panda into the safe zone.
await png(svg(art, { rounded: false, scale: 0.86 }), 512, "maskable-512.png");
console.log("icons written");
