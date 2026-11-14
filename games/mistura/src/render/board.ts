/**
 * O tabuleiro 3D: tubos, líquidos, animações e efeitos. Só reflete o estado que a lógica
 * entrega e anima as transições. Nunca decide regra: recebe `PourPlan` e `State` prontos.
 *
 * Interrompível: toda animação é registrada; `finishAnimations()` salta todas para o fim
 * e, no fim de cada uma, o visual é reconciliado com o `State` lógico.
 */
import {
  easing,
  type Quality,
  type Stage,
  type TweenHandle,
  type TweenOptions,
} from '@recreio/core';
import { InstancedMesh, Matrix4, Mesh, type CanvasTexture, type Material } from 'three';
import type { State } from '../logic';
import { Assets } from './assets';
import { Confetti, createBackground, Hand, Particles } from './effects';
import { computeLayout, pickTube, TUBE, type BoardLayout, type Rect } from './layout';
import {
  changedTubes,
  chooseTilt,
  POUR_DURATION,
  pourPhase,
  viewFromState,
  type PourPlan,
  type TubeData,
} from './plan';
import { handPose } from './tutorial';
import { TubeView } from './tubeView';

/** Quanto o tubo selecionado sobe. */
const SELECT_LIFT = 0.55;
const HINT_FROM = 0xffd23f;
const HINT_TO = 0x7ee081;

export interface BoardOptions {
  stage: Stage;
  quality: Quality;
  colorblind: boolean;
  /** Toca um som do portal (nomes de `SoundName`). */
  sfx(name: 'click' | 'pour' | 'complete' | 'win' | 'error'): void;
  /** Publica contadores do renderer no dataset do canvas (só em execução de teste). */
  diagnostics?: boolean;
  /** Chamado quando a cena passa a ter (true) ou deixa de ter (false) animações em curso. */
  onAnimating?(animating: boolean): void;
  /** Chamado depois de cada novo layout (tubos em px, para toque e diagnóstico). */
  onLayout?(rects: readonly Rect[]): void;
}

export interface HandTarget {
  /** Tubo onde a mão começa (`null`: só toca em `to`). */
  from: number | null;
  to: number;
}

export class Board {
  private readonly stage: Stage;
  private readonly assets: Assets;
  private readonly bg: CanvasTexture;
  private readonly particles: Particles;
  private readonly hand = new Hand();
  private readonly streamMesh: Mesh;
  private readonly opts: BoardOptions;
  private views: TubeView[] = [];
  private layout: BoardLayout | null = null;
  private capacity = 4;
  private lastAspect = 0;
  private rects: Rect[] = [];
  private shadows: InstancedMesh | null = null;
  private confetti: Confetti | null = null;
  private colorblind: boolean;
  private tracked = new Set<TweenHandle>();
  private liftTweens = new Map<TubeView, TweenHandle>();
  private selected: TubeView | null = null;
  private hint: { from: number; to: number } | null = null;
  private handTarget: HandTarget | null = null;
  private handClock = 0;
  private time = 0;
  private diagClock = 0;
  private diagFrames = 0;
  private readonly offFrame: () => void;
  private readonly offResize: () => void;
  private disposed = false;

  constructor(opts: BoardOptions) {
    this.opts = opts;
    this.stage = opts.stage;
    this.colorblind = opts.colorblind;
    this.assets = new Assets(opts.quality);
    this.bg = createBackground();
    this.stage.scene.background = this.bg;

    this.particles = new Particles(opts.quality === 'high' ? 36 : 14);
    this.stage.scene.add(this.particles.points, this.hand.group);

    this.streamMesh = new Mesh(this.assets.stream, this.assets.liquid[0] as Material);
    this.streamMesh.visible = false;
    this.streamMesh.position.z = 0.3;
    this.stage.scene.add(this.streamMesh);

    this.offFrame = this.stage.onFrame((dt) => this.frame(dt));
    this.offResize = this.stage.onResize(() => this.onResize());
  }

  // --- estado e layout ---------------------------------------------------------------

  get tubeCount(): number {
    return this.views.length;
  }

  /** Reconstrói a cena para um estado novo (nova fase ou reiniciar). */
  setState(state: State): void {
    this.finishAnimations();
    this.confetti?.dispose();
    this.confetti = null;
    this.clearViews();
    this.capacity = state.capacity;
    const data = viewFromState(state);
    this.views = data.map((d) => this.makeView(d));
    this.hint = null;
    this.handTarget = null;
    this.hand.hide();
    this.relayout();
  }

  /** Acrescenta o tubo extra (o último de `state`) com uma entrada animada. */
  addTube(state: State): void {
    this.finishAnimations();
    this.applyState(state, false);
    const data = viewFromState(state);
    for (let i = this.views.length; i < data.length; i++) {
      const view = this.makeView(data[i] as TubeData);
      this.views.push(view);
    }
    this.relayout();
    const added = this.views[this.views.length - 1];
    if (added) {
      this.track({
        duration: 0.35,
        ease: easing.outBack,
        onUpdate: (t) => added.group.scale.setScalar(Math.max(0.001, t)),
      });
    }
  }

  /**
   * Reconcilia o visual com o estado lógico. Com `bounce`, os tubos que mudaram dão um
   * pequeno quique (desfazer).
   */
  syncTo(state: State, bounce = true): void {
    this.finishAnimations();
    const before = this.views.map<TubeData>((v) => ({ colors: v.colors, hidden: v.hidden }));
    const after = viewFromState(state);
    if (after.length !== this.views.length) {
      this.setState(state);
      return;
    }
    const changed = changedTubes(before, after);
    this.applyState(state, true);
    if (!bounce) return;
    for (const i of changed) {
      const view = this.views[i];
      if (!view) continue;
      this.track({
        duration: 0.3,
        ease: easing.outBack,
        onUpdate: (t) => view.group.scale.set(1, 0.9 + 0.1 * t, 1),
        onComplete: () => view.group.scale.set(1, 1, 1),
      });
    }
  }

  setColorblind(on: boolean): void {
    this.colorblind = on;
    for (const v of this.views) v.setColorblind(on);
  }

  /** O que as TubeViews mostram agora (não a sessão), no formato de `data-state`; "?" sem cor. */
  viewString(): string {
    return this.views
      .map((v) => v.colors.map((c, i) => (v.hidden[i] ? '?' : String(c))).join(' '))
      .join(' | ');
  }

  /** Quantos símbolos estão visíveis (diagnóstico/teste). */
  visibleSymbols(): number {
    return this.views.reduce((n, v) => n + v.visibleSymbols(), 0);
  }

  /** Retângulos de toque dos tubos, em px do canvas. */
  tubeRects(): readonly Rect[] {
    return this.rects;
  }

  /** Qual tubo o toque acertou. */
  pick(x: number, y: number): number | null {
    return pickTube(this.rects, x, y);
  }

  private makeView(data: TubeData): TubeView {
    const view = new TubeView(this.assets, this.capacity);
    view.setColorblind(this.colorblind);
    view.setData(data);
    this.stage.scene.add(view.group);
    return view;
  }

  private clearViews(): void {
    for (const t of this.liftTweens.values()) t.cancel(false);
    this.liftTweens.clear();
    this.selected = null;
    for (const v of this.views) v.dispose();
    this.views = [];
  }

  private onResize(): void {
    if (this.disposed || this.views.length === 0) return;
    const { width, height } = this.stage.size;
    const aspect = width / height;
    if (Math.abs(aspect - this.lastAspect) > 1e-3) this.relayout();
    else this.updateRects();
  }

  private relayout(): void {
    const { width, height } = this.stage.size;
    const aspect = width / height;
    this.lastAspect = aspect;
    const layout = computeLayout(this.views.length, aspect, this.capacity);
    this.layout = layout;
    this.views.forEach((view, i) => {
      const pos = layout.tubes[i];
      if (!pos) return;
      view.restX = pos.x;
      view.restY = pos.y - view.height / 2;
      this.poseRest(view);
    });
    this.stage.setBounds(layout.bounds);
    this.particles.setArea(layout.bounds.width, layout.bounds.height);
    this.rebuildShadows(layout);
    this.updateRects();
  }

  private rebuildShadows(layout: BoardLayout): void {
    const n = this.views.length;
    if (!this.shadows || this.shadows.count !== n) {
      if (this.shadows) {
        this.stage.scene.remove(this.shadows);
        this.shadows.dispose();
      }
      this.shadows = new InstancedMesh(
        this.assets.shadowGeometry,
        this.assets.shadow,
        Math.max(1, n),
      );
      this.shadows.frustumCulled = false;
      this.shadows.renderOrder = -1;
      this.stage.scene.add(this.shadows);
    }
    const m = new Matrix4();
    layout.tubes.forEach((_, i) => {
      const v = this.views[i];
      if (!v) return;
      m.makeTranslation(v.restX, v.restY + 0.02, -0.2);
      this.shadows?.setMatrixAt(i, m);
    });
    if (this.shadows) this.shadows.instanceMatrix.needsUpdate = true;
  }

  /** Projeta a caixa de toque de cada tubo (a célula inteira, com folga) para px. */
  private updateRects(): void {
    const layout = this.layout;
    if (!layout) return;
    const { width, height } = this.stage.size;
    const cam = this.stage.camera;
    const proj = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const toPx = (x: number, y: number): [number, number] => {
      const e = proj.elements;
      const w = (e[3] as number) * x + (e[7] as number) * y + (e[15] as number);
      const nx = ((e[0] as number) * x + (e[4] as number) * y + (e[12] as number)) / w;
      const ny = ((e[1] as number) * x + (e[5] as number) * y + (e[13] as number)) / w;
      return [((nx + 1) / 2) * width, ((1 - ny) / 2) * height];
    };
    this.rects = this.views.map((v) => {
      const [x0, y0] = toPx(v.restX - layout.pitchX / 2, v.restY + v.height + 0.3);
      const [x1, y1] = toPx(v.restX + layout.pitchX / 2, v.restY - 0.15);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    });
    this.opts.onLayout?.(this.rects);
  }

  /** Posição de repouso (+ levantado/tremor). */
  private poseRest(view: TubeView): void {
    view.group.position.set(
      view.restX + view.offsetX,
      view.restY + view.lift,
      view.lift > 0.01 ? 0.4 : 0,
    );
    view.group.rotation.set(0, 0, 0);
  }

  /** Reconciliação dura: dados, níveis, posições e tampas exatamente como no `State`. */
  private applyState(state: State, resetPose: boolean): void {
    const data = viewFromState(state);
    this.views.forEach((view, i) => {
      const d = data[i];
      if (d) view.setData(d);
      if (resetPose) {
        this.selected = null;
        view.lift = 0;
        view.offsetX = 0;
        view.group.scale.set(1, 1, 1);
        this.poseRest(view);
        view.popUnitsReset();
      }
    });
    this.streamMesh.visible = false;
  }

  // --- animações -------------------------------------------------------------------

  private track(opts: TweenOptions): TweenHandle {
    const wasIdle = this.tracked.size === 0;
    const handle: TweenHandle = this.stage.tweens.add({
      ...opts,
      onComplete: () => {
        this.tracked.delete(handle);
        opts.onComplete?.();
        // Só avisa o fim depois do onComplete (que pode encadear outra animação).
        if (this.tracked.size === 0 && !this.disposed) this.opts.onAnimating?.(false);
      },
    });
    this.tracked.add(handle);
    if (wasIdle) this.opts.onAnimating?.(true);
    return handle;
  }

  get animating(): boolean {
    return this.tracked.size > 0;
  }

  /** Termina TODAS as animações agora (cada uma salta para o fim e reconcilia). */
  finishAnimations(): void {
    let guard = 0;
    while (this.tracked.size > 0 && guard++ < 20) {
      for (const handle of [...this.tracked]) handle.cancel(true);
    }
    this.tracked.clear();
  }

  /** Levanta (selecionado) ou abaixa um tubo. `null` desmarca o atual. */
  select(index: number | null): void {
    const next = index === null ? null : (this.views[index] ?? null);
    if (this.selected && this.selected !== next) this.liftTo(this.selected, 0);
    if (next) this.liftTo(next, SELECT_LIFT);
    this.selected = next;
  }

  private liftTo(view: TubeView, target: number): void {
    this.liftTweens.get(view)?.cancel(false);
    const from = view.lift;
    const handle = this.track({
      duration: 0.16,
      ease: target > from ? easing.outBack : easing.outCubic,
      onUpdate: (t) => {
        view.lift = from + (target - from) * t;
        this.poseRest(view);
      },
      onComplete: () => {
        if (this.liftTweens.get(view) === handle) this.liftTweens.delete(view);
      },
    });
    this.liftTweens.set(view, handle);
  }

  /** Tremor de jogada inválida. */
  shake(index: number): void {
    const view = this.views[index];
    if (!view) return;
    this.track({
      duration: 0.38,
      ease: easing.linear,
      onUpdate: (t) => {
        view.offsetX = Math.sin(t * Math.PI * 5) * 0.14 * (1 - t);
        this.poseRest(view);
      },
      onComplete: () => {
        view.offsetX = 0;
        this.poseRest(view);
      },
    });
  }

  /**
   * Anima o despejo de `plan` e, ao fim, reconcilia tudo com `finalState`.
   * `onDone` roda quando o despejo termina (também se for interrompido).
   */
  playMove(plan: PourPlan, finalState: State, onDone: () => void): void {
    const src = this.views[plan.from];
    const dst = this.views[plan.to];
    if (!src || !dst) {
      this.applyState(finalState, true);
      onDone();
      return;
    }
    this.opts.sfx('pour');
    // O destino já "conhece" as novas unidades (altura 0, ainda sem nível).
    for (let k = 0; k < plan.moved; k++) dst.setUnit(plan.dstCount + k, plan.color, false);

    const R = TUBE.radius;
    const H = src.height;
    // Lado e ângulo da inclinação: os que cabem nos limites do tabuleiro (função pura).
    const bounds = this.layout?.bounds ?? { width: 8, height: 12 };
    const tilt = chooseTilt({ x: dst.restX, y: dst.restY }, H, R, bounds);
    const dir = tilt.dir;
    const approachTilt = tilt.maxTilt * 0.625;
    const flowTilt = tilt.maxTilt - approachTilt;
    const startLift = src.lift;
    const lipStartX = src.restX + dir * R;
    const lipStartY = src.restY + startLift + H;
    const lipEndY = src.restY + H;
    const px = dst.restX - dir * 0.28;
    const py = dst.restY + dst.height + 0.4;
    this.streamMesh.material = this.assets.liquid[plan.color] as Material;
    src.group.position.z = 0.9;
    this.selected = null;
    this.liftTweens.get(src)?.cancel(false);

    const place = (lipX: number, lipY: number, phi: number): void => {
      const a = -dir * phi;
      const c = Math.cos(a);
      const s = Math.sin(a);
      src.group.rotation.z = a;
      src.group.position.x = lipX - (dir * R * c - H * s);
      src.group.position.y = lipY - (dir * R * s + H * c);
    };

    this.track({
      duration: POUR_DURATION,
      ease: easing.linear,
      onUpdate: (p) => {
        const ph = pourPhase(p);
        if (ph.flow <= 0) {
          const e = easing.inOutQuad(ph.approach);
          place(
            lipStartX + (px - lipStartX) * e,
            lipStartY + (py - lipStartY) * e + Math.sin(Math.PI * e) * 0.35,
            approachTilt * e,
          );
        } else if (ph.back <= 0) {
          place(px, py, approachTilt + flowTilt * ph.flow);
        } else {
          const e = easing.inOutQuad(ph.back);
          place(
            px + (lipStartX - px) * e,
            py + (lipEndY - py) * e + Math.sin(Math.PI * e) * 0.3,
            tilt.maxTilt * (1 - e),
          );
        }
        const flow = ph.flow;
        const srcLevel = plan.srcCount - plan.moved * flow;
        const dstLevel = plan.dstCount + plan.moved * flow;
        src.setLevel(srcLevel);
        dst.setLevel(dstLevel);
        if (flow > 0 && flow < 1) {
          const surface = dst.restY + TUBE.bottomPad + dstLevel * TUBE.unitHeight;
          const width = Math.min(1, flow / 0.1, (1 - flow) / 0.1);
          this.streamMesh.visible = true;
          this.streamMesh.position.set(px, surface, 0.3);
          this.streamMesh.scale.set(width, Math.max(0.01, py - surface), width);
        } else {
          this.streamMesh.visible = false;
        }
      },
      onComplete: () => {
        // Reconciliação: o visual passa a ser exatamente o estado lógico.
        this.applyState(finalState, true);
        if (plan.completed !== null) this.celebrateTube(plan.completed);
        for (const r of plan.revealed) this.popReveal(r.tube, r.index);
        onDone();
      },
    });
  }

  private popReveal(tube: number, index: number): void {
    const view = this.views[tube];
    if (!view) return;
    this.track({
      duration: 0.32,
      ease: easing.outBack,
      onUpdate: (t) => view.popUnit(index, 0.35 + 0.65 * t),
      onComplete: () => view.popUnit(index, 1),
    });
  }

  /** Tampa que cai com quique, brilho e som. */
  private celebrateTube(index: number): void {
    const view = this.views[index];
    if (!view) return;
    const color = view.colors[0] ?? -1;
    if (color < 0) return;
    this.opts.sfx('complete');
    view.setCap(color, 1.3);
    this.track({
      duration: 0.6,
      ease: easing.linear,
      onUpdate: (t) => {
        view.setCap(color, 1.3 * (1 - easing.outBounce(Math.min(1, t * 1.4))));
        view.setHalo(0xffffff, 0.85 * (1 - t), 1 + 0.18 * t);
      },
      onComplete: () => {
        view.setCap(color, 0);
        this.setHaloIdle(index);
      },
    });
  }

  private setHaloIdle(index: number): void {
    const view = this.views[index];
    if (!view) return;
    if (this.hint && (this.hint.from === index || this.hint.to === index)) return;
    view.setHalo(null);
  }

  /** Destaca origem e destino de uma dica (`null` apaga). */
  setHint(hint: { from: number; to: number } | null): void {
    if (this.hint) {
      const { from, to } = this.hint;
      this.hint = null;
      this.setHaloIdle(from);
      this.setHaloIdle(to);
    }
    this.hint = hint;
    if (hint) {
      this.views[hint.from]?.setHalo(HINT_FROM, 0.7);
      this.views[hint.to]?.setHalo(HINT_TO, 0.7);
    }
  }

  /** Mãozinha do tutorial/dica (`null` esconde). */
  setHand(target: HandTarget | null): void {
    this.handTarget = target;
    this.handClock = 0;
    if (!target) this.hand.hide();
  }

  /** Confete de vitória. */
  celebrate(): void {
    this.confetti?.dispose();
    const b = this.layout?.bounds ?? { width: 8, height: 12 };
    this.confetti = new Confetti(
      this.stage.scene,
      this.opts.quality === 'high' ? 90 : 40,
      b.width,
      b.height / 2,
    );
  }

  // --- quadro ------------------------------------------------------------------------

  private frame(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    this.particles.update(dt);
    this.confetti?.update(dt);
    if (this.confetti?.done) this.confetti = null;

    if (this.hint) {
      const pulse = 0.5 + 0.25 * Math.sin(this.time * 5);
      this.views[this.hint.from]?.setHalo(HINT_FROM, pulse, 1 + 0.03 * Math.sin(this.time * 5));
      this.views[this.hint.to]?.setHalo(HINT_TO, pulse, 1 + 0.03 * Math.sin(this.time * 5));
    }

    const target = this.handTarget;
    if (target) {
      this.handClock += dt;
      const to = this.views[target.to];
      const from = target.from === null ? to : this.views[target.from];
      if (to && from) {
        const pose = handPose(this.handClock, target.from !== null);
        const x = from.restX + (to.restX - from.restX) * pose.blend;
        const y = from.restY + from.height * 0.4 + (to.restY - from.restY) * pose.blend;
        this.hand.set(x, y, pose.press, pose.alpha);
      }
    }

    // Diagnóstico leve (a cada 0,5 s): chamadas de desenho e triângulos do quadro anterior.
    if (!this.opts.diagnostics) return;
    this.diagClock += dt;
    this.diagFrames++;
    if (this.diagClock >= 0.5) {
      const info = this.stage.renderer.info;
      const ds = this.stage.canvas.dataset;
      ds.calls = String(info.render.calls);
      ds.triangles = String(info.render.triangles);
      ds.geometries = String(info.memory.geometries);
      ds.textures = String(info.memory.textures);
      ds.fps = String(Math.round(this.diagFrames / this.diagClock));
      this.diagClock = 0;
      this.diagFrames = 0;
    }
  }

  // --- limpeza -----------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.offResize();
    this.tracked.clear();
    this.liftTweens.clear();
    this.confetti?.dispose();
    this.confetti = null;
    for (const v of this.views) v.dispose();
    this.views = [];
    if (this.shadows) {
      this.stage.scene.remove(this.shadows);
      this.shadows.dispose();
      this.shadows = null;
    }
    this.stage.scene.remove(this.streamMesh);
    this.hand.dispose();
    this.particles.dispose();
    this.stage.scene.background = null;
    this.bg.dispose();
    this.assets.dispose();
  }
}
