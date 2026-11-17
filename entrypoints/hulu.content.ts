// The detector and the overlay arrive in their own issues; this marks the page as watched.
export default defineContentScript({
  matches: ['*://*.hulu.com/*'],
  main() {
    document.documentElement.dataset.halftimeShow = 'ready';
  },
});
