import { CylinderGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { bottomUnitProfile, createBottomUnitGeometry } from './unitGeometry';

const RADIUS = 0.4;
const HEIGHT = 0.9;

describe('geometria da unidade do fundo do tubo', () => {
  it('o perfil acaba na lateral reta, sem tampo', () => {
    const p = bottomUnitProfile(RADIUS, HEIGHT, 8);
    const last = p[p.length - 1]!;
    expect(last.x).toBeCloseTo(RADIUS);
    expect(last.y).toBeCloseTo(HEIGHT);
    // Nenhum ponto no eixo além do fundo da base (um tampo teria um ponto em x = 0, y = altura).
    expect(p.filter((v) => v.x === 0)).toHaveLength(1);
    expect(p[0]!.x).toBe(0);
    expect(p[0]!.y).toBe(0);
  });

  it('a lateral reta tem normais horizontais (mesma luz dos segmentos de cima)', () => {
    const geo = createBottomUnitGeometry(RADIUS, HEIGHT, 8, 32);
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    let straightVertices = 0;
    for (let i = 0; i < pos.count; i++) {
      // Acima da base arredondada (y > raio) só há lateral reta.
      if (pos.getY(i) > RADIUS + 1e-6) {
        straightVertices++;
        expect(nor.getY(i)).toBeCloseTo(0, 5);
      }
    }
    expect(straightVertices).toBeGreaterThan(0);
  });

  it('as normais da lateral coincidem com as do cilindro dos segmentos do meio', () => {
    const geo = createBottomUnitGeometry(RADIUS, HEIGHT, 8, 32);
    const cyl = new CylinderGeometry(RADIUS, RADIUS, HEIGHT, 32, 1, false);
    const horizontal = (g: typeof geo | typeof cyl): number[] => {
      const nor = g.getAttribute('normal');
      const pos = g.getAttribute('position');
      const out: number[] = [];
      for (let i = 0; i < nor.count; i++) {
        // Só a lateral: normal sem componente vertical, longe do eixo.
        if (Math.abs(nor.getY(i)) < 1e-6 && Math.hypot(pos.getX(i), pos.getZ(i)) > RADIUS * 0.9) {
          out.push(Math.hypot(nor.getX(i), nor.getZ(i)));
        }
      }
      return out;
    };
    for (const length of [...horizontal(geo), ...horizontal(cyl)]) expect(length).toBeCloseTo(1, 5);
  });
});
