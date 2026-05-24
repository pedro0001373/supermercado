const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.exp && entry.exp < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.val;
}

function set(key, val, ttlSeconds) {
  const exp = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
  store.set(key, { val, exp });
  return val;
}

function del(key) {
  store.delete(key);
}

function delPrefix(prefix) {
  for (const k of store.keys()) {
    if (k.indexOf(prefix) === 0) store.delete(k);
  }
}

function wrap(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const val = producer();
  set(key, val, ttlSeconds);
  return val;
}

function flush() { store.clear(); }

module.exports = { get, set, del, delPrefix, wrap, flush };
