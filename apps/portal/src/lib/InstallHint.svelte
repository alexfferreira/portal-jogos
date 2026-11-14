<script lang="ts">
  import { Button } from '@recreio/ui';
  import { onMount } from 'svelte';
  import { app, t } from './app.svelte.ts';
  import {
    installMode,
    isStandalone,
    type BeforeInstallPromptEvent,
    type InstallMode,
  } from './install';

  const KEY = 'install-hint';
  const spec = { version: 1, defaults: () => ({ dismissed: false }) };

  let mode = $state<InstallMode>('none');
  let deferred: BeforeInstallPromptEvent | undefined;
  let dismissed = false;

  function refresh() {
    mode = installMode({
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      hasPrompt: deferred !== undefined,
      dismissed,
    });
  }

  onMount(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // guarda o prompt nativo para o botão "Instalar"
      deferred = e as BeforeInstallPromptEvent;
      refresh();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    (async () => {
      const saved = await app.core?.storage.load(KEY, spec);
      dismissed = saved?.dismissed ?? false;
      refresh();
    })();
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  });

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    deferred = undefined;
    refresh();
  }

  async function dismiss() {
    dismissed = true;
    refresh();
    await app.core?.storage.save(KEY, { dismissed: true }, spec.version);
  }
</script>

{#if mode !== 'none'}
  <aside class="hint" aria-label={t('install.title')} data-testid="install-hint">
    <strong>{t('install.title')}</strong>
    <p>{mode === 'ios' ? t('install.ios') : t('install.prompt')}</p>
    <div class="actions">
      {#if mode === 'prompt'}
        <Button onclick={install}>{t('install.button')}</Button>
      {/if}
      <Button variant="ghost" onclick={dismiss}>{t('install.dismiss')}</Button>
    </div>
  </aside>
{/if}

<style>
  .hint {
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    border-left: 6px solid var(--accent);
  }
  p {
    margin: 4px 0 8px;
    color: var(--ink-soft);
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
