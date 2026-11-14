export interface PaletteColor {
  id: string;
  /** Cor base (hex sRGB). */
  hex: number;
  /** Símbolo para o modo daltônico. */
  symbol: string;
}

/**
 * Paleta global (14 cores bem distintas). Cada cor tem um símbolo
 * para o modo daltônico, usado por todos os jogos.
 */
export const PALETTE: readonly PaletteColor[] = [
  { id: 'red', hex: 0xe53935, symbol: '●' },
  { id: 'orange', hex: 0xfb8c00, symbol: '▲' },
  { id: 'yellow', hex: 0xfdd835, symbol: '■' },
  { id: 'lime', hex: 0x9ccc3c, symbol: '◆' },
  { id: 'green', hex: 0x1e9e4a, symbol: '★' },
  { id: 'teal', hex: 0x00acc1, symbol: '✚' },
  { id: 'blue', hex: 0x1e63e0, symbol: '▼' },
  { id: 'navy', hex: 0x3f2ea8, symbol: '♥' },
  { id: 'purple', hex: 0x9c27b0, symbol: '☾' },
  { id: 'pink', hex: 0xf06ca8, symbol: '✿' },
  { id: 'brown', hex: 0x7a4a2a, symbol: '✖' },
  { id: 'gray', hex: 0x8d99a6, symbol: '◐' },
  { id: 'charcoal', hex: 0x2f3640, symbol: '♣' },
  { id: 'sky', hex: 0x6ecbf5, symbol: '✦' },
] as const;

export function paletteColor(index: number): PaletteColor {
  const color = PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
  return color as PaletteColor;
}
