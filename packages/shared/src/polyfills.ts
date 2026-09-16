export function promiseTry<T>(fn: (...args: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): Promise<T> {
  try {
    const result = fn.apply(thisArg, args);

    // If result is thenable (has a then function), assume it's a promise and return it directly.
    // & This is the fastest way to check thenable, better than null check + .then === function check
    if (typeof (result as any)?.then === 'function') {
      return result as Promise<T>;
    }

    return Promise.resolve(result);
  } catch (err) {
    return Promise.reject(err);
  }
}

export function getOrInsert<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key)!;
}

export function getOrInsertWeak<K extends object | symbol, V>(map: WeakMap<K, V>, key: K, defaultValue: V): V {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key)!;
}
