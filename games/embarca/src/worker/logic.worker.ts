import { handleRequest } from './handler';
import type { LogicRequest } from './protocol';

/** Módulo do Web Worker: gerador e solver fora da thread da interface. */
interface WorkerScope {
  onmessage: ((e: MessageEvent<LogicRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = (e) => {
  scope.postMessage(handleRequest(e.data));
};
