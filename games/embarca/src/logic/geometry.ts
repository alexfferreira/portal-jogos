import { cos, sin, TRIG_SCALE } from './trig';

/**
 * Retângulo girado, tudo inteiro (milésimos e graus). `hl` é o meio-comprimento ao longo de
 * `angle` e `hw` a meia-largura (perpendicular).
 */
export interface Rect {
  readonly cx: number;
  readonly cy: number;
  readonly hl: number;
  readonly hw: number;
  readonly angle: number;
}

/** Raio do retângulo projetado no eixo (ax, ay) (escala 10⁴), em escala 10⁸ × milésimos. */
function radiusOn(r: Rect, ax: number, ay: number): number {
  const c = cos(r.angle);
  const s = sin(r.angle);
  return r.hl * Math.abs(ax * c + ay * s) + r.hw * Math.abs(-ax * s + ay * c);
}

/**
 * Sobreposição pelo teste dos eixos separadores, só com inteiros. É estrita: encostar
 * (distância zero) não conta como sobrepor.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const axes: [number, number][] = [
    [cos(a.angle), sin(a.angle)],
    [-sin(a.angle), cos(a.angle)],
    [cos(b.angle), sin(b.angle)],
    [-sin(b.angle), cos(b.angle)],
  ];
  for (const [ax, ay] of axes) {
    const distance = Math.abs(dx * ax + dy * ay) * TRIG_SCALE;
    if (distance >= radiusOn(a, ax, ay) + radiusOn(b, ax, ay)) return false;
  }
  return true;
}

/**
 * O retângulo que `r` varre ao andar `distance` (inteiro par, > 0) na direção de `angle`:
 * mesma largura, comprimento estendido e centro deslocado para a frente.
 */
export function sweepRect(r: Rect, distance: number): Rect {
  const half = distance / 2;
  return {
    cx: r.cx + Math.round((half * cos(r.angle)) / TRIG_SCALE),
    cy: r.cy + Math.round((half * sin(r.angle)) / TRIG_SCALE),
    hl: r.hl + half,
    hw: r.hw,
    angle: r.angle,
  };
}
