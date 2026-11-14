declare global {
  namespace App {}
  interface Window {
    /** Gancho de verificação (e2e): contadores do renderer do palco da demo. */
    __stageStats?: () => { geometries: number; textures: number; programs: number } | undefined;
  }
}
export {};
