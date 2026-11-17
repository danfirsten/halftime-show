import { render } from 'preact';
import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/ui/ui.css';
import './options.css';
import { Options } from './Options';

render(<Options />, document.getElementById('app')!);
