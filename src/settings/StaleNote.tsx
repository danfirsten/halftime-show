export const REPO_URL = 'https://github.com/danfirsten/halftime-show';

/** The outlined note for "detection looks out of date": plain words, what to do, where to report it. */
export function StaleNote() {
  return (
    <p class="stale" role="note">
      No breaks spotted in the last 3 episodes. Detection may be out of date. Press Alt+Shift+A at the next ad, and{' '}
      <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
        report it on GitHub
      </a>
      .
    </p>
  );
}
