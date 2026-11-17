import { render } from 'preact';
import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/ui/ui.css';
import '../../src/settings/settings.css';
import './popup.css';
import { Popup } from './Popup';

render(<Popup />, document.getElementById('app')!);
