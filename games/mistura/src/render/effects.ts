/**
 * Efeitos baratos: fundo em gradiente, partículas discretas, confete e a mãozinha do
 * tutorial. Todos liberam o que criaram em `dispose()`.
 */
import { PALETTE } from '@recreio/core';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';

/** Gradiente vertical suave como fundo da cena (textura de fundo: não entra na profundidade). */
export function createBackground(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#a9d8ff');
    g.addColorStop(0.55, '#d9ecff');
    g.addColorStop(1, '#f3f7ff');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Bolhas/pontos que sobem devagar atrás do tabuleiro. Posições em [-0.5, 0.5]. */
export class Particles {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly material: PointsMaterial;
  private time = 0;

  constructor(count: number) {
    this.positions = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = Math.random() - 0.5;
      this.positions[i * 3 + 1] = Math.random() - 0.5;
      this.positions[i * 3 + 2] = -3;
      this.speeds[i] = 0.01 + Math.random() * 0.03;
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new PointsMaterial({
      color: 0xffffff,
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
  }

  /** Ajusta a área coberta (tamanho do conteúdo em unidades do mundo). */
  setArea(width: number, height: number): void {
    this.points.scale.set(width * 1.5, height * 1.2, 1);
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.positions;
    for (let i = 0; i < this.speeds.length; i++) {
      let y = (p[i * 3 + 1] as number) + (this.speeds[i] as number) * dt;
      if (y > 0.5) y -= 1;
      p[i * 3 + 1] = y;
      p[i * 3] = (p[i * 3] as number) + Math.sin(this.time * 0.6 + i) * 0.0004;
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Confete 3D: um `InstancedMesh` de pedacinhos que caem e são descartados no fim. */
export class Confetti {
  private mesh: InstancedMesh | null;
  private geometry: PlaneGeometry | null;
  private material: MeshBasicMaterial | null;
  private readonly state: Float32Array;
  private readonly count: number;
  private age = 0;
  private readonly dummy = new Object3D();
  private readonly duration = 2.8;

  constructor(
    private readonly scene: Scene,
    count: number,
    width: number,
    top: number,
  ) {
    this.count = count;
    this.geometry = new PlaneGeometry(0.2, 0.13);
    this.material = new MeshBasicMaterial({ side: DoubleSide });
    this.mesh = new InstancedMesh(this.geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    // x, y, z, vx, vy, vz, rotação, velocidade de rotação (8 por peça)
    this.state = new Float32Array(count * 8);
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const o = i * 8;
      this.state[o] = (Math.random() - 0.5) * width * 0.4;
      this.state[o + 1] = top - 1.5;
      this.state[o + 2] = 1.5 + Math.random();
      this.state[o + 3] = (Math.random() - 0.5) * width * 0.9;
      this.state[o + 4] = 4 + Math.random() * 5;
      this.state[o + 5] = (Math.random() - 0.5) * 2;
      this.state[o + 6] = Math.random() * Math.PI * 2;
      this.state[o + 7] = (Math.random() - 0.5) * 14;
      color.setHex(PALETTE[i % PALETTE.length]?.hex ?? 0xffffff);
      this.mesh.setColorAt(i, color);
    }
    scene.add(this.mesh);
    this.write();
  }

  get done(): boolean {
    return this.mesh === null;
  }

  update(dt: number): void {
    if (!this.mesh) return;
    this.age += dt;
    const s = this.state;
    for (let i = 0; i < this.count; i++) {
      const o = i * 8;
      s[o + 4] = (s[o + 4] as number) - 9 * dt;
      s[o + 3] = (s[o + 3] as number) * (1 - 0.6 * dt);
      s[o] = (s[o] as number) + (s[o + 3] as number) * dt;
      s[o + 1] = (s[o + 1] as number) + (s[o + 4] as number) * dt;
      s[o + 2] = (s[o + 2] as number) + (s[o + 5] as number) * dt;
      s[o + 6] = (s[o + 6] as number) + (s[o + 7] as number) * dt;
    }
    this.write();
    if (this.age >= this.duration) this.dispose();
  }

  private write(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const s = this.state;
    const d = this.dummy;
    for (let i = 0; i < this.count; i++) {
      const o = i * 8;
      d.position.set(s[o] as number, s[o + 1] as number, s[o + 2] as number);
      d.rotation.set((s[o + 6] as number) * 0.7, (s[o + 6] as number) * 1.3, s[o + 6] as number);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry?.dispose();
    this.material?.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
  }
}

/** Mãozinha "toque aqui", desenhada em vetor num canvas e usada como textura de um plano. */
export class Hand {
  readonly group = new Group();
  private readonly texture: CanvasTexture;
  private readonly geometry = new PlaneGeometry(1.5, 1.5);
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;
  /** Escala do desenho: a ponta do dedo fica na origem do grupo. */
  constructor() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d');
    if (c) drawHand(c);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    // Ponta do dedo em (61, 10) px: leva esse ponto à origem do grupo.
    this.mesh.position.set(0.035, -0.63, 0);
    this.mesh.renderOrder = 20;
    this.group.add(this.mesh);
    this.group.visible = false;
    this.group.position.z = 2;
  }

  /** Posição (mundo), escala de toque e opacidade. */
  set(x: number, y: number, press: number, alpha: number): void {
    this.group.visible = alpha > 0.01;
    this.group.position.x = x;
    this.group.position.y = y;
    this.group.scale.setScalar(press);
    this.material.opacity = alpha;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
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
