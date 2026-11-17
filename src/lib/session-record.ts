/**
 * A small record per tab kept in `storage.session`, so it outlives the background service worker being stopped
 * between events (it is cleared when the browser closes). Falls back to memory where `storage.session` is missing.
 */
export interface SessionRecord<T> {
  get(tabId: number): Promise<T | undefined>;
  set(tabId: number, value: T): Promise<void>;
  delete(tabId: number): Promise<void>;
}

type Area = { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };

function sessionArea(): Area | undefined {
  try {
    return (browser.storage as unknown as { session?: Area }).session;
  } catch {
    return undefined;
  }
}

export function sessionRecord<T>(key: string, valid: (value: unknown) => value is T, area: Area | undefined = sessionArea()): SessionRecord<T> {
  const memory = new Map<number, T>();
  let loaded: Promise<void> | null = null;

  function load(): Promise<void> {
    loaded ??= (async () => {
      if (!area) return;
      try {
        const saved = (await area.get(key))[key];
        if (typeof saved !== 'object' || saved === null) return;
        for (const [id, value] of Object.entries(saved)) {
          const tabId = Number(id);
          if (Number.isInteger(tabId) && valid(value) && !memory.has(tabId)) memory.set(tabId, value);
        }
      } catch {
        // Nothing saved, or storage unavailable: memory alone.
      }
    })();
    return loaded;
  }

  async function save() {
    if (!area) return;
    try {
      await area.set({ [key]: Object.fromEntries(memory) });
    } catch {
      // Memory still holds it for as long as the worker runs.
    }
  }

  return {
    async get(tabId) {
      await load();
      return memory.get(tabId);
    },
    async set(tabId, value) {
      await load();
      memory.set(tabId, value);
      await save();
    },
    async delete(tabId) {
      await load();
      if (!memory.delete(tabId)) return;
      await save();
    },
  };
}
