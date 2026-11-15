import { describe, expect, it } from 'vitest';
import { createLevel, DEFAULT_SLOT_COUNT, VEHICLE_SPECS } from './level';
import { level, veh } from './testkit';

const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);

describe('createLevel: veículos', () => {
  it('usa o índice como id e os assentos de cada tipo', () => {
    const l = level(
      [veh('car', 0, 1000, 1000, 0), veh('van', 1, 1000, 3000, 0), veh('bus', 2, 1000, 5000, 0)],
      [...zeros(4), ...Array<number>(6).fill(1), ...Array<number>(10).fill(2)],
    );
    expect(l.vehicles.map((v) => v.id)).toEqual([0, 1, 2]);
    expect(l.vehicles.map((v) => v.seats)).toEqual([4, 6, 10]);
    expect(VEHICLE_SPECS.car).toEqual({ seats: 4, length: 1200, width: 600 });
    expect(VEHICLE_SPECS.van).toEqual({ seats: 6, length: 1600, width: 700 });
    expect(VEHICLE_SPECS.bus).toEqual({ seats: 10, length: 2400, width: 800 });
  });

  it('guarda a cor real e o flag hidden', () => {
    const l = level([veh('car', 2, 1000, 1000, 0, true)], Array<number>(4).fill(2));
    expect(l.vehicles[0]).toMatchObject({ color: 2, hidden: true });
  });
});

describe('createLevel: bloqueios', () => {
  it('um carro à frente bloqueia o de trás, mas não o contrário', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], zeros(8));
    expect(l.blockers).toEqual([[1], []]);
    expect(l.obstructed).toEqual([false, false]);
  });

  it('dois carros de frente um para o outro bloqueiam-se mutuamente', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 180)], zeros(8));
    expect(l.blockers).toEqual([[1], [0]]);
  });

  it('faixas vizinhas com folga não se bloqueiam', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 1000, 1700, 0)], zeros(8));
    expect(l.blockers).toEqual([[], []]);
  });

  it('um obstáculo à frente deixa o veículo obstruído para sempre', () => {
    const l = level([veh('car', 0, 1000, 1000, 0)], zeros(4), {
      obstacles: [{ cx: 5000, cy: 1000, w: 600, h: 600, angle: 0 }],
    });
    expect(l.obstructed).toEqual([true]);
    expect(l.blockers).toEqual([[]]);
  });
});

describe('createLevel: ângulos', () => {
  it('normaliza ângulos negativos e acima de 359 para 0..359', () => {
    const l = level([veh('car', 0, 1000, 5000, -90), veh('car', 0, 5000, 5000, 450)], zeros(8));
    expect(l.vehicles.map((v) => v.angle)).toEqual([270, 90]);
    const l360 = level([veh('car', 0, 1000, 1000, 360)], zeros(4));
    expect(l360.vehicles[0]?.angle).toBe(0);
  });

  it('normaliza o ângulo dos obstáculos', () => {
    const l = level([veh('car', 0, 1000, 1000, 0)], zeros(4), {
      obstacles: [{ cx: 8000, cy: 8000, w: 600, h: 600, angle: -90 }],
    });
    expect(l.obstacles[0]?.angle).toBe(270);
  });
});

describe('createLevel: fase inválida', () => {
  it('sem veículos', () => {
    expect(() => level([], [])).toThrow(RangeError);
  });

  it('centro fora do tabuleiro', () => {
    expect(() => level([veh('car', 0, -1, 1000, 0)], zeros(4))).toThrow(RangeError);
    expect(() => level([veh('car', 0, 1000, 10001, 0)], zeros(4))).toThrow(RangeError);
  });

  it('dois carros sobrepostos no início', () => {
    expect(() =>
      level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 1500, 1000, 0)], zeros(8)),
    ).toThrow(RangeError);
  });

  it('veículo sobreposto a um obstáculo no início', () => {
    expect(() =>
      level([veh('car', 0, 1000, 1000, 0)], zeros(4), {
        obstacles: [{ cx: 1200, cy: 1000, w: 600, h: 600, angle: 0 }],
      }),
    ).toThrow(RangeError);
  });

  it('assentos de uma cor diferentes dos passageiros dela', () => {
    expect(() => level([veh('car', 0, 1000, 1000, 0)], zeros(3))).toThrow(RangeError);
    expect(() => level([veh('car', 0, 1000, 1000, 0)], zeros(5))).toThrow(RangeError);
  });

  it('cor na fila sem nenhum veículo dessa cor', () => {
    expect(() => level([veh('car', 0, 1000, 1000, 0)], [0, 0, 0, 0, 5])).toThrow(RangeError);
  });

  it('número de vagas menor que 1', () => {
    expect(() => level([veh('car', 0, 1000, 1000, 0)], zeros(4), { slotCount: 0 })).toThrow(
      RangeError,
    );
  });

  it('número não inteiro', () => {
    expect(() => level([veh('car', 0, 10.5, 1000, 0)], zeros(4))).toThrow(RangeError);
  });

  it('tabuleiro com dimensão inválida', () => {
    expect(() =>
      createLevel({
        board: { width: 0, height: 10000 },
        vehicles: [{ kind: 'car', color: 0, cx: 0, cy: 0, angle: 0 }],
        queue: zeros(4),
      }),
    ).toThrow(RangeError);
  });
});

describe('createLevel: vagas e serialização', () => {
  it('padrão de 4 vagas e respeita slotCount', () => {
    expect(DEFAULT_SLOT_COUNT).toBe(4);
    expect(level([veh('car', 0, 1000, 1000, 0)], zeros(4)).slotCount).toBe(4);
    expect(level([veh('car', 0, 1000, 1000, 0)], zeros(4), { slotCount: 5 }).slotCount).toBe(5);
  });

  it('sobrevive a JSON (Worker)', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], zeros(8), {
      obstacles: [{ cx: 8000, cy: 8000, w: 600, h: 600, angle: 45 }],
    });
    expect(JSON.parse(JSON.stringify(l))).toEqual(l);
  });
});
