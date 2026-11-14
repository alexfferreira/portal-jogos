import {
  AmbientLight,
  InstancedMesh,
  Light,
  Color,
  DirectionalLight,
  HemisphereLight,
  Material,
  Mesh,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Object3D,
} from 'three';
import type { Quality } from '../services/settings';
import { Tweens } from '../tween';
import { watchContext } from './contextGuard';
import { fitOrthoFront, fitOrthographic, fitPerspective, type Bounds } from './fit';

/**
 * - `ortho-top`: ortográfica de cima (plano XZ).
 * - `perspective-tilted`: perspectiva inclinada (plano XZ).
 * - `ortho-front-tilted`: ortográfica de frente, levemente inclinada (plano XY, em pé).
 *   Usa `bounds.width` (X), `bounds.height` (Y) e `bounds.depth` (espessura em Z).
 */
export type CameraPreset = 'ortho-top' | 'perspective-tilted' | 'ortho-front-tilted';

export interface StageOptions {
  camera: CameraPreset;
  /** Conteúdo a enquadrar (plano XZ). */
  bounds: Bounds;
  quality?: Quality;
  /** Cor de fundo (hex). */
  background?: number;
  /** Elevação da câmera em perspectiva, em graus. */
  elevationDeg?: number;
  /** Inclinação da câmera frontal (graus acima do horizonte). Padrão 8. */
  tiltDeg?: number;
}

export interface PickHit {
  object: Object3D;
  point: Vector3;
  distance: number;
}

export interface PointerInfo {
  /** Coordenadas em pixels relativas ao canvas. */
  x: number;
  y: number;
}

export interface DragEvent extends PointerInfo {
  phase: 'start' | 'move' | 'end';
  dx: number;
  dy: number;
}

export interface Stage {
  readonly scene: Scene;
  readonly camera: OrthographicCamera | PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly tweens: Tweens;
  /** Chamado a cada quadro, antes de desenhar. `dt` em segundos. */
  onFrame(fn: (dt: number) => void): () => void;
  /** Raycast com área de toque generosa. Procura entre `targets` (e seus filhos). */
  pick(x: number, y: number, targets: readonly Object3D[]): PickHit | null;
  /** Tamanho atual do canvas em px (CSS). */
  readonly size: { width: number; height: number };
  /** Chamado depois de cada redimensionamento (câmera já ajustada). */
  onResize(fn: (width: number, height: number) => void): () => void;
  /** Toque curto, sem arrastar. */
  onTap(fn: (p: PointerInfo) => void): () => void;
  onDrag(fn: (e: DragEvent) => void): () => void;
  /** O contexto WebGL foi perdido (comum no celular ao voltar do segundo plano). O loop pausa sozinho. */
  onContextLost(fn: () => void): () => void;
  /**
   * O contexto voltou. O palco já refez luzes, sombras e materiais e retomou o loop;
   * um jogo que guarda recursos de GPU próprios (render targets, texturas) os refaz aqui.
   */
  onContextRestored(fn: () => void): () => void;
  /** True enquanto o contexto está perdido. */
  readonly contextLost: boolean;
  setBounds(bounds: Bounds): void;
  setQuality(quality: Quality): void;
  /** Pausa/retoma o loop (o loop também pausa sozinho com a aba oculta). */
  pause(): void;
  resume(): void;
  /** Contadores do renderer, úteis para detectar vazamento. */
  stats(): { geometries: number; textures: number; programs: number };
  /** Libera tudo: loop, listeners, geometrias, materiais, texturas e o contexto WebGL. */
  dispose(): void;
}

/** Raio (px) em volta do toque em que um objeto ainda conta como tocado. */
const TAP_RADIUS_PX = 22;
/** Movimento (px) a partir do qual um toque vira arrasto. */
const DRAG_THRESHOLD_PX = 8;
const MAX_DT = 0.05;
/** Limite do pixel ratio na qualidade alta (2 custa muito fill rate no celular). */
const MAX_PIXEL_RATIO = 1.5;

export function createStage(container: HTMLElement, opts: StageOptions): Stage {
  let quality: Quality = opts.quality ?? 'high';
  let bounds = opts.bounds;
  const elevationDeg = opts.elevationDeg ?? 62;
  const tiltDeg = opts.tiltDeg ?? 8;
  const front = opts.camera === 'ortho-front-tilted';
  const fov = 45;

  const renderer = new WebGLRenderer({ antialias: quality === 'high', alpha: false });
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(opts.background ?? 0xeaf3ff);

  // Luzes padrão: ambiente + hemisfério suave + direcional com sombra opcional.
  scene.add(new AmbientLight(0xffffff, 0.55));
  scene.add(new HemisphereLight(0xffffff, 0xb8c7e0, 0.6));
  const sun = new DirectionalLight(0xffffff, 1.6);
  // De frente, a luz vem do alto, da esquerda e de perto da câmera.
  if (front) sun.position.set(-4, 7, 10);
  else sun.position.set(4, 10, 6);
  scene.add(sun);

  const camera =
    opts.camera !== 'perspective-tilted'
      ? new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
      : new PerspectiveCamera(fov, 1, 0.1, 200);

  const tweens = new Tweens();
  const frameListeners = new Set<(dt: number) => void>();
  const tapListeners = new Set<(p: PointerInfo) => void>();
  const dragListeners = new Set<(e: DragEvent) => void>();
  const resizeListeners = new Set<(w: number, h: number) => void>();
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  let width = 1;
  let height = 1;
  const sizeInfo = { width: 1, height: 1 };

  const applyQuality = (): void => {
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === 'high' ? MAX_PIXEL_RATIO : 1),
    );
    // O preset frontal não tem objetos que projetam sombra (usa sombra de contato falsa).
    const shadows = quality === 'high' && !front;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = PCFShadowMap;
    sun.castShadow = shadows;
    if (shadows) sun.shadow.mapSize.set(1024, 1024);
    applyShadowCamera();
    renderer.setSize(width, height, false);
  };

  const applyShadowCamera = (): void => {
    if (!sun.castShadow) return;
    const s = Math.max(bounds.width, bounds.depth);
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    sun.shadow.camera.updateProjectionMatrix();
  };

  const applyCamera = (): void => {
    const aspect = width / height;
    if (camera instanceof OrthographicCamera && front) {
      const { halfWidth, halfHeight } = fitOrthoFront(
        { width: bounds.width, height: bounds.height ?? bounds.depth, depth: bounds.depth },
        aspect,
        tiltDeg,
      );
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      const el = (tiltDeg * Math.PI) / 180;
      camera.position.set(0, Math.sin(el) * 30, Math.cos(el) * 30);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    } else if (camera instanceof OrthographicCamera) {
      const { halfWidth, halfHeight } = fitOrthographic(bounds, aspect);
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.position.set(0, 20, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
    } else {
      const dist = fitPerspective(bounds, aspect, fov, elevationDeg);
      const el = (elevationDeg * Math.PI) / 180;
      camera.aspect = aspect;
      camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  /** `setSize` limpa o canvas: com o loop parado, redesenha um quadro para não ficar em branco. */
  const redrawIfStopped = (): void => {
    if (!running) renderer.render(scene, camera);
  };

  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    applyCamera();
    redrawIfStopped();
    for (const fn of [...resizeListeners]) fn(width, height);
  };

  const pick: Stage['pick'] = (x, y, targets) => {
    // Testa o ponto e um anel em volta dele; vence o acerto mais próximo do toque.
    const offsets: [number, number][] = [[0, 0]];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      offsets.push([Math.cos(a) * TAP_RADIUS_PX, Math.sin(a) * TAP_RADIUS_PX]);
    }
    let best: { hit: PickHit; offset: number } | null = null;
    for (const [ox, oy] of offsets) {
      ndc.set(((x + ox) / width) * 2 - 1, -((y + oy) / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(targets as Object3D[], true)[0];
      if (!hit) continue;
      const offset = Math.hypot(ox, oy);
      if (!best || offset < best.offset) {
        best = {
          hit: { object: hit.object, point: hit.point.clone(), distance: hit.distance },
          offset,
        };
      }
      if (offset === 0) break;
    }
    return best?.hit ?? null;
  };

  // --- entrada: toque curto vs. arrasto ---
  let down: { id: number; x: number; y: number; dragging: boolean } | null = null;
  const local = (e: PointerEvent): PointerInfo => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent): void => {
    if (down) return;
    const p = local(e);
    down = { id: e.pointerId, ...p, dragging: false };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return;
    const p = local(e);
    const dx = p.x - down.x;
    const dy = p.y - down.y;
    if (!down.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      down.dragging = true;
      for (const fn of [...dragListeners])
        fn({ phase: 'start', x: down.x, y: down.y, dx: 0, dy: 0 });
    }
    if (down.dragging) for (const fn of [...dragListeners]) fn({ phase: 'move', ...p, dx, dy });
  };
  const onUp = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return;
    const p = local(e);
    const state = down;
    down = null;
    canvas.releasePointerCapture?.(e.pointerId);
    if (state.dragging) {
      for (const fn of [...dragListeners]) {
        fn({ phase: 'end', ...p, dx: p.x - state.x, dy: p.y - state.y });
      }
    } else {
      for (const fn of [...tapListeners]) fn(p);
    }
  };
  const onCancel = (): void => {
    const state = down;
    down = null;
    // Um arrasto interrompido (ex.: o sistema tomou o gesto) precisa terminar para o jogo.
    if (state?.dragging) {
      for (const fn of [...dragListeners]) {
        fn({ phase: 'end', x: state.x, y: state.y, dx: 0, dy: 0 });
      }
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // --- loop com pausa automática ---
  let manualPause = false;
  let running = false;
  let last = 0;
  const frame = (time: number): void => {
    const dt = Math.min(MAX_DT, Math.max(0, (time - last) / 1000));
    last = time;
    // Um erro num callback não pode matar o loop de animação.
    try {
      tweens.update(dt);
      for (const fn of frameListeners) fn(dt);
    } catch (err) {
      console.error('[stage] erro no quadro', err);
    }
    renderer.render(scene, camera);
  };
  let contextLost = false;
  const lostListeners = new Set<() => void>();
  const restoredListeners = new Set<() => void>();
  const sync = (): void => {
    const shouldRun = !manualPause && !contextLost && document.visibilityState !== 'hidden';
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    } else {
      renderer.setAnimationLoop(null);
    }
  };
  document.addEventListener('visibilitychange', sync);

  // Perda de contexto: pausa o loop; ao voltar, o three recria o estado da GPU sozinho
  // (geometrias, texturas, programas, render targets) e o loop retoma.
  const stopWatchingContext = watchContext(canvas, {
    onLost() {
      contextLost = true;
      sync();
      for (const fn of [...lostListeners]) fn();
    },
    onRestored() {
      contextLost = false;
      scene.traverse((obj) => {
        if (!(obj instanceof Mesh)) return;
        const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.needsUpdate = true;
      });
      applyQuality();
      applyCamera();
      sync();
      redrawIfStopped();
      for (const fn of [...restoredListeners]) fn();
    },
  });

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  resize();
  applyQuality();
  sync();

  let disposed = false;
  return {
    scene,
    camera,
    renderer,
    canvas,
    tweens,
    onFrame(fn) {
      frameListeners.add(fn);
      return () => void frameListeners.delete(fn);
    },
    pick,
    get size() {
      sizeInfo.width = width;
      sizeInfo.height = height;
      return sizeInfo;
    },
    onResize(fn) {
      resizeListeners.add(fn);
      return () => void resizeListeners.delete(fn);
    },
    onTap(fn) {
      tapListeners.add(fn);
      return () => void tapListeners.delete(fn);
    },
    onDrag(fn) {
      dragListeners.add(fn);
      return () => void dragListeners.delete(fn);
    },
    onContextLost(fn) {
      lostListeners.add(fn);
      return () => void lostListeners.delete(fn);
    },
    onContextRestored(fn) {
      restoredListeners.add(fn);
      return () => void restoredListeners.delete(fn);
    },
    get contextLost() {
      return contextLost;
    },
    setBounds(next) {
      bounds = next;
      applyCamera();
      applyShadowCamera();
      redrawIfStopped();
    },
    setQuality(next) {
      if (next === quality) return;
      quality = next;
      applyQuality();
      // Ligar/desligar sombras exige recompilar os materiais.
      scene.traverse((obj) => {
        if (!(obj instanceof Mesh)) return;
        const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.needsUpdate = true;
      });
      redrawIfStopped();
    },
    pause() {
      manualPause = true;
      sync();
    },
    resume() {
      manualPause = false;
      sync();
    },
    stats() {
      const { memory, programs } = renderer.info;
      return {
        geometries: memory.geometries,
        textures: memory.textures,
        programs: programs?.length ?? 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      manualPause = true;
      sync();
      document.removeEventListener('visibilitychange', sync);
      stopWatchingContext();
      lostListeners.clear();
      restoredListeners.clear();
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      // Descarta sem chamar onComplete: callbacks não devem tocar objetos já liberados.
      tweens.dispose();
      frameListeners.clear();
      tapListeners.clear();
      dragListeners.clear();
      resizeListeners.clear();
      disposeObject(scene);
      if (scene.background instanceof Texture) scene.background.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** Libera geometrias, materiais e texturas de tudo que está sob `root`. */
export function disposeObject(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof Light) obj.dispose?.();
    if (obj instanceof InstancedMesh) obj.dispose();
    // Mesh, Line, Points e Sprite têm geometry e/ou material.
    const o = obj as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    o.geometry?.dispose();
    if (!o.material) return;
    const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const value of Object.values(m)) if (value instanceof Texture) value.dispose();
      m.dispose();
    }
  });
}
