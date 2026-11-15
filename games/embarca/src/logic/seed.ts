/**
 * Mistura de dois inteiros em uma semente de 32 bits (determinístico). Idêntica à da Mistura,
 * duplicada de propósito: sobe para o `core` quando o terceiro jogo precisar.
 */
export function mixSeed(level: number, variation: number): number {
  if (variation === 0) return level >>> 0;
  let h = (level ^ Math.imul(variation, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
