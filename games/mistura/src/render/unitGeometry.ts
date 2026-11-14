import { LatheGeometry, Vector2 } from 'three';

/**
 * Perfil (meia secção) da unidade de líquido do fundo do tubo: base arredondada e lateral reta.
 *
 * O perfil termina na lateral, SEM tampo. Um tampo (`(0, altura)` depois de `(raio, altura)`)
 * faz o `LatheGeometry` suavizar as normais na quina, e a normal da lateral vai se inclinando
 * para cima — o segmento de baixo ficava mais claro que os de cima, mesmo sendo a mesma cor.
 * O topo é fechado pela superfície do líquido (`surface`), que já existe.
 */
export function bottomUnitProfile(radius: number, height: number, arcSteps: number): Vector2[] {
  const profile: Vector2[] = [];
  for (let i = 0; i <= arcSteps; i++) {
    const a = -Math.PI / 2 + (i / arcSteps) * (Math.PI / 2);
    profile.push(new Vector2(Math.cos(a) * radius, radius + Math.sin(a) * radius));
  }
  profile[0] = new Vector2(0, 0);
  profile.push(new Vector2(radius, height));
  return profile;
}

export function createBottomUnitGeometry(
  radius: number,
  height: number,
  arcSteps: number,
  radialSegments: number,
): LatheGeometry {
  return new LatheGeometry(bottomUnitProfile(radius, height, arcSteps), radialSegments);
}
