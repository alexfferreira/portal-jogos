/** Palco falso só para testes (não é usado em produção): cena e câmera reais do Three. */
import { fitOrthographic, Tweens } from '@recreio/core';
import { OrthographicCamera, Scene, type Object3D } from 'three';
import type { Board, BoardStage } from './board';

export class FakeStage implements BoardStage {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1);
  readonly tweens = new Tweens();
  size = { width: 390, height: 800 };
  readonly boundsCalls: { width: number; depth: number }[] = [];
  private handlers: ((w: number, h: number) => void)[] = [];
  private frameHandlers: ((dt: number) => void)[] = [];

  setBounds(b: { width: number; depth: number }): void {
    this.boundsCalls.push({ width: b.width, depth: b.depth });
    const { halfWidth, halfHeight } = fitOrthographic(b, this.size.width / this.size.height);
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== fn);
    };
  }

  /** Dispara os assinantes de redimensionamento (como o palco real faz). */
  resize(width: number, height: number): void {
    this.size = { width, height };
    for (const h of [...this.handlers]) h(width, height);
  }

  onFrame(fn: (dt: number) => void): () => void {
    this.frameHandlers.push(fn);
    return () => {
      this.frameHandlers = this.frameHandlers.filter((h) => h !== fn);
    };
  }

  /** Um quadro: avança os tweens e os efeitos que escutam `onFrame`. */
  frame(dt: number): void {
    this.tweens.update(dt);
    for (const h of [...this.frameHandlers]) h(dt);
  }

  /** Avança o relógio até as animações acabarem. */
  run(board: Board, step = 0.05, maxSeconds = 20): void {
    for (let t = 0; board.animating && t < maxSeconds; t += step) this.frame(step);
  }
}

/** Todos os grupos de veículo (têm `userData.vehicleId`) sob `root`. */
export function vehicleGroupsOf(root: Object3D): Object3D[] {
  const out: Object3D[] = [];
  root.traverse((o) => {
    if (typeof o.userData.vehicleId === 'number') out.push(o);
  });
  return out;
}
