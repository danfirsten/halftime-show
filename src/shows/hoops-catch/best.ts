// Hoop's catch keeps its high score in the extension's own storage (storage.local), under its own key.
// Nothing is written to the page's storage, and outside the extension (a test, the stand-in page) it is kept in memory.

export const BEST_KEY = 'hoops-catch:best';

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface BestStore {
  load(): Promise<number>;
  /** Keeps the score only if it beats the one kept. Resolves to the best now. */
  save(score: number): Promise<number>;
}

/** A stored value that isn't a whole number of 0 or more counts as no high score. */
export function cleanScore(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/** The extension's storage.local, or null where there isn't one. */
function extensionArea(): StorageArea | null {
  const g = globalThis as unknown as { browser?: { storage?: { local?: StorageArea } }; chrome?: { storage?: { local?: StorageArea } } };
  return g.browser?.storage?.local ?? g.chrome?.storage?.local ?? null;
}

export function createBestStore(area: StorageArea | null = extensionArea()): BestStore {
  let memory = 0;
  return {
    async load() {
      if (!area) return memory;
      try {
        memory = cleanScore((await area.get(BEST_KEY))[BEST_KEY]);
      } catch {
        // Storage can fail (a blocked profile, a closing tab): carry on with what this break has seen.
      }
      return memory;
    },
    async save(score) {
      if (cleanScore(score) <= memory) return memory;
      memory = score;
      if (area) {
        try {
          await area.set({ [BEST_KEY]: score });
        } catch {
          // Kept in memory for this break at least.
        }
      }
      return memory;
    },
  };
}
