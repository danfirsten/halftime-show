import { useCallback, useEffect, useState } from 'preact/hooks';
import { readSettings, saveSettings, watchSettings, type Settings } from '../state/settings';
import { readDetection, watchDetection, type Detection } from '../state/detection';

type Change = Parameters<typeof saveSettings>[0];

/** The settings, kept current as they change anywhere (another tab, the other page). `change` shows at once and then saves. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => readSettings(undefined));
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    // Outside the extension (the QA shooter serves these pages over http) there is no storage: the defaults stand.
    try {
      return watchSettings((next) => {
        setSettings(next);
        setReady(true);
      });
    } catch {
      setReady(true);
      return undefined;
    }
  }, []);

  const change = useCallback((patch: Change) => {
    setSettings((s) => ({
      ...s,
      ...(patch.lastShow !== undefined ? { lastShow: patch.lastShow } : {}),
      ...(patch.defaultShow !== undefined ? { defaultShow: patch.defaultShow } : {}),
      enabled: { ...s.enabled, ...patch.enabled },
    }));
    setSaveFailed(false);
    saveSettings(patch).catch(() => setSaveFailed(true));
  }, []);

  return { settings, ready, change, saveFailed };
}

/** Whether detection looks out of date: watched a long while with no break spotted. */
export function useDetection(): Detection {
  const [detection, setDetection] = useState<Detection>(() => readDetection(undefined));
  useEffect(() => {
    try {
      return watchDetection(setDetection);
    } catch {
      return undefined;
    }
  }, []);
  return detection;
}
