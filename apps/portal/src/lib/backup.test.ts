import { describe, expect, it } from 'vitest';
import { backupFilename, readJsonFile } from './backup';

describe('backup', () => {
  it('nome do arquivo usa a data local com zeros à esquerda', () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe('recreio-backup-2026-01-05.json');
    expect(backupFilename(new Date(2026, 10, 14))).toBe('recreio-backup-2026-11-14.json');
  });

  it('readJsonFile devolve o objeto, ou undefined se não for JSON', async () => {
    expect(await readJsonFile(new File(['{"a":1}'], 'x.json'))).toEqual({ a: 1 });
    expect(await readJsonFile(new File(['isso não é json'], 'x.json'))).toBeUndefined();
  });
});
