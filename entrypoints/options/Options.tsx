import { Hoop, Label, Pill } from '../../src/ui';

/** The options page shell. The settings themselves arrive with the settings work. */
export function Options() {
  return (
    <main class="opts">
      <header class="op-head">
        <p class="wordmark">
          <Hoop />
          halftime show
        </p>
        <h1 class="op-title">Settings</h1>
      </header>
      <section class="op-sec" aria-labelledby="op-site">
        <h2 id="op-site" class="op-h">On for hulu.com</h2>
        <p class="op-p">Your settings will live here. Nothing leaves this browser.</p>
        <div class="op-row">
          <Pill variant="outline" disabled>
            Save
          </Pill>
        </div>
      </section>
      <footer class="op-foot">
        <Label>Halftime Show is not made by or affiliated with Hulu.</Label>
      </footer>
    </main>
  );
}
