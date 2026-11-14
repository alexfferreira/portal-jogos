// Gera os ícones do PWA e o manifest a partir de `apps/portal/brand.json`.
// Sem arte externa: o ícone é um SVG desenhado aqui (tubos de ensaio coloridos sobre o azul do
// tema) e renderizado com o Chromium do Playwright, que já é dependência dos testes.
//
// Uso: pnpm icons   (depois de `pnpm exec playwright install chromium`)
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const portal = join(root, 'apps', 'portal');
const outDir = join(portal, 'static');
const brand = JSON.parse(await readFile(join(portal, 'brand.json'), 'utf8'));

/**
 * Desenha o ícone em um quadrado de 512 unidades.
 * - `full`: fundo de ponta a ponta (maskable e apple-touch-icon: o sistema recorta/arredonda).
 * - sem `full`: fundo de cantos arredondados sobre transparente (ícones "any" e favicon).
 * Os tubos ficam dentro da zona segura dos ícones maskable (círculo de 80% do lado).
 */
function iconSvg({ full, scale }) {
  const [top, bottom] = brand.iconBackground;
  const liquids = brand.iconLiquids;
  const tubeW = 76;
  const gap = 22;
  const tubeH = 236;
  const r = tubeW / 2;
  const n = 3;
  const totalW = n * tubeW + (n - 1) * gap;
  const x0 = (512 - totalW) / 2;
  const y0 = (512 - tubeH) / 2 + 6;
  // Camadas de líquido (de baixo para cima), uma lista por tubo; o último tubo fica vazio em cima.
  const fills = [
    [liquids[0], liquids[1], liquids[2]],
    [liquids[3], liquids[4], liquids[1]],
    [liquids[2], liquids[0]],
  ];
  const layerH = 58;
  let defs = '';
  let body = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (tubeW + gap);
    // Tubo aberto em cima, fundo redondo.
    const d = `M${x} ${y0} V${y0 + tubeH - r} A${r} ${r} 0 0 0 ${x + tubeW} ${y0 + tubeH - r} V${y0}`;
    const closed = `${d} Z`;
    defs += `<clipPath id="c${i}"><path d="${closed}"/></clipPath>`;
    let layers = '';
    fills[i].forEach((color, k) => {
      const h = k === 0 ? layerH + r : layerH;
      const y = k === 0 ? y0 + tubeH - layerH - r : y0 + tubeH - r - layerH * (k + 1);
      layers += `<rect x="${x}" y="${y}" width="${tubeW}" height="${h}" fill="${color}"/>`;
    });
    body +=
      `<g clip-path="url(#c${i})">` +
      `<rect x="${x}" y="${y0}" width="${tubeW}" height="${tubeH}" fill="#ffffff" fill-opacity="0.28"/>` +
      layers +
      `<rect x="${x + 12}" y="${y0 + 14}" width="10" height="${tubeH - 60}" rx="5" fill="#ffffff" fill-opacity="0.55"/>` +
      `</g>` +
      `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const bg = full
    ? `<rect width="512" height="512" fill="url(#bg)"/>`
    : `<rect width="512" height="512" rx="112" fill="url(#bg)"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>` +
    `</linearGradient>${defs}</defs>` +
    bg +
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${body}</g>` +
    `</svg>`
  );
}

/** ICO com um único PNG embutido (formato aceito por todos os navegadores atuais). */
function pngToIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(1, 4); // quantidade de imagens
  header.writeUInt8(size, 6); // largura
  header.writeUInt8(size, 7); // altura
  header.writeUInt16LE(1, 10); // planos
  header.writeUInt16LE(32, 12); // bits por pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // deslocamento dos dados
  return Buffer.concat([header, png]);
}

const targets = [
  { file: 'icon-192.png', size: 192, svg: iconSvg({ full: false, scale: 1.12 }) },
  { file: 'icon-512.png', size: 512, svg: iconSvg({ full: false, scale: 1.12 }) },
  { file: 'icon-maskable-512.png', size: 512, svg: iconSvg({ full: true, scale: 1 }) },
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg({ full: true, scale: 1.05 }) },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    return page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  };
  for (const t of targets) {
    await writeFile(join(outDir, t.file), await render(t.svg, t.size));
    console.log(`gerado ${t.file} (${t.size}x${t.size})`);
  }
  const favSvg = iconSvg({ full: false, scale: 1.12 });
  await writeFile(join(outDir, 'favicon.svg'), favSvg);
  await writeFile(join(outDir, 'favicon.ico'), pngToIco(await render(favSvg, 48), 48));
  console.log('gerado favicon.svg e favicon.ico');
} finally {
  await browser.close();
}

const manifest = {
  id: '/',
  name: brand.name,
  short_name: brand.shortName,
  description: brand.description,
  lang: 'pt-BR',
  dir: 'ltr',
  // Relativos ao manifest: o build funciona em qualquer caminho de hospedagem.
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: brand.themeColor,
  background_color: brand.backgroundColor,
  categories: ['games'],
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
await writeFile(join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
console.log('gerado manifest.webmanifest');
