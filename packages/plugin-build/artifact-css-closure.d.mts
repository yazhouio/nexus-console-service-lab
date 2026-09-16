import type { Rspack } from '@rsbuild/core';
export declare class ArtifactCssClosure {
  constructor(entry: string);
  apply(compiler: Rspack.Compiler): void;
}
