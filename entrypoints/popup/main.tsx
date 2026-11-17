import { render } from 'preact';
import '../../src/styles/tokens.css';
import './popup.css';

function Popup() {
  return (
    <main class="popup">
      <p class="wordmark">Halftime Show</p>
      <p class="lede">Mutes the ad break on Hulu and puts something better on top.</p>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
