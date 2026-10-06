import { registerHooks } from 'node:module';

// Node 24 strips TypeScript. Published package source uses `.js` specifiers that point at `.ts`
// files, and app source uses bundler-style extensionless imports.
// This repository-only loader leaves package exports and business boundaries intact.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      const base = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
      const candidates = specifier.endsWith('.js')
        ? [`${base}.ts`, `${base}.tsx`]
        : [`${specifier}.ts`];
      for (const candidate of candidates) {
        try {
          return nextResolve(candidate, context);
        } catch (candidateError) {
          if (candidateError.code !== 'ERR_MODULE_NOT_FOUND') throw candidateError;
        }
      }
      throw error;
    }
  },
});
