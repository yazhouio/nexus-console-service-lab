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
  driverPromise ??= import('wujie').then((module) =>
    Object.freeze({
      async startApp(options: WujieStartOptions) {
        let iframeReady: Promise<unknown> | undefined;
        try {
          return await module.startApp({
            ...options,
            // Wujie 2.1 disconnect otherwise destroys a rebuild-mode iframe while
            // initialization is still pending. Nexus uses a unique name for each
            // Attempt and always explicitly destroys it; no execution is cached.
            alive: true,
            beforeLoad(appWindow) {
              // Version-specific Wujie adapter boundary: importHTML can reject
              // before startApp awaits this internal initialization promise.
              iframeReady = (appWindow as Window & { __WUJIE?: { iframeReady?: Promise<unknown> } })
                .__WUJIE?.iframeReady;
              options.beforeLoad?.(appWindow);
            },
          });
        } finally {
          await iframeReady?.catch(() => undefined);
        }
      },
      destroyApp: module.destroyApp,
    }),
  );
  return driverPromise;
}
