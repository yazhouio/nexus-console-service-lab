/** Copy plain data without freezing caller-owned objects or live capability values. */
export function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T;
  if (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)])),
    ) as T;
  }
  return value;
}

/** Object.freeze(Map) still permits set/delete/clear; expose only read methods. */
export function readonlyMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const data = new Map(entries);
  const view: ReadonlyMap<K, V> = Object.freeze({
    size: data.size,
    get: (key: K) => data.get(key),
    has: (key: K) => data.has(key),
    keys: () => data.keys(),
    values: () => data.values(),
    entries: () => data.entries(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
      for (const [key, value] of data) callback.call(thisArg, value, key, view);
    },
  });
  return view;
}

export function readonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const data = new Set(values);
  const view: ReadonlySet<T> = Object.freeze({
    size: data.size,
    has: (value: T) => data.has(value),
    keys: () => data.keys(),
    values: () => data.values(),
    entries: () => data.entries(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(callback: (value: T, key: T, set: ReadonlySet<T>) => void, thisArg?: unknown) {
      for (const value of data) callback.call(thisArg, value, value, view);
    },
  });
  return view;
}
