// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { captureSnapshot, scrubUrl } from './capture';
import { readSnapshot } from './read';
import { hulu } from '../sites/hulu';

function page(body: string): Document {
  document.body.innerHTML = body;
  return document;
}

describe('captureSnapshot', () => {
  const html = captureSnapshot(
    page(`
      <nav class="ProfileMenu"><span>Dan's profile</span></nav>
      <div class="Player">
        <script>window.secret = 1</script>
        <!-- a comment -->
        <video id="content-video-player" src="https://cdn.example/v/ep.mp4?token=abc123" poster="https://img.example/p.jpg?sig=1"></video>
        <div class="AccountBadge" aria-label="Signed in as dan@example.com">Dan</div>
        <a href="https://www.hulu.com/watch/123?session=xyz" data-track="secret">Episode</a>
        <img src="https://img.example/me.png">
        <input value="dan@example.com">
        <p>Mail me at dan@example.com</p>
        <span class="sc-s1x9">S4 E3 Watching as Daniel</span>
        <style>.bg { background: url("https://img.example/bg.png?uid=99123&sig=abc") }</style>
        <div id="user-8812345" aria-label="Switch to Daniel's kids profile">x</div>
        <div class="AdUnitView__adBarContainer">
          <div class="AdUnitView__adBar"><span>Ad</span><span class="AdUnitView__adBar__timer">0:42</span></div>
        </div>
        <div class="Timeline"><div class="Timeline__playhead Timeline__playhead--ad"></div></div>
        <div class="Spare" hidden><span>off</span></div>
      </div>`),
    hulu,
    new Date('2026-11-17T12:00:00Z'),
  );

  it('removes scripts, comments, images, form fields and tracking attributes', () => {
    expect(html).not.toMatch(/<script|window\.secret|a comment|<img|<input|data-track/);
  });

  it('removes personal text, email addresses and URLs with tokens', () => {
    expect(html).not.toMatch(/dan@example\.com|Signed in|Dan's profile|token|sig=|session|watch\/123|img\.example/);
    expect(html).not.toMatch(/Mail me|Daniel|Watching|S4 E3|uid=|99123|8812345|kids profile|<style/);
    expect(html).toContain('id="user-#"');
  });

  it('blanks every text but the player\'s own, keeping its length', () => {
    expect(html).toContain('<span class="sc-s1x9">** ** ******** ** ******</span>');
  });

  it('captures nothing from a page with no player or ad marker (an account page)', () => {
    expect(captureSnapshot(page('<main><h1>Account</h1><p>Daniel, 1 Main St, Visa ending 4242</p></main>'), hulu)).toBeNull();
  });

  it('keeps what detection reads, and marks what was hidden', () => {
    expect(html).toContain('AdUnitView__adBar__timer');
    expect(html).toContain('Timeline__playhead--ad');
    expect(html).toMatch(/class="Spare" hidden="" data-ht-hidden=""/);
    expect(html).toMatch(/^<!doctype html>\n<!-- Halftime Show detection snapshot: site hulu, 2026-11-17\./);
  });

  it('reads back as an ad break', () => {
    const doc = new DOMParser().parseFromString(html!, 'text/html');
    const snap = readSnapshot(doc, hulu, 0);
    expect(snap.secondsLeft).toBe(42);
    expect(snap.readings.filter((r) => r.on).map((r) => r.id)).toEqual(['adBar', 'adLabel', 'countdown', 'adPlayhead']);
  });
});

describe('scrubUrl', () => {
  it('keeps a plain file name only', () => {
    expect(scrubUrl('ad.webm')).toBe('ad.webm');
    expect(scrubUrl('https://x.example/a/b/content.webm?t=1#x')).toBe('content.webm');
    expect(scrubUrl('blob:https://www.hulu.com/3f2a')).toBe('blob:');
    expect(scrubUrl('https://x.example/u/12345678.mp4')).toBe('');
    expect(scrubUrl('https://x.example/watch/abc%20def')).toBe('');
  });
});
