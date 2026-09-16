import { registerHooks } from 'node:module';

// Node 24 strips TypeScript. Runtime source uses bundler-style extensionless imports.
// This repository-only loader leaves package exports and business boundaries intact.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
