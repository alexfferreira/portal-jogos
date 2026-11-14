<script lang="ts">
  import type { GameInstance, HudState } from '@recreio/core';
  import { Button, Icon, IconButton, Modal } from '@recreio/ui';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { app, t } from './app.svelte.ts';
  import type { GameEntry } from './games';

  let { game }: { game: GameEntry } = $props();

  /** Tempo sem o contexto voltar antes de oferecer recarregar o jogo. */
  const GRAPHICS_STUCK_MS = 4000;

  let container = $state<HTMLDivElement>();
  let status = $state<'loading' | 'playing' | 'error'>('loading');
  let paused = $state(false);
  let hud = $state<HudState>({ powerUps: [] });
  let completedLevel = $state<number>();
  let graphicsLost = $state(false);
  let graphicsStuck = $state(false);

  let instance: GameInstance | undefined;
  let stuckTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function clearGraphics() {
    clearTimeout(stuckTimer);
    graphicsLost = false;
    graphicsStuck = false;
  }

  /**
   * Conta o tempo sem o contexto voltar. No celular o contexto costuma cair ao ir para
   * o segundo plano e só volta quando o app reaparece; por isso só conta com a aba visível
   * e recomeça do zero quando ela volta a ficar visível.
   */
  function armStuckTimer() {
    clearTimeout(stuckTimer);
    if (!graphicsLost || graphicsStuck || document.visibilityState !== 'visible') return;
    stuckTimer = setTimeout(() => (graphicsStuck = true), GRAPHICS_STUCK_MS);
  }

  /** Monta o jogo (ou remonta, após erro ou perda de gráficos). */
  async function start() {
    const core = app.core;
    if (!core || !container) return;
    const mine = ++generation;
    instance?.destroy();
    instance = undefined;
    status = 'loading';
    paused = false;
    completedLevel = undefined;
    hud = { powerUps: [] };
    clearGraphics();

    const ctx = core.gameContext(game.id);
    ctx.events.on('hud', (h) => (hud = h));
    ctx.events.on('level-complete', (e) => (completedLevel = e.level));
    ctx.events.on('graphics-lost', () => {
      graphicsLost = true;
      armStuckTimer();
    });
    ctx.events.on('graphics-restored', clearGraphics);

    try {
      const module = await game.load();
      const mounted = await core.mountGame(module, container, ctx);
      if (mine !== generation) {
        // Saiu da tela (ou remontou) enquanto carregava.
        mounted.destroy();
        return;
      }
      instance = mounted;
      status = 'playing';
    } catch (err) {
      ctx.dispose(); // idempotente; cobre falha no import() antes do mountGame
      if (mine !== generation) return;
      console.error('[portal] falha ao abrir o jogo', err);
      status = 'error';
    }
  }

  onMount(() => {
    void start();
    return () => {
      generation++;
      clearTimeout(stuckTimer);
      instance?.destroy();
      instance = undefined;
    };
  });

  const pause = () => {
    instance?.pause();
    paused = true;
  };
  const resume = () => {
    instance?.resume();
    paused = false;
  };
  const restart = () => {
    instance?.restart();
    completedLevel = undefined;
    paused = false;
    instance?.resume();
  };
  const next = () => {
    completedLevel = undefined;
    instance?.next?.();
  };
  const exit = () => goto(resolve('/'));
</script>

<svelte:document onvisibilitychange={armStuckTimer} />

<svelte:head><title>{t(game.meta.titleKey)} · {t('app.name')}</title></svelte:head>

<div class="screen">
  <header>
    <IconButton icon="back" label={t('common.back')} onclick={exit} />
    <div class="title">
      <strong>{t(game.meta.titleKey)}</strong>
      {#if hud.level !== undefined}
        <span data-testid="hud-level">{t('hud.level', { n: hud.level })}</span>
      {/if}
    </div>
    <IconButton
      icon="restart"
      label={t('hud.restart')}
      disabled={status !== 'playing'}
      onclick={restart}
    />
    <IconButton
      icon="pause"
      label={t('hud.pause')}
      disabled={status !== 'playing'}
      onclick={pause}
    />
  </header>

  <div class="stage" bind:this={container} data-testid="stage">
    {#if status === 'loading'}
      <p class="center" role="status">{t('game.loading')}</p>
    {:else if status === 'error'}
      <div class="center">
        <p>{t('game.error')}</p>
        <Button onclick={start}>{t('game.retry')}</Button>
      </div>
    {/if}
    {#if graphicsLost && !graphicsStuck}
      <p class="toast" role="status" data-testid="graphics-recovering">
        {t('graphics.recovering')}
      </p>
    {/if}
  </div>

  {#if hud.powerUps.length > 0}
    <footer class="powerups" data-testid="powerups">
      {#each hud.powerUps as p (p.id)}
        <button
          type="button"
          class="power"
          disabled={p.disabled || p.count <= 0 || status !== 'playing' || paused}
          onclick={() => instance?.usePowerUp?.(p.id)}
          data-testid="powerup-{p.id}"
        >
          <Icon name={p.icon} />
          <span class="label">{t(p.labelKey)}</span>
          <span class="count" data-testid="powerup-{p.id}-count">{p.count}</span>
        </button>
      {/each}
    </footer>
  {/if}
</div>

<Modal open={paused && status === 'playing'} title={t('pause.title')} onclose={resume}>
  {#snippet actions()}
    <Button onclick={resume}><Icon name="play" /> {t('pause.resume')}</Button>
    <Button variant="secondary" onclick={restart}>{t('hud.restart')}</Button>
    <Button variant="ghost" onclick={exit}>{t('pause.exit')}</Button>
  {/snippet}
</Modal>

<Modal open={completedLevel !== undefined} title={t('level.title')}>
  <p data-testid="level-text">{t('level.text', { n: completedLevel ?? 0 })}</p>
  {#snippet actions()}
    <Button onclick={next}>{t('level.next')}</Button>
    <Button variant="ghost" onclick={exit}>{t('common.back')}</Button>
  {/snippet}
</Modal>

<Modal open={graphicsStuck} title={t('graphics.stuck.title')}>
  <p>{t('graphics.stuck.text')}</p>
  {#snippet actions()}
    <Button onclick={start}>{t('graphics.reload')}</Button>
    <Button variant="ghost" onclick={exit}>{t('common.back')}</Button>
  {/snippet}
</Modal>

<style>
  .screen {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
  }
  .title {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.15;
  }
  .title strong {
    font-size: 1.15rem;
  }
  .title span {
    color: var(--ink-soft);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .stage {
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  .center {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    margin: 0;
    color: var(--ink-soft);
    font-weight: 700;
  }
  .toast {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow);
    font-weight: 700;
  }
  .powerups {
    display: flex;
    gap: 12px;
    justify-content: center;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  }
  .power {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 88px;
    min-height: 64px;
    padding: 8px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    box-shadow: 0 4px 0 #c5d6f2;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .power:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 1px 0 #c5d6f2;
  }
  .power:disabled {
    opacity: 0.45;
  }
  .power:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .label {
    font-size: 0.75rem;
    font-weight: 800;
  }
  .count {
    position: absolute;
    top: -8px;
    right: -6px;
    min-width: 24px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--accent);
    color: #5a4700;
    font-size: 0.8rem;
    font-weight: 800;
    text-align: center;
  }
</style>
