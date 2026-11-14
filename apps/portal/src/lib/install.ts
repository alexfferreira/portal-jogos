export type InstallMode = 'none' | 'prompt' | 'ios';

export interface InstallEnv {
  userAgent: string;
  /** Já está rodando instalado (tela de início). */
  standalone: boolean;
  /** O navegador ofereceu o prompt nativo (Android/Chrome). */
  hasPrompt: boolean;
  dismissed: boolean;
}

/** Decide qual aviso de instalação mostrar. */
export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone || env.dismissed) return 'none';
  if (env.hasPrompt) return 'prompt';
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return 'ios';
  return 'none';
}

/** Evento não padronizado do Chrome/Android. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
  );
}
