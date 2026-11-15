/**
 * Seno e cosseno inteiros (escala 10000), com tabela embutida.
 * Nada de `Math.sin/cos`: o resultado precisa ser idêntico em qualquer motor JavaScript
 * (o gerador roda no Worker do celular e os testes no Node).
 */
export const TRIG_SCALE = 10000;

/** `sin(d)` × 10000, arredondado, de d = 0 a 90. */
const SIN_0_90: readonly number[] = [
  0, 175, 349, 523, 698, 872, 1045, 1219, 1392, 1564, 1736, 1908, 2079, 2250, 2419, 2588, 2756,
  2924, 3090, 3256, 3420, 3584, 3746, 3907, 4067, 4226, 4384, 4540, 4695, 4848, 5000, 5150, 5299,
  5446, 5592, 5736, 5878, 6018, 6157, 6293, 6428, 6561, 6691, 6820, 6947, 7071, 7193, 7314, 7431,
  7547, 7660, 7771, 7880, 7986, 8090, 8192, 8290, 8387, 8480, 8572, 8660, 8746, 8829, 8910, 8988,
  9063, 9135, 9205, 9272, 9336, 9397, 9455, 9511, 9563, 9613, 9659, 9703, 9744, 9781, 9816, 9848,
  9877, 9903, 9925, 9945, 9962, 9976, 9986, 9994, 9998, 10000,
];

/** Leva qualquer inteiro para 0..359. */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Seno de `d` (0..359 já normalizado) por simetria dos quadrantes. */
function sinNormalized(d: number): number {
  if (d <= 90) return SIN_0_90[d] as number;
  if (d <= 180) return SIN_0_90[180 - d] as number;
  if (d <= 270) return -(SIN_0_90[d - 180] as number);
  return -(SIN_0_90[360 - d] as number);
}

/** Seno × 10000 (inteiro) de `deg` graus inteiros. */
export function sin(deg: number): number {
  return sinNormalized(normalizeAngle(deg));
}

/** Cosseno × 10000 (inteiro) de `deg` graus inteiros. */
export function cos(deg: number): number {
  return sinNormalized(normalizeAngle(deg + 90));
}
