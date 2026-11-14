import type { BackupFile } from '@recreio/core';

/** Nome do arquivo de backup: `recreio-backup-2026-11-14.json`. */
export function backupFilename(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `recreio-backup-${y}-${m}-${d}.json`;
}

/** Lê o JSON de um arquivo escolhido pelo usuário. Devolve `undefined` se não for JSON. */
export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    return undefined;
  }
}

/** Baixa o backup como arquivo `.json`. */
export function downloadBackup(backup: BackupFile, now = new Date()): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
