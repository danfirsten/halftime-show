import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Halftime Show',
    description: 'Mutes the ad break and puts something better on top.',
    permissions: ['tabs', 'storage'],
    host_permissions: ['*://*.hulu.com/*'],
  },
  vite: () => ({ plugins: [preact()] }),
});
