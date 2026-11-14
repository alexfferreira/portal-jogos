import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const brand = JSON.parse(read('../../brand.json')) as {
  name: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
};
const manifest = JSON.parse(read('../../static/manifest.webmanifest')) as Record<
  string,
  unknown
> & {
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
};

describe('manifest do PWA', () => {
  it('segue o brand.json (rode `pnpm icons` se este teste falhar)', () => {
    expect(manifest.name).toBe(brand.name);
    expect(manifest.short_name).toBe(brand.shortName);
    expect(manifest.theme_color).toBe(brand.themeColor);
    expect(manifest.background_color).toBe(brand.backgroundColor);
  });

  it('o nome do app é o mesmo do i18n', () => {
    const core = read('../../../../packages/core/src/i18n/messages.ts');
    expect(core).toContain(`'app.name': '${brand.name}'`);
    expect(read('../app.html')).toContain(`<title>${brand.name}</title>`);
  });

  it('campos exigidos para instalar como app retrato', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();
    expect(manifest.id).toBeTruthy();
  });

  it('tem ícones 192, 512 e maskable 512, e os arquivos existem', () => {
    const find = (sizes: string, purpose: string) =>
      manifest.icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
    expect(find('192x192', 'any')).toBeDefined();
    expect(find('512x512', 'any')).toBeDefined();
    expect(find('512x512', 'maskable')).toBeDefined();
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const png = readFileSync(fileURLToPath(new URL(`../../static/${icon.src}`, import.meta.url)));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(png.readUInt32BE(16)).toBe(w);
      expect(png.readUInt32BE(20)).toBe(h);
    }
  });

  it('as cores combinam com o app.html e com o tema', () => {
    const html = read('../app.html');
    expect(html).toContain(`<meta name="theme-color" content="${brand.themeColor}"`);
    const css = readFileSync(
      fileURLToPath(new URL('../../../../packages/ui/src/theme.css', import.meta.url)),
      'utf8',
    );
    expect(css).toContain(`--bg-top: ${brand.themeColor}`);
  });

  it('o app.html liga manifest, ícones e as metas de iOS', () => {
    const html = read('../app.html');
    for (const needle of [
      'rel="manifest"',
      'rel="apple-touch-icon"',
      'rel="icon"',
      'name="apple-mobile-web-app-capable"',
      'name="apple-mobile-web-app-status-bar-style"',
      'name="mobile-web-app-capable"',
    ]) {
      expect(html).toContain(needle);
    }
  });
});
