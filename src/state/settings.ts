import { SHOW_IDS, type ShowId } from '../shows/types';

// Settings in storage.local. For now only the last halftime show used; the settings page (#10) adds the rest to
// the same object, so writes here keep any other fields.

export const SETTINGS_KEY = 'settings';

export interface Settings {
  /** The last show picked. The menu counts down to it at the next break. Null before the first pick ever. */
  lastShow: ShowId | null;
}

function isShowId(value: unknown): value is ShowId {
  return typeof value === 'string' && (SHOW_IDS as readonly string[]).includes(value);
}

function stored(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readSettings(value: unknown): Settings {
  const raw = stored(value);
  return { lastShow: isShowId(raw.lastShow) ? raw.lastShow : null };
}

export async function loadSettings(): Promise<Settings> {
  return readSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

export async function saveLastShow(show: ShowId): Promise<void> {
  const current = stored((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  if (current.lastShow === show) return;
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, lastShow: show } });
}
