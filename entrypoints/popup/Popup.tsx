import { Hoop, Label, Mark, Pill } from '../../src/ui';

/** The popup shell. Behaviour (status, pause, "this is an ad") arrives with the settings work; this is the ink and paper frame. */
export function Popup() {
  return (
    <main class="popup">
      <header class="pp-head">
        <p class="wordmark">
          <Hoop />
          halftime show
        </p>
      </header>
      <p class="status">
        <Mark kind="solid" label="" />
        Watching for ad breaks
      </p>
      <p class="lede">Mutes the ad break on Hulu and puts something better on top.</p>
      <div class="pp-actions">
        <Pill variant="outline" disabled>
          This is an ad
        </Pill>
      </div>
      <Label>Not made by or affiliated with Hulu.</Label>
    </main>
  );
}
