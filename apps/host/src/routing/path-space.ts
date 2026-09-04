/** A small, fixed language. This module never imports the routing executor. */
export type Segment = Readonly<{ kind: 'literal'; value: string } | { kind: 'param'; name: string }>;
export interface PathSpace {
  readonly segments: readonly Segment[];
  readonly splat: boolean;
  readonly path: string;
}

export function parsePath(path: string, child = false): PathSpace | undefined {
  if (!path || path.startsWith('/') === child) return;
  const body = (child ? path : path.slice(1)).replace(/\/+$/, '');
  if (child && !body) return;
  const parts = body ? body.split('/') : [];
  const splat = parts.at(-1) === '*';
  if (splat) parts.pop();
  const segments: Segment[] = [];
  for (const part of parts) {
    if (part === ':__proto__') return;
    if (/^:[A-Za-z_][A-Za-z0-9_]*$/.test(part)) segments.push({ kind: 'param', name: part.slice(1) });
    else if (/^[A-Za-z0-9_.~-]+$/.test(part) && part !== '.' && part !== '..') segments.push({ kind: 'literal', value: part.toLowerCase() });
    else return;
  }
  return makePath(segments, splat);
}

export function makePath(segments: readonly Segment[], splat: boolean): PathSpace {
  return { segments, splat, path: '/' + [...segments.map(s => s.kind === 'param' ? ':' + s.name : s.value), ...(splat ? ['*'] : [])].join('/') };
}

function includes(a: PathSpace, b: PathSpace): boolean {
  // Every length and every segment accepted by b must also be accepted by a.
  if (!a.splat && (b.splat || a.segments.length !== b.segments.length)) return false;
  if (a.splat && a.segments.length > b.segments.length) return false;
  return a.segments.every((s, i) => s.kind === 'param' || (b.segments[i]?.kind === 'literal' && s.value === (b.segments[i] as { value: string }).value));
}

export function relationship(a: PathSpace, b: PathSpace): {
  readonly kind: 'DISJOINT' | 'EQUIVALENT' | 'CONTAINS' | 'WITHIN' | 'CROSSING'; readonly witness?: string;
} {
  const n = Math.max(a.segments.length, b.segments.length);
  if ((!a.splat && a.segments.length < n) || (!b.splat && b.segments.length < n)) return { kind: 'DISJOINT' };
  const witness: string[] = [];
  for (let i = 0; i < n; i++) {
    const left = a.segments[i], right = b.segments[i];
    if (left?.kind === 'literal' && right?.kind === 'literal' && left.value !== right.value) return { kind: 'DISJOINT' };
    witness.push(left?.kind === 'literal' ? left.value : right?.kind === 'literal' ? right.value : 'value');
  }
  const ab = includes(a, b), ba = includes(b, a);
  return { kind: ab && ba ? 'EQUIVALENT' : ab ? 'CONTAINS' : ba ? 'WITHIN' : 'CROSSING', witness: '/' + witness.join('/') };
}

/** Decode once per segment, preserving encoded slashes inside parameters, like the pinned executor. */
export function matchSpace(space: PathSpace, pathname: string): Record<string, string> | undefined {
  if (!pathname.startsWith('/')) return;
  let parts: string[];
  try { parts = pathname.slice(1).replace(/\/+$/, '').split('/').map(decodeURIComponent); }
  catch { return; }
  if (parts.length === 1 && parts[0] === '') parts = [];
  if (parts.length < space.segments.length || (!space.splat && parts.length !== space.segments.length)) return;
  const params: Record<string, string> = Object.create(null);
  for (const [i, segment] of space.segments.entries()) {
    if (!parts[i] || (segment.kind === 'literal' && segment.value !== parts[i].replace(/[A-Z]/g, c => c.toLowerCase()))) return;
    if (segment.kind === 'param') params[segment.name] = parts[i];
  }
  if (space.splat) params['*'] = parts.slice(space.segments.length).join('/');
  return params;
}
