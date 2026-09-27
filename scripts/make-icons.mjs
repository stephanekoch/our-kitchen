// Regenerates the app icons in public/icons from one drawing. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const TOMATO = "#B43A1E";
const OAT = "#F5EFE6";

// Bowl with steam, drawn to sit inside the Android "maskable" safe circle (40% radius).
const mark = (sw) => `
  <path d="M136 256h240a120 120 0 0 1-240 0z" fill="${OAT}"/>
  <path d="M200 136c-16 22 16 40 0 62M256 136c-16 22 16 40 0 62M312 136c-16 22 16 40 0 62"
        fill="none" stroke="${OAT}" stroke-width="${sw}" stroke-linecap="round"/>`;

const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${TOMATO}"/>${mark(24)}</svg>`;
const rounded = (sw) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${TOMATO}"/>${mark(sw)}</svg>`;

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${file}`);

await writeFile("public/icons/icon.svg", rounded(28)); // browser tab
await png(rounded(40), 32, "icon-32.png"); // tab fallback, thicker steam so it survives at 32px
await png(fullBleed, 180, "apple-touch-icon.png"); // iPhone home screen (iOS rounds the corners)
await png(rounded(24), 192, "icon-192.png"); // Android / manifest
await png(rounded(24), 512, "icon-512.png");
await png(fullBleed, 512, "maskable-512.png"); // Android adaptive icon (launcher crops the shape)
console.log("icons written");
