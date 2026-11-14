import { createCore, type Core } from '@recreio/core';

let promise: Promise<Core> | undefined;

/** Instância única dos serviços compartilhados (storage, i18n, áudio, configurações). */
export function getCore(): Promise<Core> {
  promise ??= createCore().then((core) => {
    void core.persist();
    return core;
  });
  return promise;
}
