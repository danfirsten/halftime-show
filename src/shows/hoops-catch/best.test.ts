import { describe, expect, it } from 'vitest';
import { BEST_KEY, cleanScore, createBestStore, type StorageArea } from './best';

function area(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

describe('the high score', () => {
  it('starts at 0 and keeps a better score under its own key', async () => {
    const a = area();
    const store = createBestStore(a);
    expect(await store.load()).toBe(0);
    expect(await store.save(12)).toBe(12);
    expect(a.data).toEqual({ [BEST_KEY]: 12 });
    expect(BEST_KEY).toBe('hoops-catch:best');
    expect(await createBestStore(a).load()).toBe(12);
  });

  it('does not keep a worse or equal score', async () => {
    const a = area({ [BEST_KEY]: 20 });
    const store = createBestStore(a);
    await store.load();
    expect(await store.save(7)).toBe(20);
    expect(await store.save(20)).toBe(20);
    expect(a.data[BEST_KEY]).toBe(20);
  });

  it('treats anything but a whole number above 0 as no score', () => {
    for (const bad of ['9', -3, 2.5, NaN, null, undefined, {}, Infinity]) expect(cleanScore(bad)).toBe(0);
    expect(cleanScore(41)).toBe(41);
  });

  it('carries on when storage fails', async () => {
    const broken: StorageArea = {
      get: () => Promise.reject(new Error('gone')),
      set: () => Promise.reject(new Error('gone')),
    };
    const store = createBestStore(broken);
    expect(await store.load()).toBe(0);
    expect(await store.save(5)).toBe(5);
    expect(await store.load()).toBe(5);
  });

  it('keeps it in memory where there is no extension storage', async () => {
    const store = createBestStore(null);
    expect(await store.save(3)).toBe(3);
    expect(await store.load()).toBe(3);
  });
});
