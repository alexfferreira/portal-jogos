/**
 * Efeitos da Embarca desenhados DEITADOS no plano XZ (a câmera olha de cima): a mãozinha do
 * tutorial e da dica, o anel pulsante da dica e o confete da vitória. Versões adaptadas das da
 * Mistura, que são desenhadas para a câmera de frente (extrair para o `core` no terceiro jogo).
 */
import { createRng } from '@recreio/core/puzzle';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import type { WorldPoint } from './layout';

/** Duração do ciclo da mãozinha, em segundos. */
export const HAND_CYCLE = 1.6;

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Pose da mãozinha no instante `time` (s): aparece, pressiona (a escala cai a ~0,78 e volta) e
 * some, repetindo a cada `HAND_CYCLE`. PURO.
 */
export function handPulse(time: number): { press: number; alpha: number } {
  const t = (((time % HAND_CYCLE) + HAND_CYCLE) % HAND_CYCLE) / HAND_CYCLE;
  const alpha = Math.min(smooth(t / 0.2), 1 - smooth((t - 0.88) / 0.12));
  const down = smooth((t - 0.4) / 0.1) - smooth((t - 0.55) / 0.15);
  return { press: 1 - 0.22 * down, alpha: t < 0.001 ? 0 : alpha };
}

const HAND_HEIGHT = 1.2;
const HAND_SIZE = 1.5;

/** Mãozinha "toque aqui": plano deitado, com a ponta do dedo na posição pedida. */
export class Hand {
  readonly object = new Group();
  private readonly geometry = new PlaneGeometry(HAND_SIZE, HAND_SIZE);
  private readonly material: MeshBasicMaterial;
  private readonly texture: CanvasTexture | null;
  private disposed = false;

  constructor() {
    let texture: CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const c = canvas.getContext('2d');
      if (c) drawHand(c);
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
    }
    this.texture = texture;
    this.material = new MeshBasicMaterial({
      ...(texture ? { map: texture } : {}),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });
    const mesh = new Mesh(this.geometry, this.material);
    mesh.rotation.x = -Math.PI / 2; // deita o plano; o "alto" do desenho aponta para −Z
    // Ponta do dedo em (61, 10) px de 128: leva esse ponto à origem do grupo.
    mesh.position.set(0.035, 0, 0.633);
    mesh.renderOrder = 20;
    this.object.add(mesh);
    this.object.visible = false;
  }

  /** Posição no mundo (ponta do dedo), escala de toque e opacidade. */
  set(point: WorldPoint, press: number, alpha: number): void {
    this.object.visible = alpha > 0.01;
    this.object.position.set(point.x, HAND_HEIGHT, point.z);
    this.object.scale.setScalar(press);
    this.material.opacity = alpha;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}

/** Anel pulsante sob o veículo sugerido pela dica. */
export class HintRing {
  readonly object: Mesh;
  private readonly geometry: BufferGeometry = new RingGeometry(0.88, 1, 48);
  private readonly material = new MeshBasicMaterial({
    color: 0xffd23f,
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  private radius = 1;
  private disposed = false;

  constructor() {
    this.object = new Mesh(this.geometry, this.material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.renderOrder = 5;
    this.object.visible = false;
  }

  show(center: WorldPoint, radius: number): void {
    this.radius = radius;
    this.object.position.set(center.x, 0.05, center.z);
    this.object.visible = true;
    this.update(0);
  }

  /** Pulso de escala e opacidade (`time` em segundos). */
  update(time: number): void {
    const wave = Math.sin(time * Math.PI * 2 * 1.1);
    this.object.scale.setScalar(this.radius * (1 + 0.1 * wave));
    this.material.opacity = 0.65 + 0.3 * wave;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

const CONFETTI_SEED = 0x0c0ffee;
const CONFETTI_DURATION = 2.2;
const FADE_START = 1.5;

/**
 * Confete da vitória: um estouro que sai do centro e se espalha NO PLANO (de cima não se vê
 * queda), com pedacinhos girando, subindo um pouco em Y e sumindo. Sorteio semeado.
 */
export class Confetti {
  readonly mesh: InstancedMesh;
  private readonly geometry: PlaneGeometry;
  private readonly material = new MeshBasicMaterial({ side: DoubleSide });
  /** x, y, z, vx, vy, vz, rotação, velocidade de rotação (8 por peça). */
  private readonly state: Float32Array;
  private readonly count: number;
  private age = CONFETTI_DURATION;
  private disposed = false;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly axis = new Vector3(0, 1, 0);
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

  constructor(count: number) {
    this.count = count;
    this.geometry = new PlaneGeometry(0.2, 0.13);
    this.mesh = new InstancedMesh(this.geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.state = new Float32Array(count * 8);
  }

  get object(): Object3D {
    return this.mesh;
  }

  get done(): boolean {
    return this.age >= CONFETTI_DURATION;
  }

  /** Começa um estouro em `center`, com as peças nas cores dadas (em rodízio). */
  start(center: WorldPoint, colors: readonly number[]): void {
    const rng = createRng(CONFETTI_SEED ^ this.count);
    const color = new Color();
    for (let i = 0; i < this.count; i++) {
      const o = i * 8;
      const angle = rng.next() * Math.PI * 2;
      const speed = 2 + rng.next() * 5;
      this.state[o] = center.x;
      this.state[o + 1] = 1;
      this.state[o + 2] = center.z;
      this.state[o + 3] = Math.cos(angle) * speed;
      this.state[o + 4] = 1.5 + rng.next() * 2;
      this.state[o + 5] = Math.sin(angle) * speed;
      this.state[o + 6] = rng.next() * Math.PI * 2;
      this.state[o + 7] = (rng.next() < 0.5 ? -1 : 1) * (4 + rng.next() * 8);
      color.setHex(colors[i % Math.max(1, colors.length)] ?? 0xffffff);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.age = 0;
    this.mesh.visible = true;
    this.update(0);
  }

  update(dt: number): void {
    if (this.disposed || this.done) return;
    this.age += dt;
    const fade = Math.max(
      0,
      1 - Math.max(0, this.age - FADE_START) / (CONFETTI_DURATION - FADE_START),
    );
    for (let i = 0; i < this.count; i++) {
      const o = i * 8;
      const drag = Math.exp(-1.8 * dt); // atrito que não depende da taxa de quadros
      this.state[o + 3] = (this.state[o + 3] as number) * drag;
      this.state[o + 5] = (this.state[o + 5] as number) * drag;
      this.state[o + 4] = (this.state[o + 4] as number) - 6 * dt;
      this.state[o] = (this.state[o] as number) + (this.state[o + 3] as number) * dt;
      this.state[o + 1] = Math.max(
        0.1,
        (this.state[o + 1] as number) + (this.state[o + 4] as number) * dt,
      );
      this.state[o + 2] = (this.state[o + 2] as number) + (this.state[o + 5] as number) * dt;
      this.state[o + 6] = (this.state[o + 6] as number) + (this.state[o + 7] as number) * dt;
      this.position.set(
        this.state[o] as number,
        this.state[o + 1] as number,
        this.state[o + 2] as number,
      );
      this.quaternion.setFromAxisAngle(this.axis, this.state[o + 6] as number).multiply(this.flat);
      this.scale.setScalar(fade);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.done) this.mesh.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    (this.material as Material).dispose();
  }
}

function drawHand(c: CanvasRenderingContext2D): void {
  const rr = (x: number, y: number, w: number, h: number, r: number): void => {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  const shapes = (): void => {
    c.beginPath();
    rr(50, 10, 24, 70, 12); // dedo indicador
    rr(36, 56, 62, 56, 20); // palma
    rr(78, 52, 18, 30, 9); // dedos dobrados
    c.moveTo(40, 80);
    c.ellipse(36, 84, 12, 17, -0.5, 0, Math.PI * 2); // polegar
  };
  c.lineJoin = 'round';
  shapes();
  c.lineWidth = 9;
  c.strokeStyle = 'rgba(20,28,45,0.85)';
  c.stroke();
  shapes();
  c.fillStyle = '#ffffff';
  c.fill('nonzero');
  // Linhas dos dedos dobrados.
  c.strokeStyle = 'rgba(20,28,45,0.35)';
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(80, 70);
  c.lineTo(94, 70);
  c.moveTo(80, 84);
  c.lineTo(94, 84);
  c.stroke();
}
