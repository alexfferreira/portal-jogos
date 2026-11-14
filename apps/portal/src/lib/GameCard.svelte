<script lang="ts">
  import { createGameStorage } from '@recreio/core';
  import { Icon } from '@recreio/ui';
  import { resolve } from '$app/paths';
  import { app, t } from './app.svelte.ts';
  import type { GameEntry } from './games';
  import { progressLabel, type ProgressLabel } from './progress';

  let { game }: { game: GameEntry } = $props();

  let label = $state<ProgressLabel>();

  $effect(() => {
    const core = app.core;
    if (!core) return;
    const store = createGameStorage(core.storage, game.id);
    let cancelled = false;
    (async () => {
      const data =
        game.meta.mode === 'levels'
          ? { levels: await store.loadLevels() }
          : { score: await store.loadScore() };
      if (!cancelled) label = progressLabel(game.meta.mode, data);
    })();
    return () => (cancelled = true);
  });
</script>

<a class="card" href={resolve('/jogo/[id]', { id: game.id })} data-testid="card-{game.id}">
  <span class="icon"><Icon name={game.meta.icon} size={40} /></span>
  <span class="text">
    <strong>{t(game.meta.titleKey)}</strong>
    <span class="desc">{t(game.meta.descriptionKey)}</span>
    {#if label}<span class="progress" data-testid="progress-{game.id}"
        >{t(label.key, label.params)}</span
      >{/if}
  </span>
</a>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 88px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    box-shadow:
      0 5px 0 #c5d6f2,
      var(--shadow);
    transition: transform 0.12s var(--ease-pop);
    -webkit-tap-highlight-color: transparent;
  }
  .card:active {
    transform: translateY(3px);
    box-shadow:
      0 2px 0 #c5d6f2,
      var(--shadow);
  }
  .card:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--primary), #6aa0ff);
    color: #fff;
  }
  .text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  strong {
    font-size: 1.2rem;
  }
  .desc {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .progress {
    justify-self: start;
    margin-top: 4px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--accent);
    color: #5a4700;
    font-size: 0.85rem;
    font-weight: 800;
  }
</style>
