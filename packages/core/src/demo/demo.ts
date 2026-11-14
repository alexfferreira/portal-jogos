import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GameInstance, GameModule } from '../contract';
import { PALETTE } from '../palette';
import { createToyMaterial } from '../stage/materials';
import type { Stage } from '../stage/stage';
import { easing } from '../tween';

const COLS = 3;
const ROWS = 4;
const GAP = 1.5;

/** Jogo de demonstração: valida palco, picking, tweens, áudio, storage e i18n. */
export const demoGame: GameModule = {
  id: 'demo',
  meta: {
    titleKey: 'demo.title',
    descriptionKey: 'demo.hint',
    icon: 'cube',
    mode: 'score',
    orientation: 'portrait',
  },

  async mount(container, ctx): Promise<GameInstance> {
    const stage: Stage = await ctx.createStage(container, {
      camera: 'perspective-tilted',
      bounds: { width: COLS * GAP, depth: ROWS * GAP },
    });

    const board = new Mesh(
      new PlaneGeometry(COLS * GAP + 0.6, ROWS * GAP + 0.6),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    );
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    stage.scene.add(board);

    const cubes = new Group();
    stage.scene.add(cubes);
    const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.18);
    const restY = 0.5;
    const jumping = new Set<Mesh>();

    PALETTE.slice(0, COLS * ROWS).forEach((color, i) => {
      const cube = new Mesh(geometry, createToyMaterial(color.hex, ctx.settings.get().quality));
      cube.position.set(
        ((i % COLS) - (COLS - 1) / 2) * GAP,
        restY,
        (Math.floor(i / COLS) - (ROWS - 1) / 2) * GAP,
      );
      cube.castShadow = true;
      cube.name = `cube-${i}`;
      cubes.add(cube);
    });

    let taps = 0;
    const jump = (cube: Mesh): void => {
      if (jumping.has(cube)) return;
      jumping.add(cube);
      stage.tweens.add({
        duration: 0.5,
        ease: easing.linear,
        onUpdate: (t) => {
          cube.position.y = restY + Math.sin(t * Math.PI) * 1.2;
          cube.rotation.y = easing.outBack(t) * Math.PI * 0.5;
        },
        onComplete: () => {
          cube.position.y = restY;
          jumping.delete(cube);
        },
      });
    };

    const offTap = stage.onTap((p) => {
      ctx.audio.unlock();
      const hit = stage.pick(p.x, p.y, cubes.children);
      if (!hit) return;
      taps += 1;
      jump(hit.object as Mesh);
      ctx.audio.play('click');
      ctx.haptics.tap();
      ctx.events.emit('score', { score: taps });
    });

    const reset = (): void => {
      stage.tweens.clear(true);
      taps = 0;
      ctx.events.emit('score', { score: 0 });
    };

    let destroyed = false;
    return {
      pause: () => stage.pause(),
      resume: () => stage.resume(),
      restart: reset,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        offTap();
        stage.dispose();
        // A geometria é compartilhada entre os cubos; o stage já liberou, mas isto é idempotente.
        geometry.dispose();
      },
    };
  },
};
