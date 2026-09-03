import type { startOptions } from 'wujie';

export type WujieStartOptions = startOptions;

export interface WujieDriver {
  startApp(options: WujieStartOptions): Promise<Function | void>;
  destroyApp(name: string): Promise<void>;
}

let driverPromise: Promise<WujieDriver> | undefined;

/**
 * Wujie is deliberately imported only on the first Surface mount. Importing the
 * browser package must not create a sandbox or execute Restricted Plugin code.
 */
export function loadWujieDriver(): Promise<WujieDriver> {
  driverPromise ??= import('wujie').then(module =>
    Object.freeze({
      startApp: module.startApp,
      destroyApp: module.destroyApp,
    }),
  );
  return driverPromise;
}
