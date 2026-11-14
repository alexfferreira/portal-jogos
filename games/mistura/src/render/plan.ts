/**
 * Planos de animação PUROS: dado o resultado da lógica, descrevem o que o render deve
 * mostrar. Nenhuma regra de jogo aqui; só tradução de `MoveApplied` em movimento.
 */
import type { MoveApplied, Revealed, State } from '../logic';

/** O que um tubo mostra: cores da base ao topo e quais camadas aparecem como "?". */
export interface TubeData {
  colors: number[];
  hidden: boolean[];
}

/** Dados visuais de todos os tubos de um estado lógico. */
export function viewFromState(state: State): TubeData[] {
  return state.tubes.map((tube) => ({
    colors: tube.map((u) => u.color),
    hidden: tube.map((u) => u.hidden),
  }));
}

export function sameTubeData(a: TubeData, b: TubeData): boolean {
  return (
    a.colors.length === b.colors.length &&
    a.colors.every((c, i) => c === b.colors[i] && a.hidden[i] === b.hidden[i])
  );
}

/** Duração total do despejo, em segundos (spec: 0,6–0,9 s). */
export const POUR_DURATION = 0.8;

export interface PourPlan {
  from: number;
  to: number;
  color: number;
  /** Unidades transferidas. */
  moved: number;
  /** Quantas unidades a origem tinha antes. */
  srcCount: number;
  /** Quantas unidades o destino tinha antes. */
  dstCount: number;
  /** Tubo que ficou completo (ganha tampa), ou `null`. */
  completed: number | null;
  /** Unidades que deixam de ser "?" (animar a revelação ao fim). */
  revealed: readonly Revealed[];
}

/** Traduz uma jogada válida em plano de despejo. `before` é o estado ANTES da jogada. */
export function planPour(before: State, result: MoveApplied): PourPlan {
  const { from, to } = result.move;
  return {
    from,
    to,
    color: result.color,
    moved: result.moved,
    srcCount: before.tubes[from]?.length ?? 0,
    dstCount: before.tubes[to]?.length ?? 0,
    completed: result.completed,
    revealed: result.revealed,
  };
}

/** Fração de tempo de cada fase do despejo (somam 1). */
export const POUR_PHASES = { approach: 0.28, flow: 0.44, back: 0.28 } as const;

export interface PourPhase {
  /** 0..1: origem indo para cima do destino e inclinando. */
  approach: number;
  /** 0..1: o líquido escorrendo (níveis mudando). */
  flow: number;
  /** 0..1: origem voltando ao lugar. */
  back: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Divide o progresso `p` (0..1) do despejo nas três fases. */
export function pourPhase(p: number): PourPhase {
  if (p >= 1) return { approach: 1, flow: 1, back: 1 };
  const a = POUR_PHASES.approach;
  const f = POUR_PHASES.flow;
  return {
    approach: clamp01(p / a),
    flow: clamp01((p - a) / f),
    back: clamp01((p - a - f) / POUR_PHASES.back),
  };
}

/** Nível (em unidades, fracionário) da origem e do destino durante o despejo. */
export function pourLevels(plan: PourPlan, flow: number): { src: number; dst: number } {
  return {
    src: plan.srcCount - plan.moved * flow,
    dst: plan.dstCount + plan.moved * flow,
  };
}

/**
 * Aplica o fim do plano aos dados visuais "antes". Deve coincidir com
 * `viewFromState(depois)` exceto pelas camadas reveladas (que o render atualiza ao fim).
 * Serve de prova (testada) de que reconciliar com o estado lógico é equivalente.
 */
export function applyPlanToView(view: readonly TubeData[], plan: PourPlan): TubeData[] {
  const out = view.map((t) => ({ colors: [...t.colors], hidden: [...t.hidden] }));
  const src = out[plan.from] as TubeData;
  const dst = out[plan.to] as TubeData;
  src.colors.length = src.colors.length - plan.moved;
  src.hidden.length = src.colors.length;
  for (let i = 0; i < plan.moved; i++) {
    dst.colors.push(plan.color);
    dst.hidden.push(false);
  }
  for (const r of plan.revealed) {
    const t = out[r.tube];
    if (t && t.colors[r.index] !== undefined) {
      t.colors[r.index] = r.color;
      t.hidden[r.index] = false;
    }
  }
  return out;
}

/** Unidades cujo conteúdo visual mudou entre dois conjuntos de dados (índices de tubo). */
export function changedTubes(a: readonly TubeData[], b: readonly TubeData[]): number[] {
  const out: number[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || !sameTubeData(x, y)) out.push(i);
  }
  return out;
}

/** Tubo cheio com uma única cor (recebe tampa). */
export function isCompleteData(data: TubeData, capacity: number): boolean {
  const first = data.colors[0];
  return (
    first !== undefined && data.colors.length === capacity && data.colors.every((c) => c === first)
  );
}

/** Inclinações candidatas do despejo (graus), da maior para a menor. */
const TILT_CANDIDATES_DEG = [64, 52, 42, 32, 24, 16];
/** Quanto a borda do tubo que despeja fica deslocada do centro do destino. */
const MOUTH_OFFSET = 0.28;
/** Altura da borda do tubo que despeja acima da boca do destino. */
const LIP_RISE = 0.4;

export interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Caixa (mundo) ocupada pelo tubo que despeja no ponto de inclinação máxima, com a borda
 * presa sobre o destino. `dst` = centro da base do destino; `dir` = +1 borda à direita
 * (corpo para a esquerda), -1 o contrário.
 */
export function tiltedExtent(
  dst: { x: number; y: number },
  height: number,
  radius: number,
  dir: 1 | -1,
  tilt: number,
): Extent {
  const lipX = dst.x - dir * MOUTH_OFFSET;
  const lipY = dst.y + height + LIP_RISE;
  const a = -dir * tilt;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const cx of [-radius, radius]) {
    for (const cy of [0, height]) {
      const vx = cx - dir * radius;
      const vy = cy - height;
      const x = lipX + vx * c - vy * s;
      const y = lipY + vx * s + vy * c;
      out.minX = Math.min(out.minX, x);
      out.maxX = Math.max(out.maxX, x);
      out.minY = Math.min(out.minY, y);
      out.maxY = Math.max(out.maxY, y);
    }
  }
  return out;
}

export interface TiltChoice {
  dir: 1 | -1;
  /** Inclinação máxima (rad). */
  maxTilt: number;
  /** Quanto a caixa ainda passa dos limites (0 = cabe). */
  overflow: number;
}

/**
 * Escolhe o lado da inclinação e o ângulo máximo para o tubo que despeja caber em `bounds`
 * (centrado em 0). Usa o maior ângulo em que alguma direção cabe; empate de direção: a de
 * menor excursão horizontal. Se nada couber, usa o par de menor estouro.
 */
export function chooseTilt(
  dst: { x: number; y: number },
  height: number,
  radius: number,
  bounds: { width: number; height: number },
): TiltChoice {
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const overflowOf = (e: Extent): number =>
    Math.max(0, e.maxX - halfW, -halfW - e.minX, e.maxY - halfH, -halfH - e.minY);
  let best: (TiltChoice & { reach: number }) | null = null;
  for (const deg of TILT_CANDIDATES_DEG) {
    const tilt = (deg * Math.PI) / 180;
    let round: (TiltChoice & { reach: number }) | null = null;
    for (const dir of [1, -1] as const) {
      const e = tiltedExtent(dst, height, radius, dir, tilt);
      const cand = {
        dir,
        maxTilt: tilt,
        overflow: overflowOf(e),
        reach: Math.max(Math.abs(e.minX), Math.abs(e.maxX)),
      };
      if (
        !round ||
        cand.overflow < round.overflow - 1e-9 ||
        (Math.abs(cand.overflow - round.overflow) <= 1e-9 && cand.reach < round.reach)
      ) {
        round = cand;
      }
    }
    if (round && round.overflow <= 1e-6) return round;
    if (round && (!best || round.overflow < best.overflow - 1e-9)) best = round;
  }
  const chosen = best as TiltChoice & { reach: number };
  return { dir: chosen.dir, maxTilt: chosen.maxTilt, overflow: chosen.overflow };
}
