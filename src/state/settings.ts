import { SHOW_IDS, type ShowId } from '../shows/types';

// Settings in storage.local, one object. Every write keeps the fields it doesn't own, so the last show used (written
// by the content script) and the choices made on the popup and options pages never overwrite each other.

export const SETTINGS_KEY = 'settings';

/** The sites the extension works on. One today. */
export const SITES = ['hulu'] as const;
export type SiteId = (typeof SITES)[number];
export const SITE_HOSTS: Record<SiteId, string> = { hulu: 'hulu.com' };

export interface Settings {
  /** The last show picked. The menu counts down to it at the next break. Null before the first pick ever. */
  lastShow: ShowId | null;
  /** Whether the extension is on for each site. On unless switched off. */
  enabled: Record<SiteId, boolean>;
  /** The show the menu counts down to at every break. Null: "ask each break", which counts down to the last show used. */
  defaultShow: ShowId | null;
}

function isShowId(value: unknown): value is ShowId {
  return typeof value === 'string' && (SHOW_IDS as readonly string[]).includes(value);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readSettings(value: unknown): Settings {
  const raw = record(value);
  const sites = record(raw.enabled);
  const enabled = Object.fromEntries(SITES.map((site) => [site, sites[site] !== false])) as Record<SiteId, boolean>;
  return { lastShow: isShowId(raw.lastShow) ? raw.lastShow : null, enabled, defaultShow: isShowId(raw.defaultShow) ? raw.defaultShow : null };
}

/** The show the menu should count down to: the one picked in settings, else the last one used. */
export function presetShow(settings: Pick<Settings, 'lastShow' | 'defaultShow'>): ShowId | null {
  return settings.defaultShow ?? settings.lastShow;
}

export async function loadSettings(): Promise<Settings> {
  return readSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

let writing: Promise<unknown> = Promise.resolve();

/** Changes some settings and keeps the rest. Writes one at a time. */
export function saveSettings(change: { lastShow?: ShowId; defaultShow?: ShowId | null; enabled?: Partial<Record<SiteId, boolean>> }): Promise<void> {
  const next = writing.then(async () => {
    const current = record((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    const merged: Record<string, unknown> = { ...current };
    if (change.lastShow !== undefined) merged.lastShow = change.lastShow;
    if (change.defaultShow !== undefined) merged.defaultShow = change.defaultShow;
    if (change.enabled) merged.enabled = { ...record(current.enabled), ...change.enabled };
    await browser.storage.local.set({ [SETTINGS_KEY]: merged });
  });
  writing = next.catch(() => undefined);
  return next;
}

export function saveLastShow(show: ShowId): Promise<void> {
  return saveSettings({ lastShow: show });
}

/** Calls `onSettings` now and whenever settings change, in this tab or any other page of the extension. Returns a function that stops. */
export function watchSettings(onSettings: (settings: Settings) => void): () => void {
  let stopped = false;
  loadSettings().then(
    (s) => !stopped && onSettings(s),
    () => !stopped && onSettings(readSettings(undefined)),
  );
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) onSettings(readSettings(changes[SETTINGS_KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(listener);
  };
}
