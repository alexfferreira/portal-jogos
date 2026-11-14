/**
 * Símbolos do modo daltônico e o "?" das camadas ocultas, desenhados como formas
 * vetoriais (caminhos do Canvas 2D) num atlas 4x4. Não dependem de nenhuma fonte.
 * Índices 0..13 = cores da PALETTE (mesma ordem); 14 = "?".
 */
import { CanvasTexture, PlaneGeometry, SRGBColorSpace } from 'three';

export const HIDDEN_SYMBOL = 14;
const GRID = 4;

type Draw = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => void;

function star(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points: number,
  inner: number,
): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : r * inner;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function poly(c: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  c.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
  c.closePath();
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Um desenho por cor da PALETTE; cada um define o caminho, o atlas pinta contorno e miolo. */
const SHAPES: readonly Draw[] = [
  // 0 círculo
  (c, x, y, r) => {
    c.beginPath();
    c.arc(x, y, r * 0.92, 0, Math.PI * 2);
  },
  // 1 triângulo para cima
  (c, x, y, r) =>
    poly(c, [
      [x, y - r],
      [x + r * 1.02, y + r * 0.8],
      [x - r * 1.02, y + r * 0.8],
    ]),
  // 2 quadrado
  (c, x, y, r) => roundRect(c, x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64, r * 0.2),
  // 3 losango
  (c, x, y, r) =>
    poly(c, [
      [x, y - r * 1.08],
      [x + r * 0.9, y],
      [x, y + r * 1.08],
      [x - r * 0.9, y],
    ]),
  // 4 estrela de 5 pontas
  (c, x, y, r) => star(c, x, y + r * 0.06, r * 1.1, 5, 0.46),
  // 5 mais
  (c, x, y, r) => {
    const t = r * 0.36;
    poly(c, [
      [x - t, y - r],
      [x + t, y - r],
      [x + t, y - t],
      [x + r, y - t],
      [x + r, y + t],
      [x + t, y + t],
      [x + t, y + r],
      [x - t, y + r],
      [x - t, y + t],
      [x - r, y + t],
      [x - r, y - t],
      [x - t, y - t],
    ]);
  },
  // 6 triângulo para baixo
  (c, x, y, r) =>
    poly(c, [
      [x - r * 1.02, y - r * 0.8],
      [x + r * 1.02, y - r * 0.8],
      [x, y + r],
    ]),
  // 7 coração
  (c, x, y, r) => {
    c.beginPath();
    c.moveTo(x, y + r * 0.95);
    c.bezierCurveTo(x - r * 1.5, y + r * 0.05, x - r * 0.95, y - r * 1.0, x, y - r * 0.32);
    c.bezierCurveTo(x + r * 0.95, y - r * 1.0, x + r * 1.5, y + r * 0.05, x, y + r * 0.95);
    c.closePath();
  },
  // 8 lua crescente
  (c, x, y, r) => {
    c.beginPath();
    c.arc(x, y, r * 0.95, Math.PI * 0.32, Math.PI * 1.68, false);
    c.arc(x + r * 0.42, y, r * 0.78, Math.PI * 1.6, Math.PI * 0.4, true);
    c.closePath();
  },
  // 9 flor (pétalas unidas num contorno só: círculo central grande + 5 pétalas)
  (c, x, y, r) => {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const px = x + Math.cos(a) * r * 0.56;
      const py = y + Math.sin(a) * r * 0.56;
      c.moveTo(px + r * 0.46, py);
      c.arc(px, py, r * 0.46, 0, Math.PI * 2);
    }
    c.moveTo(x + r * 0.5, y);
    c.arc(x, y, r * 0.5, 0, Math.PI * 2);
  },
  // 10 X
  (c, x, y, r) => {
    const t = r * 0.34;
    const k = r * 0.92;
    poly(c, [
      [x - k, y - k + t],
      [x - k + t, y - k],
      [x, y - t],
      [x + k - t, y - k],
      [x + k, y - k + t],
      [x + t, y],
      [x + k, y + k - t],
      [x + k - t, y + k],
      [x, y + t],
      [x - k + t, y + k],
      [x - k, y + k - t],
      [x - t, y],
    ]);
  },
  // 11 meio círculo (metade direita cheia)
  (c, x, y, r) => {
    c.beginPath();
    c.arc(x, y, r * 0.92, -Math.PI / 2, Math.PI / 2, false);
    c.closePath();
  },
  // 12 trevo (três círculos + haste)
  (c, x, y, r) => {
    c.beginPath();
    const rr = r * 0.46;
    c.moveTo(x + rr, y - r * 0.5);
    c.arc(x, y - r * 0.5, rr, 0, Math.PI * 2);
    c.moveTo(x - r * 0.42 + rr, y + r * 0.2);
    c.arc(x - r * 0.42, y + r * 0.2, rr, 0, Math.PI * 2);
    c.moveTo(x + r * 0.42 + rr, y + r * 0.2);
    c.arc(x + r * 0.42, y + r * 0.2, rr, 0, Math.PI * 2);
    c.moveTo(x - r * 0.16, y);
    c.lineTo(x + r * 0.16, y);
    c.lineTo(x + r * 0.3, y + r);
    c.lineTo(x - r * 0.3, y + r);
    c.closePath();
  },
  // 13 estrela de 4 pontas
  (c, x, y, r) => star(c, x, y, r * 1.12, 4, 0.34),
];

function drawQuestion(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const path = (): void => {
    c.beginPath();
    c.arc(x, y - r * 0.32, r * 0.5, Math.PI * 1.02, Math.PI * 0.5, false);
    c.lineTo(x, y + r * 0.38);
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(20,28,45,0.8)';
  c.lineWidth = r * 0.5;
  path();
  c.stroke();
  c.beginPath();
  c.arc(x, y + r * 0.82, r * 0.19, 0, Math.PI * 2);
  c.fillStyle = 'rgba(20,28,45,0.8)';
  c.beginPath();
  c.arc(x, y + r * 0.82, r * 0.3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = r * 0.28;
  path();
  c.stroke();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(x, y + r * 0.82, r * 0.18, 0, Math.PI * 2);
  c.fill();
}

export interface SymbolAtlas {
  /** Um plano por símbolo (índice = cor da PALETTE; `HIDDEN_SYMBOL` = "?"), UV já recortado. */
  geometries: PlaneGeometry[];
  texture: CanvasTexture;
  dispose(): void;
}

/** Desenha o atlas. `cell` é o lado de cada célula em px (128 alta / 64 baixa qualidade). */
export function createSymbolAtlas(cell = 128, size = 0.5): SymbolAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * GRID;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas 2D indisponível');
  const r = cell * 0.34;
  const outline = Math.max(3, cell * 0.075);

  SHAPES.forEach((draw, i) => {
    const x = (i % GRID) * cell + cell / 2;
    const y = Math.floor(i / GRID) * cell + cell / 2;
    draw(c, x, y, r);
    c.lineJoin = 'round';
    c.lineWidth = outline * 2;
    c.strokeStyle = 'rgba(20,28,45,0.8)';
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fill('nonzero');
  });
  drawQuestion(
    c,
    (HIDDEN_SYMBOL % GRID) * cell + cell / 2,
    Math.floor(HIDDEN_SYMBOL / GRID) * cell + cell / 2,
    r * 0.9,
  );

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const geometries = Array.from({ length: SHAPES.length + 1 }, (_, i) => {
    const g = new PlaneGeometry(size, size);
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    const uv = g.attributes.uv;
    if (uv) {
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, (col + uv.getX(k)) / GRID, 1 - (row + 1 - uv.getY(k)) / GRID);
      }
      uv.needsUpdate = true;
    }
    return g;
  });

  return {
    geometries,
    texture,
    dispose() {
      texture.dispose();
      for (const g of geometries) g.dispose();
    },
  };
}
