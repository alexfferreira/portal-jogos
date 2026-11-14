<script lang="ts">
  import { createGameStorage, LOCALES, type Locale, type Quality } from '@recreio/core';
  import { Button, Icon, IconButton, Modal, Segmented, Slider, Toggle } from '@recreio/ui';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { app, t } from '#lib/app.svelte.ts';
  import { downloadBackup, readJsonFile } from '#lib/backup.ts';
  import { games, type GameEntry } from '#lib/games.ts';
  import { LOCALE_NAMES } from '#lib/messages.ts';
  import { onMount } from 'svelte';

  const settings = $derived(app.settings);
  const set = (patch: Parameters<NonNullable<typeof app.core>['settings']['set']>[0]) =>
    app.core?.settings.set(patch);

  const localeOptions = LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }));
  const qualityOptions = $derived([
    { value: 'high' as Quality, label: t('settings.quality.high') },
    { value: 'low' as Quality, label: t('settings.quality.low') },
  ]);

  // --- backup ---
  let fileInput = $state<HTMLInputElement>();
  let message = $state('');

  // raw: o IndexedDB não consegue clonar o proxy profundo que `$state` criaria.
  let pendingImport = $state.raw<{ data: unknown }>();
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(reloadTimer));

  async function exportBackup() {
    if (!app.core) return;
    try {
      downloadBackup(await app.core.storage.exportAll());
    } catch (err) {
      console.error('[portal] falha ao exportar', err);
      message = t('backup.failed');
    }
  }

  /** Lê o arquivo escolhido e pede confirmação: importar substitui o progresso atual. */
  async function chooseBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (data === undefined) message = t('backup.invalid');
      else pendingImport = { data };
    } catch (err) {
      console.error('[portal] falha ao ler o backup', err);
      message = t('backup.failed');
    }
  }

  async function confirmImport() {
    const pending = pendingImport;
    pendingImport = undefined;
    if (!pending || !app.core) return;
    try {
      const result = await app.core.storage.importAll(pending.data);
      if (!result.ok) {
        message = t('backup.invalid');
        return;
      }
      message = t('backup.imported', { count: result.imported });
      // Configurações e serviços já carregados ficaram velhos: recarrega para aplicar tudo.
      reloadTimer = setTimeout(() => location.reload(), 1200);
    } catch (err) {
      console.error('[portal] falha ao importar', err);
      message = t('backup.failed');
    }
  }

  // --- reiniciar progresso (confirmação dentro do app) ---
  let resetting = $state<GameEntry>();

  async function confirmReset() {
    const game = resetting;
    resetting = undefined;
    if (!game || !app.core) return;
    await createGameStorage(app.core.storage, game.id).reset();
    message = t('settings.reset.done');
  }
</script>

<svelte:head><title>{t('settings.title')} · {t('app.name')}</title></svelte:head>

<main>
  <header>
    <IconButton icon="back" label={t('common.back')} onclick={() => goto(resolve('/'))} />
    <h1>{t('settings.title')}</h1>
  </header>

  {#if settings}
    <section>
      <h2>{t('settings.language')}</h2>
      <Segmented
        label={t('settings.language')}
        options={localeOptions}
        value={settings.locale}
        onchange={(v: Locale) => set({ locale: v })}
      />
    </section>

    <section>
      <h2>{t('settings.sound')}</h2>
      <Slider
        label={t('settings.sfx')}
        value={settings.sfxVolume}
        onchange={(v) => set({ sfxVolume: v })}
      />
      <Slider
        label={t('settings.music')}
        value={settings.musicVolume}
        onchange={(v) => set({ musicVolume: v })}
      />
      <Toggle
        label={t('settings.vibration')}
        checked={settings.vibration}
        onchange={(v) => set({ vibration: v })}
      />
    </section>

    <section>
      <h2>{t('settings.quality')}</h2>
      <Segmented
        label={t('settings.quality')}
        options={qualityOptions}
        value={settings.quality}
        onchange={(v: Quality) => set({ quality: v })}
      />
      <Toggle
        label={t('settings.colorblind')}
        checked={settings.colorblind}
        onchange={(v) => set({ colorblind: v })}
      />
    </section>

    <section>
      <h2>{t('settings.backup')}</h2>
      <p class="hint">{t('backup.hint')}</p>
      <div class="buttons">
        <Button variant="secondary" onclick={exportBackup}>
          <Icon name="download" />
          {t('backup.export')}
        </Button>
        <Button variant="secondary" onclick={() => fileInput?.click()}>
          <Icon name="upload" />
          {t('backup.import')}
        </Button>
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onchange={chooseBackup}
        data-testid="backup-file"
      />
    </section>

    <section>
      <h2>{t('settings.games')}</h2>
      {#each games as game (game.id)}
        <div class="game-row">
          <span>{t(game.meta.titleKey)}</span>
          <Button variant="ghost" onclick={() => (resetting = game)}>
            <Icon name="trash" />
            {t('settings.reset')}
          </Button>
        </div>
      {/each}
    </section>

    <p class="message" role="status" data-testid="message">{message}</p>
  {/if}
</main>

<Modal
  open={resetting !== undefined}
  title={t('settings.reset.title', { game: resetting ? t(resetting.meta.titleKey) : '' })}
  onclose={() => (resetting = undefined)}
  initialFocus="last"
>
  <p>{t('settings.reset.text')}</p>
  {#snippet actions()}
    <Button variant="danger" onclick={confirmReset}>{t('settings.reset.confirm')}</Button>
    <Button variant="ghost" onclick={() => (resetting = undefined)}>{t('common.cancel')}</Button>
  {/snippet}
</Modal>

<Modal
  open={pendingImport !== undefined}
  title={t('backup.confirm.title')}
  onclose={() => (pendingImport = undefined)}
  initialFocus="last"
>
  <p>{t('backup.confirm.text')}</p>
  {#snippet actions()}
    <Button variant="danger" onclick={confirmImport}>{t('backup.confirm.button')}</Button>
    <Button variant="ghost" onclick={() => (pendingImport = undefined)}>{t('common.cancel')}</Button
    >
  {/snippet}
</Modal>

<style>
  main {
    display: grid;
    gap: 16px;
    max-width: 560px;
    margin: 0 auto;
    padding: calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
  }
  section {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--ink-soft);
    line-height: 1.4;
  }
  .buttons {
    display: grid;
    gap: 10px;
  }
  .game-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 700;
  }
  .message {
    min-height: 1.4em;
    margin: 0;
    text-align: center;
    font-weight: 700;
    color: var(--ok);
  }
</style>
