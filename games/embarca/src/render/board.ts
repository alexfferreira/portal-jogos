/**
 * O tabuleiro 3D da Embarca: chão, veículos, vagas e fila. Só reflete o estado que a lógica
 * entrega e anima as transições; nunca decide regra. Recebe a jogada e os estados antes/depois.
 *
 * Interrompível: toda animação é registrada; `finishAnimations()` salta todas para o fim e, ao
 * terminar, o visual é reconciliado com o `State` lógico. Trocar de fase descarta o que estava
 * em andamento sem chamar o `onDone` antigo (época).
 */
import {
  createToyMaterial,
  easing,
  paletteColor,
  type Quality,
  type Stage,
  type TweenHandle,
  type TweenOptions,
} from '@recreio/core';
import { Group, Mesh, OrthographicCamera, type BufferGeometry, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  cos,
  sin,
  TRIG_SCALE,
  VEHICLE_SPECS,
  type Level,
  type Move,
  type MoveApplied,
  type MoveRejected,
  type Slot,
  type State,
} from '../logic';
import { Confetti, Hand, handPulse, HintRing } from './effects';
import { computeLayout, pickVehicle, UNIT, type Layout, type WorldPoint } from './layout';
import { PARKED_HEADING, planMove, type PathPoint, type Step } from './plan';
import { QueueView } from './queueView';
import { SlotsView } from './slotsView';
import { createSymbolAtlas, createVehicleSymbol, type SymbolAtlas } from './symbols';
import { createVehicleView, placeVehicle, VehicleAssets } from './vehicleView';

/** O que o tabuleiro precisa do palco (permite um palco falso nos testes). */
export type BoardStage = Pick<
  Stage,
  'scene' | 'camera' | 'tweens' | 'size' | 'onResize' | 'setBounds' | 'onFrame'
>;

export interface ScreenBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardOptions {
  stage: BoardStage;
  quality: Quality;
  onAnimating?(animating: boolean): void;
  /** Retângulos dos veículos no tabuleiro, em px do canvas (para dados de teste). */
  onLayout?(boxes: ScreenBox[]): void;
  /** Sons nos instantes certos da animação (estacionar, veículo cheio partindo, impacto). */
  sfx?(name: 'click' | 'complete' | 'error'): void;
  /** Fábrica do atlas de símbolos (padrão: o atlas desenhado em canvas, só no navegador). */
  atlas?(): SymbolAtlas;
}

const SLOT_LIFT = 0.04;
/** Altura do veículo em deslocamento: acima do teto do ônibus (~0,8), para não atravessar ninguém. */
const TRAVEL_LIFT = 1.0;
const GROUND_COLOR = 0xf4f7fb;

/** Sobe no começo do deslocamento e (se `landing`) desce no fim, partindo da altura `base`. */
function travelLift(t: number, base: number, landing: boolean): number {
  const ramp = Math.max(0, Math.min(1, t / 0.12, landing ? (1 - t) / 0.12 : 1));
  return base + (TRAVEL_LIFT - base) * ramp;
}

/** Posição e direção ao longo de um caminho, por fração da distância percorrida. */
function sample(path: readonly PathPoint[], lengths: readonly number[], t: number): PathPoint {
  const total = lengths[lengths.length - 1] ?? 0;
  const first = path[0] as PathPoint;
  if (total === 0 || path.length < 2) return first;
  const target = Math.min(Math.max(t, 0), 1) * total;
  let i = 1;
  while (i < lengths.length - 1 && (lengths[i] as number) < target) i++;
  const a = path[i - 1] as PathPoint;
  const b = path[i] as PathPoint;
  const segStart = lengths[i - 1] as number;
  const segLen = (lengths[i] as number) - segStart;
  const u = segLen === 0 ? 1 : (target - segStart) / segLen;
  // Direção pelo caminho mais curto entre os dois ângulos.
  let dh = b.heading - a.heading;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: a.heading + dh * u };
}

function cumulative(path: readonly PathPoint[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PathPoint;
    const b = path[i] as PathPoint;
    out.push((out[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return out;
}

export class Board {
  private readonly stage: BoardStage;
  private quality: Quality;
  private readonly opts: BoardOptions;
  private readonly root = new Group();
  private assets = new VehicleAssets();
  private readonly views = new Map<number, Group>();
  private ground: Mesh | null = null;
  private groundGeometry: BufferGeometry | null = null;
  private groundMaterial: Material | null = null;
  private queue: QueueView | null = null;
  private slots: SlotsView | null = null;
  private level: Level | null = null;
  private layout: Layout | null = null;
  private state: State | null = null;
  private shownOnBoard: number[] = [];
  private shownSlots: (number | null)[] = [];
  private shownQueue = 0;
  private liveSlots: (Slot | null)[] = [];
  private readonly tracked = new Set<TweenHandle>();
  private epoch = 0;
  private disposed = false;
  private readonly offResize: () => void;
  private readonly offFrame: () => void;
  private readonly hintRing = new HintRing();
  private readonly hand = new Hand();
  private confetti: Confetti | null = null;
  private handVehicle: number | null = null;
  /** Veículo da dica mostrada no momento (para sobreviver a uma jogada recusada). */
  private hintVehicle: number | null = null;
  private clock = 0;
  private colorblind = false;
  private atlas: SymbolAtlas | null = null;
  private vehicleSymbols: Mesh[] = [];

  constructor(opts: BoardOptions) {
    this.opts = opts;
    this.stage = opts.stage;
    this.quality = opts.quality;
    this.stage.scene.add(this.root);
    this.offResize = this.stage.onResize(() => this.publishLayout());
    this.hintRing.object.name = 'hint-ring';
    this.hand.object.name = 'hand';
    this.root.add(this.hintRing.object, this.hand.object);
    this.offFrame = this.stage.onFrame((dt) => this.tick(dt));
  }

  // --- montagem --------------------------------------------------------------------

  /** Fase nova: recria tudo, enquadra o conteúdo e mostra o estado (sem animar). */
  setLevel(level: Level, state: State): void {
    this.discard();
    this.teardown();
    this.level = level;
    this.layout = computeLayout(level, state.slots.length);
    const layout = this.layout;

    this.groundGeometry = new RoundedBoxGeometry(
      layout.board.width,
      0.08,
      layout.board.depth,
      3,
      0.05,
    );
    this.groundMaterial = createToyMaterial(GROUND_COLOR, this.quality);
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.position.set(layout.board.cx, -0.04, layout.board.cz);
    this.ground.receiveShadow = true;
    this.root.add(this.ground);

    this.queue = new QueueView(layout, level.queue, this.quality);
    this.slots = new SlotsView(layout, level, this.quality);
    this.root.add(this.queue.object, this.slots.object);
    for (const v of level.vehicles) {
      const view = createVehicleView(this.assets, v, this.quality);
      this.views.set(v.id, view);
      this.root.add(view);
    }

    this.stage.setBounds({ width: layout.width, depth: layout.depth });
    this.applyState(state);
    this.applySymbols();
    this.publishLayout();
  }

  /** Mostra o estado sem animar (termina antes qualquer animação em curso). */
  setState(state: State): void {
    this.finishAnimations();
    // Vaga extra (ou volta ao normal): o layout depende do número de vagas.
    if (
      this.level !== null &&
      this.layout !== null &&
      state.slots.length !== this.layout.slots.length
    ) {
      this.setLevel(this.level, state);
      return;
    }
    this.applyState(state);
    this.publishLayout();
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    if (this.level === null || this.state === null) return;
    const { level, state } = { level: this.level, state: this.state };
    this.discard();
    this.teardown();
    this.assets.dispose();
    this.assets = new VehicleAssets();
    this.setLevel(level, state);
  }

  /** Sincroniza o visual com o estado (veículos, vagas e fila) sem animar. */
  private applyState(state: State): void {
    const level = this.level;
    const layout = this.layout;
    if (level === null || layout === null) return;
    this.state = state;
    this.clearOverlays();
    const slotOf = new Map<number, number>();
    state.slots.forEach((s, i) => {
      if (s !== null) slotOf.set(s.vehicle, i);
    });
    for (const v of level.vehicles) {
      const view = this.views.get(v.id);
      if (view === undefined) continue;
      const slot = slotOf.get(v.id);
      if (state.onBoard.includes(v.id)) {
        view.visible = true;
        placeVehicle(view, layout.toWorld(v.cx, v.cy), (v.angle * Math.PI) / 180, 0);
      } else if (slot !== undefined && slot < layout.slots.length) {
        view.visible = true;
        placeVehicle(view, layout.slotCenter(slot), PARKED_HEADING, SLOT_LIFT);
      } else {
        view.visible = false;
      }
    }
    this.shownOnBoard = [...state.onBoard];
    this.shownSlots = layout.slots.map((_, i) => state.slots[i]?.vehicle ?? null);
    this.shownQueue = state.queueIndex;
    this.liveSlots = layout.slots.map((_, i) => state.slots[i] ?? null);
    this.slots?.setSlots(this.liveSlots);
    this.queue?.setProgress(state.queueIndex);
  }

  private teardown(): void {
    this.clearOverlays();
    this.vehicleSymbols = [];
    for (const view of this.views.values()) this.root.remove(view);
    this.views.clear();
    if (this.queue) {
      this.root.remove(this.queue.object);
      this.queue.dispose();
      this.queue = null;
    }
    if (this.slots) {
      this.root.remove(this.slots.object);
      this.slots.dispose();
      this.slots = null;
    }
    if (this.ground) this.root.remove(this.ground);
    this.groundGeometry?.dispose();
    this.groundMaterial?.dispose();
    this.ground = null;
    this.groundGeometry = null;
    this.groundMaterial = null;
  }

  // --- modo daltônico --------------------------------------------------------------

  private makeAtlas(): SymbolAtlas | null {
    if (this.opts.atlas) return this.opts.atlas();
    if (typeof document === 'undefined') return null;
    return createSymbolAtlas(this.quality === 'low' ? 64 : 128);
  }

  /** Liga ou desliga os símbolos de cor nos veículos e nos passageiros da fila. */
  setColorblind(on: boolean): void {
    if (on === this.colorblind && (!on || this.atlas !== null)) return;
    this.colorblind = on;
    if (on) this.applySymbols();
    else this.removeSymbols();
  }

  /** Cria (ou refaz, depois de uma fase nova) os símbolos, se o modo estiver ligado. */
  private applySymbols(): void {
    if (!this.colorblind || this.level === null) return;
    this.atlas ??= this.makeAtlas();
    const atlas = this.atlas;
    if (atlas === null) return;
    this.vehicleSymbols = [];
    for (const v of this.level.vehicles) {
      const view = this.views.get(v.id);
      if (view === undefined) continue;
      const symbol = createVehicleSymbol(atlas, v);
      view.add(symbol);
      this.vehicleSymbols.push(symbol);
    }
    this.queue?.setSymbols(atlas);
    this.uprightSymbols();
  }

  private removeSymbols(): void {
    for (const m of this.vehicleSymbols) m.removeFromParent();
    this.vehicleSymbols = [];
    this.queue?.setSymbols(null);
    this.atlas?.dispose();
    this.atlas = null;
  }

  /** O símbolo gira ao contrário do veículo, para ficar sempre em pé na tela. */
  private uprightSymbols(): void {
    for (const m of this.vehicleSymbols) m.rotation.y = -(m.parent?.rotation.y ?? 0);
  }

  /** Símbolos visíveis agora (0 com o modo desligado). */
  visibleSymbols(): number {
    if (!this.colorblind || this.atlas === null || this.level === null) return 0;
    const onVehicles = this.vehicleSymbols.filter((m) => m.parent?.visible === true).length;
    return onVehicles + (this.queue?.visibleSymbols ?? 0);
  }

  // --- dica, mãozinha e confete ----------------------------------------------------

  /** Dica, mão e confete somem a qualquer mudança de estado ou de fase. */
  private clearOverlays(): void {
    this.hintRing.hide();
    this.hintVehicle = null;
    this.hand.hide();
    this.handVehicle = null;
    if (this.confetti) {
      this.confetti.dispose();
      this.confetti = null;
    }
  }

  private vehicleCenter(id: number): WorldPoint | null {
    const v = this.level?.vehicles[id];
    if (v === undefined || this.layout === null) return null;
    return this.layout.toWorld(v.cx, v.cy);
  }

  get hasHint(): boolean {
    return this.hintRing.object.visible;
  }

  /** Há confete no ar. */
  get hasConfetti(): boolean {
    return this.confetti !== null;
  }

  /** Vagas mostradas no momento (4, ou 5 com a vaga extra). */
  get slotCount(): number {
    return this.layout?.slots.length ?? 0;
  }

  /** Anel pulsante sob o veículo sugerido; `null` esconde. */
  setHint(vehicleId: number | null): void {
    const center = vehicleId === null ? null : this.vehicleCenter(vehicleId);
    const v = vehicleId === null ? undefined : this.level?.vehicles[vehicleId];
    if (center === null || v === undefined || !this.shownOnBoard.includes(vehicleId as number)) {
      this.hintRing.hide();
      this.hintVehicle = null;
      return;
    }
    this.hintVehicle = vehicleId;
    this.hintRing.show(center, VEHICLE_SPECS[v.kind].length / 2 / UNIT + 0.4);
  }

  /** Mãozinha tocando no centro do veículo; `null` esconde. */
  setHand(vehicleId: number | null): void {
    if (vehicleId === this.handVehicle) return; // não reinicia o pulso à toa
    this.handVehicle = vehicleId;
    this.clock = 0;
    if (vehicleId === null) this.hand.hide();
    else this.tick(0);
  }

  /** Estouro de confete no centro do tabuleiro, nas cores dos veículos da fase. */
  celebrate(): void {
    const layout = this.layout;
    const level = this.level;
    if (layout === null || level === null) return;
    this.confetti?.dispose();
    const colors = [...new Set(level.vehicles.map((v) => paletteColor(v.color).hex))];
    const confetti = new Confetti(90);
    this.root.add(confetti.object);
    confetti.start({ x: layout.board.cx, z: layout.board.cz }, colors);
    this.confetti = confetti;
  }

  /** A cada quadro: pulso do anel, mãozinha e confete. */
  private tick(dt: number): void {
    this.clock += dt;
    if (this.colorblind) this.uprightSymbols();
    if (this.hintRing.object.visible) this.hintRing.update(this.clock);
    if (this.handVehicle !== null) {
      const point = this.shownOnBoard.includes(this.handVehicle)
        ? this.vehicleCenter(this.handVehicle)
        : null;
      if (point === null) this.hand.hide();
      else {
        const pose = handPulse(this.clock);
        this.hand.set(point, pose.press, pose.alpha);
      }
    }
    if (this.confetti) {
      this.confetti.update(dt);
      if (this.confetti.done) {
        this.confetti.dispose();
        this.confetti = null;
      }
    }
  }

  // --- animações -------------------------------------------------------------------

  get animating(): boolean {
    return this.tracked.size > 0;
  }

  private notify(animating: boolean): void {
    this.opts.onAnimating?.(animating);
    if (!animating) this.publishLayout();
  }

  /** Registra um tween: some da lista ao terminar e ignora callbacks de uma época antiga. */
  private track(options: TweenOptions): TweenHandle {
    const mine = this.epoch;
    const handle: TweenHandle = this.stage.tweens.add({
      ...options,
      onUpdate: (v) => {
        if (mine === this.epoch) options.onUpdate(v);
      },
      onComplete: () => {
        this.tracked.delete(handle);
        if (mine === this.epoch) options.onComplete?.();
        if (this.tracked.size === 0) this.notify(false);
      },
    });
    this.tracked.add(handle);
    if (this.tracked.size === 1) this.notify(true);
    return handle;
  }

  /** Termina TODAS as animações agora (cada uma salta para o fim e reconcilia). */
  finishAnimations(): void {
    let guard = 0;
    while (this.tracked.size > 0 && guard++ < 20) {
      for (const handle of [...this.tracked]) handle.cancel(true);
    }
    this.tracked.clear();
  }

  /** Descarta a animação em andamento sem reconciliar nem chamar o `onDone` (troca de fase). */
  private discard(): void {
    this.epoch++;
    for (const handle of [...this.tracked]) handle.cancel(false);
    this.tracked.clear();
  }

  /**
   * Anima a jogada `move` (já decidida pela lógica) e, ao fim, reconcilia com `after` e chama
   * `onDone` uma vez. Se a fase mudar no meio, `onDone` não é chamado.
   */
  playMove(
    before: State,
    move: Move,
    result: MoveApplied | MoveRejected,
    after: State,
    onDone: () => void,
  ): void {
    this.finishAnimations();
    // Uma jogada aceita muda o estado e apaga a dica; uma recusada (bate e volta) não: a dica
    // que o jogador já gastou continua valendo, e é restaurada ao reconciliar o visual.
    const keepHint = result.ok ? null : this.hintVehicle;
    if (result.ok) {
      this.hintRing.hide();
      this.hintVehicle = null;
    }
    const restoreHint = (): void => {
      if (keepHint !== null) this.setHint(keepHint);
    };
    const layout = this.layout;
    if (this.level === null || layout === null) {
      onDone();
      return;
    }
    const plan = planMove(before, move, result, layout);
    if (plan.steps.length === 0) {
      this.applyState(after);
      restoreHint();
      onDone();
      return;
    }
    let remaining = plan.steps.length;
    const flyers: Mesh[] = [];
    const stepDone = (): void => {
      remaining--;
      if (remaining > 0) return;
      for (const f of flyers) this.queue?.recycleFlyer(f);
      this.applyState(after);
      restoreHint();
      onDone();
    };
    for (const step of plan.steps) this.runStep(step, flyers, stepDone);
  }

  private runStep(step: Step, flyers: Mesh[], done: () => void): void {
    const base = { duration: step.duration, delay: step.delay };
    const view = this.views.get(step.vehicle as number);
    switch (step.kind) {
      case 'drive': {
        const lengths = cumulative(step.path);
        this.track({
          ...base,
          ease: easing.inOutQuad,
          onUpdate: (t) => {
            if (view === undefined) return;
            const p = sample(step.path, lengths, t);
            placeVehicle(view, p, p.heading, travelLift(t, 0, true));
          },
          onComplete: () => {
            const layout = this.layout;
            const vehicle = this.level?.vehicles[step.vehicle];
            if (view !== undefined && layout !== null) {
              placeVehicle(view, layout.slotCenter(step.slot), PARKED_HEADING, SLOT_LIFT);
            }
            if (vehicle !== undefined) {
              this.liveSlots[step.slot] = { vehicle: step.vehicle, filled: 0 };
              this.slots?.setSlots(this.liveSlots);
            }
            this.opts.sfx?.('click');
            done();
          },
        });
        break;
      }
      case 'board': {
        let flyer: Mesh | null = null;
        this.track({
          ...base,
          ease: easing.outCubic,
          onUpdate: (t) => {
            if (flyer === null) {
              this.queue?.setProgress(step.passenger + 1);
              flyer = this.queue?.flyer(step.passenger) ?? null;
              if (flyer !== null) flyers.push(flyer);
            }
            if (flyer === null) return;
            flyer.position.set(
              step.from.x + (step.to.x - step.from.x) * t,
              0.15 + 0.6 * Math.sin(Math.PI * t),
              step.from.z + (step.to.z - step.from.z) * t,
            );
          },
          onComplete: () => {
            const cur = this.liveSlots[step.slot];
            if (cur !== null && cur !== undefined) {
              this.liveSlots[step.slot] = { vehicle: cur.vehicle, filled: cur.filled + 1 };
              this.slots?.setSlots(this.liveSlots);
            }
            if (flyer !== null) flyer.visible = false;
            done();
          },
        });
        break;
      }
      case 'depart': {
        const lengths = cumulative(step.path);
        let started = false;
        this.track({
          ...base,
          ease: easing.inOutQuad,
          onUpdate: (t) => {
            if (!started) {
              started = true;
              this.opts.sfx?.('complete');
            }
            if (view === undefined) return;
            const p = sample(step.path, lengths, t);
            placeVehicle(view, p, p.heading, travelLift(t, SLOT_LIFT, false));
          },
          onComplete: () => {
            if (view !== undefined) view.visible = false;
            this.liveSlots[step.slot] = null;
            this.slots?.setSlots(this.liveSlots);
            done();
          },
        });
        break;
      }
      case 'bump':
        this.bump(step, base, done);
        break;
      case 'shake':
        this.shake(step, base, done);
        break;
    }
  }

  private home(vehicleId: number): { p: WorldPoint; heading: number } | null {
    const v = this.level?.vehicles[vehicleId];
    if (v === undefined || this.layout === null) return null;
    return { p: this.layout.toWorld(v.cx, v.cy), heading: (v.angle * Math.PI) / 180 };
  }

  /** Bate e volta: avança até perto do bloqueador e recua; o bloqueador estremece. */
  private bump(
    step: Extract<Step, { kind: 'bump' }>,
    base: { duration: number; delay: number },
    done: () => void,
  ): void {
    const view = this.views.get(step.vehicle);
    const home = this.home(step.vehicle);
    if (view === undefined || home === null) {
      done();
      return;
    }
    const dir = { x: Math.cos(home.heading), z: -Math.sin(home.heading) };
    const back = step.duration - step.forwardDuration;
    let hit = false;
    this.track({
      ...base,
      onUpdate: (t) => {
        const time = t * step.duration;
        if (!hit && time >= step.forwardDuration) {
          hit = true;
          this.opts.sfx?.('error');
        }
        // Ida acelerando até o contato; depois a volta, desacelerando até o lugar de origem.
        const off =
          time < step.forwardDuration
            ? step.forward * (time / step.forwardDuration) ** 2
            : step.forward * (1 - easing.outCubic((time - step.forwardDuration) / back));
        placeVehicle(view, { x: home.p.x + dir.x * off, z: home.p.z + dir.z * off }, home.heading);
        // O bloqueador estremece só depois do impacto.
        const after = Math.max(0, time - step.forwardDuration) / back;
        const wiggle =
          time < step.forwardDuration ? 0 : 0.06 * Math.sin(Math.PI * 4 * after) * (1 - after);
        for (const id of step.blockers) {
          const b = this.views.get(id);
          const h = this.home(id);
          if (b === undefined || h === null) continue;
          b.position.set(h.p.x + dir.x * wiggle, 0, h.p.z + dir.z * wiggle);
        }
      },
      onComplete: () => {
        placeVehicle(view, home.p, home.heading);
        for (const id of step.blockers) {
          const b = this.views.get(id);
          const h = this.home(id);
          if (b !== undefined && h !== null) placeVehicle(b, h.p, h.heading);
        }
        done();
      },
    });
  }

  /** Recusa por falta de vaga: o veículo balança no lugar. */
  private shake(
    step: Extract<Step, { kind: 'shake' }>,
    base: { duration: number; delay: number },
    done: () => void,
  ): void {
    const view = this.views.get(step.vehicle);
    const home = this.home(step.vehicle);
    if (view === undefined || home === null) {
      done();
      return;
    }
    const side = { x: Math.sin(home.heading), z: Math.cos(home.heading) };
    let started = false;
    this.track({
      ...base,
      onUpdate: (t) => {
        if (!started) {
          started = true;
          this.opts.sfx?.('error');
        }
        const off = 0.08 * Math.sin(Math.PI * 6 * t) * (1 - t);
        placeVehicle(
          view,
          { x: home.p.x + side.x * off, z: home.p.z + side.z * off },
          home.heading,
        );
      },
      onComplete: () => {
        placeVehicle(view, home.p, home.heading);
        done();
      },
    });
  }

  // --- toque e dados ---------------------------------------------------------------

  /** Veículo (no tabuleiro) escolhido por um toque em px do canvas, ou `null`. */
  pick(px: number, py: number): number | null {
    const view = this.pickView();
    if (this.level === null || this.layout === null || view === null) return null;
    return pickVehicle(this.level, this.shownOnBoard, this.layout, view, px, py);
  }

  private pickView(): {
    width: number;
    height: number;
    halfWidth: number;
    halfHeight: number;
  } | null {
    const cam = this.stage.camera;
    if (!(cam instanceof OrthographicCamera)) return null;
    const { width, height } = this.stage.size;
    return {
      width,
      height,
      halfWidth: (cam.right - cam.left) / (2 * cam.zoom),
      halfHeight: (cam.top - cam.bottom) / (2 * cam.zoom),
    };
  }

  /** Retângulo (caixa envolvente) de cada veículo no tabuleiro, em px do canvas. */
  screenBoxes(): ScreenBox[] {
    const view = this.pickView();
    const level = this.level;
    const layout = this.layout;
    if (view === null || level === null || layout === null) return [];
    const toPx = (p: WorldPoint): [number, number] => [
      (p.x / (2 * view.halfWidth) + 0.5) * view.width,
      (p.z / (2 * view.halfHeight) + 0.5) * view.height,
    ];
    const round = (n: number): number => Math.round(n * 10) / 10;
    const boxes: ScreenBox[] = [];
    for (const id of this.shownOnBoard) {
      const v = level.vehicles[id];
      if (v === undefined) continue;
      const spec = VEHICLE_SPECS[v.kind];
      const ux = cos(v.angle) / TRIG_SCALE;
      const uy = sin(v.angle) / TRIG_SCALE;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          const x = v.cx + (a * spec.length * ux) / 2 - (b * spec.width * uy) / 2;
          const y = v.cy + (a * spec.length * uy) / 2 + (b * spec.width * ux) / 2;
          const [px, py] = toPx(layout.toWorld(x, y));
          xs.push(px);
          ys.push(py);
        }
      }
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      boxes.push({
        id,
        x: round(x0),
        y: round(y0),
        w: round(Math.max(...xs) - x0),
        h: round(Math.max(...ys) - y0),
      });
    }
    return boxes;
  }

  private publishLayout(): void {
    this.opts.onLayout?.(this.screenBoxes());
  }

  /**
   * Descrição do que o visual mostra: `b:<veículos no tabuleiro>|s:<veículo em cada vaga, ou ->|q:<passageiros
   * já escondidos da fila>`. Serve para conferir que o visual coincide com o estado lógico.
   */
  viewString(): string {
    return `b:${this.shownOnBoard.join(',')}|s:${this.shownSlots.map((s) => s ?? '-').join(',')}|q:${this.shownQueue}`;
  }

  // --- limpeza ---------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.discard();
    this.offResize();
    this.offFrame();
    this.removeSymbols();
    this.teardown();
    this.hintRing.dispose();
    this.hand.dispose();
    this.assets.dispose();
    this.stage.scene.remove(this.root);
    this.level = null;
    this.layout = null;
    this.state = null;
  }
}
