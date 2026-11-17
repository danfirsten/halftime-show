// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createPageMuter } from './mute';

// The fallback for browsers with no tab mute (Safari): the content script mutes the page's own video for the break.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function video(muted = false, volume = 0.6): HTMLVideoElement {
  const el = document.createElement('video');
  el.muted = muted;
  el.volume = volume;
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('createPageMuter', () => {
  it('mutes the video for a break and gives the sound back after, volume untouched', () => {
    const el = video(false, 0.6);
    const muter = createPageMuter(document);
    muter.start();
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0.6);
    expect(muter.end()).toBe(false);
    expect(el.muted).toBe(false);
    expect(el.volume).toBe(0.6);
  });

  it('leaves a player the viewer muted muted after the break', () => {
    const el = video(true);
    const muter = createPageMuter(document);
    muter.start();
    expect(el.muted).toBe(true);
    expect(muter.end()).toBe(true);
    expect(el.muted).toBe(true);
  });

  it('holds the mute when the player undoes it during the break', async () => {
    const el = video(false);
    const muter = createPageMuter(document);
    muter.start();
    el.muted = false;
    el.dispatchEvent(new Event('volumechange'));
    expect(el.muted).toBe(true);
    // The viewer's own state is still the one from before the break.
    expect(muter.end()).toBe(false);
    expect(el.muted).toBe(false);
    await settle();
  });

  it('mutes a video the player adds during the break, and gives it back after', async () => {
    const muter = createPageMuter(document);
    muter.start();
    const ad = video(false);
    await settle();
    expect(ad.muted).toBe(true);
    muter.end();
    expect(ad.muted).toBe(false);
  });

  it("puts back the viewer's volume if the player changed it during the break", () => {
    const el = video(false, 0.3);
    const muter = createPageMuter(document);
    muter.start();
    el.volume = 1;
    expect(muter.end()).toBe(false);
    expect(el.volume).toBe(0.3);
  });

  it('does nothing outside a break, and a repeated start keeps the first state', () => {
    const el = video(false);
    const muter = createPageMuter(document);
    expect(muter.end()).toBeNull();
    muter.start();
    muter.start();
    expect(muter.end()).toBe(false);
    expect(el.muted).toBe(false);
  });

  it('stops holding once the break is over', () => {
    const el = video(false);
    const muter = createPageMuter(document);
    muter.start();
    muter.end();
    el.muted = true;
    el.muted = false;
    el.dispatchEvent(new Event('volumechange'));
    expect(el.muted).toBe(false);
  });
});
