// Renders every favicon/app icon and the social preview from public/favicon.svg and public/logo.svg.
// Run from web/: node scripts/gen-icons.mjs   (needs sharp: npm i -D sharp)
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const pub = (f) => new URL(`../public/${f}`, import.meta.url)
const tile = readFileSync(pub('favicon.svg')) // the mark on a navy tile
const mark = readFileSync(pub('logo.svg')) // the bare mark, transparent

const png = (size, svg = tile) => sharp(svg, { density: Math.max(72, (size / 850) * 72 * 4) }).resize(size, size).png().toBuffer()

// Maskable / Apple icons: full-bleed navy, mark inside the 80% safe zone.
const onNavy = async (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: '#0A1A3A' } })
    .composite([{ input: await png(Math.round(size * 0.62), mark), gravity: 'center' }])
    .png()
    .toBuffer()

/** ICO container holding PNG images (supported by every browser since IE Vista-era). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const dir = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...dir, ...images.map((i) => i.data)])
}

const markBody = mark.toString().replace(/<\/?svg[^>]*>/g, '')
const og = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F6F7F9"/>
  <rect x="0" y="0" width="1200" height="6" fill="#1A56DB"/>
  <svg x="96" y="120" width="150" height="150" viewBox="238 192 850 850">${markBody}</svg>
  <text x="96" y="340" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="76" fill="#101828" letter-spacing="-2">Rangefinder</text>
  <text x="96" y="398" font-family="Inter, Arial, sans-serif" font-size="30" fill="#475467">Revenue forecasts as a range, with every change explained.</text>
  <rect x="96" y="486" width="760" height="2" fill="#E4E7EC"/>
  <rect x="236" y="478" width="440" height="18" rx="9" fill="#1A56DB" fill-opacity=".85"/>
  <circle cx="430" cy="487" r="14" fill="#1A56DB" stroke="#fff" stroke-width="5"/>
  <line x1="620" y1="462" x2="620" y2="512" stroke="#B54708" stroke-width="3" stroke-dasharray="7 6"/>
  <text x="236" y="545" font-family="Inter, Arial, sans-serif" font-size="22" fill="#667085">Worst</text>
  <text x="430" y="545" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" fill="#101828">Expected</text>
  <text x="676" y="545" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="22" fill="#667085">Best</text>
</svg>`)

const out = {
  'favicon-16x16.png': await png(16),
  'favicon-32x32.png': await png(32),
  'apple-touch-icon.png': await onNavy(180),
  'icon-192.png': await png(192),
  'icon-512.png': await png(512),
  'icon-maskable-512.png': await onNavy(512),
  'og-image.png': await sharp(og).png().toBuffer(),
}
out['favicon.ico'] = ico([
  { size: 16, data: out['favicon-16x16.png'] },
  { size: 32, data: out['favicon-32x32.png'] },
  { size: 48, data: await png(48) },
])

for (const [name, data] of Object.entries(out)) {
  writeFileSync(pub(name), data)
  console.log(`public/${name}  ${data.length.toLocaleString()} bytes`)
}
