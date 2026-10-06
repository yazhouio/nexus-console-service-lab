/** Distribution-owned acceptance harnesses only; feature imports are rejected by workspace boundaries. */
export { useHostServices as useHostTestServices } from './HostContext.js';
export { SurfaceMount as TestSurfaceMount } from './SurfaceMount.js';

export { ManagedBuiltin as TestBuiltinMount } from './ManagedBuiltin.js';
