import { describe, expect, it, vi } from 'vitest';
import { createMemoryKv } from '../storage/kv';
import { createStorage } from '../storage/storage';
import { createAudio, SOUNDS, soundDuration, type SoundName } from './audio';
import { createHaptics } from './haptics';
import { createSettings, defaultSettings, normalizeSettings } from './settings';

describe('settings', () => {
  it('normalizeSettings completa e corrige campos inválidos', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings());
    expect(
      normalizeSettings({ locale: 'xx', sfxVolume: 5, musicVolume: -1, quality: 'meh' }),
    ).toMatchObject({ locale: 'pt-BR', sfxVolume: 1, musicVolume: 0, quality: 'high' });
  });

  it('usa o idioma detectado na primeira vez', async () => {
    const s = await createSettings(createStorage(createMemoryKv()), 'es');
    expect(s.get().locale).toBe('es');
  });

  it('persiste alterações e notifica', async () => {
    const storage = createStorage(createMemoryKv());
    const s = await createSettings(storage);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ colorblind: true, locale: 'en' });
    expect(fn).toHaveBeenCalledOnce();
    await Promise.resolve();
    const again = await createSettings(storage, 'es');
    expect(again.get()).toMatchObject({ colorblind: true, locale: 'en' });
  });
});

describe('áudio', () => {
  it('todos os sons têm receita válida e curta', () => {
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      const tones = SOUNDS[name];
      expect(tones.length).toBeGreaterThan(0);
      expect(soundDuration(tones)).toBeLessThan(1.5);
      for (const t of tones) {
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(1);
        expect(t.duration).toBeGreaterThan(0);
      }
    }
  });

  it('sem AudioContext (ou sem gesto) play é silencioso e register substitui', () => {
    const audio = createAudio({ sfxVolume: 1, musicVolume: 1 });
    expect(() => audio.play('click')).not.toThrow();
    const custom = vi.fn();
    audio.register('click', custom);
    audio.play('click');
    expect(custom).toHaveBeenCalledOnce();
    audio.dispose();
  });
});

describe('haptics', () => {
  it('só vibra quando ligado e suportado', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const h = createHaptics(true);
    h.tap(20);
    expect(vibrate).toHaveBeenCalledWith(20);
    h.setEnabled(false);
    h.tap();
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('não quebra sem navigator.vibrate', () => {
    vi.stubGlobal('navigator', {});
    expect(() => createHaptics(true).tap()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
