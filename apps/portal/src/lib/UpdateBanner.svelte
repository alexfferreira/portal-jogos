<script lang="ts">
  import { Button } from '@recreio/ui';
  import { page } from '$app/state';
  import { t } from './app.svelte.ts';
  import { applyUpdate, dismissUpdate, reloadNow, update } from './sw.svelte.ts';

  // Durante uma partida o aviso espera: nada de toque acidental no meio do jogo. Ele aparece
  // ao voltar para o portal. (O app assume hospedagem na raiz do domínio.)
  const inGame = $derived(page.url.pathname.startsWith('/jogo/'));
  const status = $derived(update.status);
  const visible = $derived(
    !inGame && (status === 'available' || status === 'updating' || status === 'reload'),
  );
</script>

<!-- O contêiner fica sempre no DOM: leitores de tela só anunciam mudanças de uma região viva
     que já existia; trocar só o conteúdo faz o aviso ser lido. -->
<aside class="region" role="status" aria-live="polite" aria-atomic="true">
  {#if visible}
    <div
      class="banner"
      data-testid="update-banner"
      data-status={status}
      aria-busy={status === 'updating'}
    >
      <div class="text">
        <strong>{status === 'reload' ? t('update.reload.title') : t('update.title')}</strong>
        <span>
          {#if status === 'updating'}
            {t('update.updating')}
          {:else if status === 'reload'}
            {t('update.reload.text')}
          {:else}
            {t('update.text')}
          {/if}
        </span>
      </div>
      <div class="actions">
        {#if status === 'reload'}
          <Button onclick={reloadNow}>{t('update.reload.button')}</Button>
        {:else}
          <Button onclick={applyUpdate} disabled={status === 'updating'}>
            {t('update.apply')}
          </Button>
          <Button variant="ghost" onclick={dismissUpdate} disabled={status === 'updating'}>
            {t('update.later')}
          </Button>
        {/if}
      </div>
      {#if status === 'updating'}
        <div class="progress" role="progressbar" aria-label={t('update.updating')}></div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .banner {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 30;
    max-width: 536px;
    margin: 0 auto;
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    border-left: 6px solid var(--primary);
  }
  .text {
    display: grid;
    gap: 2px;
  }
  .text span {
    color: var(--ink-soft);
    line-height: 1.35;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .progress {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--primary) 40%, var(--surface-2) 40%);
    background-size: 200% 100%;
    animation: slide 1s linear infinite;
  }
  @keyframes slide {
    to {
      background-position: -200% 0;
    }
  }
</style>
