<script lang="ts">
  import {
    demoGame,
    LOCALES,
    type Core,
    type GameInstance,
    type Locale,
    type Stage,
  } from '@recreio/core';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { getCore } from '#lib/core.ts';

  let container: HTMLDivElement;
  let core = $state<Core>();
  let locale = $state<Locale>('pt-BR');
  let colorblind = $state(false);
  let score = $state(0);
  let stage: Stage | undefined;

  const t = (key: string): string => {
    void locale; // dependência reativa: relê ao trocar o idioma
    return core?.i18n.t(key) ?? '';
  };

  onMount(() => {
    let instance: GameInstance | undefined;
    let cancelled = false;
    window.__stageStats = () => stage?.stats();

    (async () => {
      const c = await getCore();
      core = c;
      locale = c.i18n.locale;
      colorblind = c.settings.get().colorblind;
      c.i18n.subscribe((l) => (locale = l));

      const ctx = c.gameContext(demoGame.id);
      ctx.events.on('score', (e) => (score = e.score));
      const wrapped = {
        ...ctx,
        createStage: (el: HTMLElement, o: Parameters<typeof ctx.createStage>[1]) => {
          stage = ctx.createStage(el, o);
          return stage;
        },
      };
      const inst = await demoGame.mount(container, wrapped);
      if (cancelled) inst.destroy();
      else instance = inst;
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
      stage = undefined;
      delete window.__stageStats;
    };
  });

  function setLocale(l: Locale) {
    core?.settings.set({ locale: l });
  }

  function toggleColorblind() {
    colorblind = !colorblind;
    core?.settings.set({ colorblind });
  }
</script>

<div class="screen">
  <div class="stage" bind:this={container} data-testid="stage"></div>

  <header>
    <a href={resolve('/')} class="back">{t('common.back')}</a>
    <h1>{t('demo.title')}</h1>
  </header>

  <footer>
    <p data-testid="hint">{t('demo.hint')}</p>
    <p data-testid="score">{score}</p>
    <div class="row">
      {#each LOCALES as l (l)}
        <button type="button" class:active={locale === l} onclick={() => setLocale(l)}>{l}</button>
      {/each}
    </div>
    <label class="row">
      <input type="checkbox" checked={colorblind} onchange={toggleColorblind} />
      {t('settings.colorblind')}
    </label>
  </footer>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .stage {
    position: absolute;
    inset: 0;
  }
  header,
  footer {
    position: relative;
    z-index: 1;
    pointer-events: none;
    padding: 12px 16px;
  }
  header > *,
  footer > * {
    pointer-events: auto;
  }
  footer {
    margin-top: auto;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
  h1 {
    margin: 4px 0;
    font-size: 1.25rem;
  }
  p {
    margin: 4px 0;
  }
  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: inherit;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
  }
  button {
    min-width: 44px;
    min-height: 44px;
    border-radius: 12px;
    border: 2px solid #1e63e0;
    background: #fff;
    color: #1e63e0;
    font: inherit;
  }
  button.active {
    background: #1e63e0;
    color: #fff;
  }
</style>
