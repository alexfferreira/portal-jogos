/**
 * Layout do tabuleiro e picking por toque. Funções PURAS (sem Three, sem DOM):
 * decidem onde cada tubo fica no mundo e qual tubo um toque em pixels acertou.
 *
 * Mundo: X para a direita, Y para cima; as unidades são "larguras de tubo".
 */

/** Medidas fixas do tubo (unidades do mundo). */
export const TUBE = {
  /** Raio externo do vidro. */
  radius: 0.5,
  /** Altura de uma unidade de líquido. */
  unitHeight: 0.82,
  /** Folga entre o fundo do vidro e o líquido. */
  bottomPad: 0.08,
  /** Folga entre o líquido cheio e a boca do tubo. */
  topPad: 0.3,
} as const;

/** Espessura do tabuleiro em Z (só pesa na inclinação da câmera). */
export const BOARD_DEPTH = 1.5;
/** Inclinação padrão da câmera frontal, em graus (igual ao padrão do palco). */
export const CAMERA_TILT_DEG = 8;

const PITCH_X = 1.6;
const ROW_GAP = 1.0;
/** Folga acima da primeira fileira: o tubo selecionado sobe e o despejo passa por ali. */
const HEADROOM = 1.0;
const MARGIN_BOTTOM = 0.15;
const MAX_ROWS = 5;

export function tubeHeight(capacity: number): number {
  return TUBE.bottomPad + capacity * TUBE.unitHeight + TUBE.topPad;
}

export interface TubePos {
  /** Centro horizontal. */
  x: number;
  /** Centro vertical do tubo. */
  y: number;
}

export interface BoardLayout {
  tubes: TubePos[];
  rows: number;
  /** Maior número de tubos em uma fileira. */
  cols: number;
  tubeHeight: number;
  /** Largura da célula de cada tubo (área de toque). */
  pitchX: number;
  /** Altura do conteúdo, centrado em Y = 0. */
  bounds: { width: number; height: number; depth: number };
}

/**
 * Posiciona `tubeCount` tubos em grade com 1 ou mais fileiras, deixando espaço entre
 * elas (para o tubo selecionado subir e despejar). Escolhe o número de fileiras que
 * deixa os tubos maiores na tela, para a proporção `aspect` (largura/altura do palco).
 * Fileiras de cima têm tubos a mais quando a divisão não é exata; cada fileira é centrada.
 */
export function computeLayout(tubeCount: number, aspect: number, capacity: number): BoardLayout {
  const n = Math.max(0, Math.floor(tubeCount));
  const h = tubeHeight(capacity);
  const a = aspect > 0 ? aspect : 0.5;

  const measure = (rows: number) => {
    const cols = Math.ceil(n / rows);
    const width = Math.max(1, cols) * PITCH_X;
    const height = rows * h + (rows - 1) * ROW_GAP + HEADROOM + MARGIN_BOTTOM;
    return { cols, width, height, scale: Math.min(a / width, 1 / height) };
  };

  let rows = 1;
  let best = measure(1);
  for (let r = 2; r <= Math.min(Math.max(n, 1), MAX_ROWS); r++) {
    const m = measure(r);
    // Só troca se ganhar de verdade (>1%): empate fica com menos fileiras.
    if (m.scale > best.scale * 1.01) {
      best = m;
      rows = r;
    }
  }

  const tubes: TubePos[] = [];
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const top = best.height / 2 - HEADROOM;
  for (let r = 0; r < rows; r++) {
    const count = base + (r < extra ? 1 : 0);
    const y = top - h / 2 - r * (h + ROW_GAP);
    for (let c = 0; c < count; c++) {
      tubes.push({ x: (c - (count - 1) / 2) * PITCH_X, y });
    }
  }

  return {
    tubes,
    rows,
    cols: best.cols,
    tubeHeight: h,
    pitchX: PITCH_X,
    bounds: { width: best.width, height: best.height, depth: BOARD_DEPTH },
  };
}

/**
 * Lado (px) da menor área de toque de um tubo, dado o tamanho do palco em px e o mesmo
 * enquadramento da câmera frontal (`fitOrthoFront` do core, margem 1,04).
 */
export function touchSizePx(
  layout: BoardLayout,
  viewWidth: number,
  viewHeight: number,
  tiltDeg = CAMERA_TILT_DEG,
  margin = 1.04,
): number {
  const tilt = (tiltDeg * Math.PI) / 180;
  const { width, height, depth } = layout.bounds;
  const visibleH = height * Math.cos(tilt) + depth * Math.sin(tilt);
  const pxPerUnit = Math.min(viewWidth / (width * margin), viewHeight / (visibleH * margin));
  return Math.min(layout.pitchX, layout.tubeHeight) * pxPerUnit;
}

/** Retângulo em px, por centro. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Qual tubo o toque `(x, y)` acertou? Entre os retângulos que contêm o ponto, vence o de
 * centro mais próximo (normalizado pelo tamanho). Nenhum acerto: `null`.
 */
export function pickTube(rects: readonly Rect[], x: number, y: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  rects.forEach((r, i) => {
    const dx = Math.abs(x - r.x) / (r.w / 2);
    const dy = Math.abs(y - r.y) / (r.h / 2);
    if (dx > 1 || dy > 1) return;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}
