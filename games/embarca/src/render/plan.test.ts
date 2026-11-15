import { describe, expect, it } from 'vitest';
import { applyMove, createState, generateLevel, type MoveApplied, type State } from '../logic';
import { level, scenarioLevel, veh } from '../logic/testkit';
import { computeLayout, UNIT } from './layout';
import {
  BOARD_DURATION,
  PARKED_HEADING,
  planMove,
  type MovePlan,
  type PathPoint,
  type Step,
} from './plan';

const scenario = scenarioLevel();
const layout = computeLayout(scenario);

function apply(state: State, vehicle: number): MoveApplied {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`recusada: ${r.reason}`);
  return r;
}

function ofKind<K extends Step['kind']>(plan: MovePlan, kind: K): Extract<Step, { kind: K }>[] {
  return plan.steps.filter((s): s is Extract<Step, { kind: K }> => s.kind === kind);
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('planMove: jogada aplicada', () => {
  const start = createState(scenario);
  const r = apply(start, 1); // carro cor 0: estaciona, embarca 4 e parte
  const plan = planMove(start, { vehicle: 1 }, r, layout);

  it('um drive do centro do veículo até o centro da vaga', () => {
    const drives = ofKind(plan, 'drive');
    expect(drives).toHaveLength(1);
    const d = drives[0]!;
    const car = scenario.vehicles[1]!;
    expect(dist(d.path[0]!, layout.toWorld(car.cx, car.cy))).toBeLessThan(1e-9);
    expect(dist(d.path.at(-1)!, layout.slotCenter(r.slot))).toBeLessThan(1e-9);
    expect(d.delay).toBe(0);
  });

  it('decola ao longo da seta e termina na vaga, de frente para a fila', () => {
    const d = ofKind(plan, 'drive')[0]!;
    const [from, takeoff] = d.path;
    // O carro 1 aponta para +x (0°): decola para a direita, sem sair do eixo.
    expect(takeoff!.x - from!.x).toBeGreaterThan(0.5);
    expect(takeoff!.z).toBeCloseTo(from!.z);
    expect(takeoff!.heading).toBeCloseTo(from!.heading);
    expect(d.path.at(-1)!.heading).toBeCloseTo(PARKED_HEADING);
  });

  it('o voo fica perto do enquadramento e pousa alinhado com a vaga, sem atravessar em linha reta', () => {
    let maxOut = 0;
    let maxLanding = 0;
    for (let n = 1; n <= 30; n++) {
      const g = generateLevel(n);
      const l = computeLayout(g.state.level);
      let s = createState(g.state.level);
      for (const m of g.solution) {
        const r = apply(s, m.vehicle);
        const path = ofKind(planMove(s, m, r, l), 'drive')[0]!.path;
        for (const p of path) maxOut = Math.max(maxOut, Math.abs(p.x) - l.width / 2);
        // A descida final (últimos 8 pontos): o deslocamento lateral é pequeno.
        const start = path[path.length - 9]!;
        const end = path.at(-1)!;
        maxLanding = Math.max(maxLanding, Math.abs(end.x - start.x));
        s = r.state;
      }
    }
    // Nenhum ponto a mais de 4 unidades fora do enquadramento; pouso com no máximo 0,6 de salto.
    expect(maxOut).toBeLessThan(4);
    expect(maxLanding).toBeLessThan(0.6);
  });

  it('o caminho até a vaga é suave: sem cúspide nem rebote em nenhuma jogada das fases 1 a 30', () => {
    const turn = (a: PathPoint, b: PathPoint, c: PathPoint): number => {
      const v1 = { x: b.x - a.x, z: b.z - a.z };
      const v2 = { x: c.x - b.x, z: c.z - b.z };
      const n = Math.hypot(v1.x, v1.z) * Math.hypot(v2.x, v2.z);
      if (n < 1e-9) return 0;
      return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.z * v2.z) / n)));
    };
    let worst = 0;
    let worstHeading = 0;
    for (let n = 1; n <= 30; n++) {
      const g = generateLevel(n);
      const l = computeLayout(g.state.level);
      let s = createState(g.state.level);
      for (const m of g.solution) {
        const r = apply(s, m.vehicle);
        const path = ofKind(planMove(s, m, r, l), 'drive')[0]!.path;
        for (let i = 2; i < path.length; i++) {
          worst = Math.max(worst, turn(path[i - 2]!, path[i - 1]!, path[i]!));
        }
        for (let i = 1; i < path.length; i++) {
          let dh = path[i]!.heading - path[i - 1]!.heading;
          while (dh > Math.PI) dh -= 2 * Math.PI;
          while (dh < -Math.PI) dh += 2 * Math.PI;
          worstHeading = Math.max(worstHeading, Math.abs(dh));
        }
        s = r.state;
      }
    }
    // Menos de 40° entre segmentos consecutivos e menos de 50° de giro entre pontos vizinhos.
    expect(worst).toBeLessThan((40 * Math.PI) / 180);
    expect(worstHeading).toBeLessThan((50 * Math.PI) / 180);
  });

  it('quatro embarques saem da fila para a vaga, escalonados depois do drive', () => {
    const drive = ofKind(plan, 'drive')[0]!;
    const boards = ofKind(plan, 'board');
    expect(boards).toHaveLength(4);
    boards.forEach((b, i) => {
      expect(b.passenger).toBe(i);
      expect(dist(b.from, layout.queuePoint(i))).toBeLessThan(1e-9);
      expect(dist(b.to, layout.slotCenter(0))).toBeLessThan(1e-9);
      expect(b.delay).toBeGreaterThanOrEqual(drive.duration - 1e-9);
      if (i > 0) expect(b.delay).toBeGreaterThan(boards[i - 1]!.delay);
    });
  });

  it('o veículo cheio parte depois do último embarque; total é o maior fim', () => {
    const boards = ofKind(plan, 'board');
    const departs = ofKind(plan, 'depart');
    expect(departs).toHaveLength(1);
    const lastBoardEnd = Math.max(...boards.map((b) => b.delay + b.duration));
    expect(departs[0]!.delay).toBeGreaterThanOrEqual(lastBoardEnd - 1e-9);
    const end = Math.max(...plan.steps.map((s) => s.delay + s.duration));
    expect(plan.total).toBeCloseTo(end);
  });

  it('sem embarque só há o drive', () => {
    const noBoard = planMove(
      start,
      { vehicle: 4 },
      apply(start, 4), // ônibus: a fila começa em cor 0, ninguém embarca
      layout,
    );
    expect(noBoard.steps.map((s) => s.kind)).toEqual(['drive']);
  });

  it('um ônibus com 10 embarques cabe em um tempo razoável', () => {
    let s = start;
    for (const id of [1, 0, 3, 2]) s = apply(s, id).state;
    const bus = apply(s, 4);
    expect(bus.boardings).toHaveLength(10);
    const p = planMove(s, { vehicle: 4 }, bus, layout);
    expect(p.total).toBeLessThanOrEqual(2.8);
  });

  it('é determinístico', () => {
    expect(planMove(start, { vehicle: 1 }, r, layout)).toEqual(plan);
  });

  it('BOARD_DURATION é positivo (sanidade das constantes)', () => {
    expect(BOARD_DURATION).toBeGreaterThan(0);
  });
});

describe('planMove: jogada recusada', () => {
  it('bloqueada: bate e volta, indo até o contato mesmo com o bloqueador longe', () => {
    const start = createState(scenario);
    const r = applyMove(start, { vehicle: 0 });
    if (r.ok) throw new Error('deveria recusar');
    const plan = planMove(start, { vehicle: 0 }, r, layout);
    const bumps = ofKind(plan, 'bump');
    expect(bumps).toHaveLength(1);
    expect(bumps[0]!.vehicle).toBe(0);
    expect(bumps[0]!.blockers).toEqual([1]);
    // Carro 0 em (1500,1500) e carro 1 em (6000,1500): as frentes se encontram a 3300.
    expect(bumps[0]!.forward).toBeCloseTo(3.3, 1);
    // Ida até o contato mais volta.
    expect(bumps[0]!.forwardDuration).toBeGreaterThan(0.18);
    expect(bumps[0]!.duration).toBeGreaterThan(bumps[0]!.forwardDuration);
    expect(plan.steps).toHaveLength(1);
  });

  it('o avanço do bate e volta para no contato quando o bloqueador está perto', () => {
    const l = level(
      [veh('car', 0, 1000, 1000, 0), veh('car', 0, 2700, 1000, 0)],
      Array<number>(8).fill(0),
    );
    const start = createState(l);
    const r = applyMove(start, { vehicle: 0 });
    if (r.ok) throw new Error('deveria recusar');
    const plan = planMove(start, { vehicle: 0 }, r, computeLayout(l));
    // A frente do carro 0 está em 1600 e a traseira do 1 em 2100: contato a 500 milésimos.
    expect(ofKind(plan, 'bump')[0]!.forward).toBeCloseTo(500 / UNIT);
  });

  it('sem vaga: o veículo balança no lugar', () => {
    const l = level(
      [veh('car', 0, 1000, 1000, 0), veh('car', 1, 1000, 3000, 0)],
      [...Array<number>(4).fill(1), ...Array<number>(4).fill(0)],
      { slotCount: 1 },
    );
    let s = createState(l);
    s = apply(s, 0).state;
    const r = applyMove(s, { vehicle: 1 });
    if (r.ok) throw new Error('deveria recusar');
    expect(r.reason).toBe('no-slot');
    const plan = planMove(s, { vehicle: 1 }, r, computeLayout(l));
    expect(plan.steps.map((x) => x.kind)).toEqual(['shake']);
  });

  it('veículo desconhecido: plano vazio', () => {
    const start = createState(scenario);
    const r = applyMove(start, { vehicle: 99 });
    if (r.ok) throw new Error('deveria recusar');
    expect(planMove(start, { vehicle: 99 }, r, layout)).toEqual({ steps: [], total: 0 });
  });
});
