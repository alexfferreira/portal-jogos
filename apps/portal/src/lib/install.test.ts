import { describe, expect, it } from 'vitest';
import { installMode, type InstallEnv } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile';

const env = (over: Partial<InstallEnv>): InstallEnv => ({
  userAgent: ANDROID,
  standalone: false,
  hasPrompt: false,
  dismissed: false,
  ...over,
});

describe('installMode', () => {
  it('Android com prompt nativo oferece instalar', () => {
    expect(installMode(env({ hasPrompt: true }))).toBe('prompt');
  });

  it('iPhone recebe a instrução de Compartilhar', () => {
    expect(installMode(env({ userAgent: IPHONE }))).toBe('ios');
  });

  it('já instalado ou dispensado não mostra nada', () => {
    expect(installMode(env({ hasPrompt: true, standalone: true }))).toBe('none');
    expect(installMode(env({ userAgent: IPHONE, dismissed: true }))).toBe('none');
  });

  it('Android sem prompt (ainda) não mostra nada', () => {
    expect(installMode(env({}))).toBe('none');
  });
});
