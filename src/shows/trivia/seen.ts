// The ids of the questions this viewer has already had, kept in the browser's own storage under this show's own key.
// Nothing leaves the browser. Where there is no storage (the unit tests, a page outside the extension) it keeps them
// for the page's life only.
export const SEEN_KEY = 'halftime.trivia.seen';

interface Area {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function area(): Area | null {
  const g = globalThis as { browser?: { storage?: { local?: Area } }; chrome?: { storage?: { local?: Area } } };
  return g.browser?.storage?.local ?? g.chrome?.storage?.local ?? null;
}

let memory: string[] = [];

export async function loadSeen(): Promise<string[]> {
  try {
    const a = area();
    if (!a) return memory;
    const value = (await a.get(SEEN_KEY))[SEEN_KEY];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return memory;
  }
}

export async function saveSeen(ids: string[]): Promise<void> {
  memory = ids;
  try {
    await area()?.set({ [SEEN_KEY]: ids });
  } catch {
    // Storage said no: the ids stay for this page, and the next break may repeat a question.
  }
}
