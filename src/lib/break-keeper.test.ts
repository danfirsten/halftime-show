import { describe, expect, it } from 'vitest';
import { createBreakKeeper } from './break-keeper';
import type { SessionRecord } from './session-record';

function memoryRecord<T>(): SessionRecord<T> & { map: Map<number, T> } {
  const map = new Map<number, T>();
  return {
    map,
    get: async (id) => map.get(id),
    set: async (id, v) => void map.set(id, v),
    delete: async (id) => void map.delete(id),
  };
}

function setup() {
  let clock = 1_000_000;
  const log: string[] = [];
  const recorded: number[] = [];
  const starts = memoryRecord<number>();
  const keeper = createBreakKeeper({
    async mute(id) {
      await new Promise((r) => setTimeout(r, 5));
      log.push(`mute ${id}`);
      return true;
    },
    async unmute(id) {
      log.push(`unmute ${id}`);
      return false;
    },
    starts,
    record: async (s) => void recorded.push(s),
    now: () => clock,
  });
  return { keeper, log, recorded, starts, tick: (ms: number) => (clock += ms) };
}

describe('break keeper', () => {
  it('counts the seconds between the mute and the unmute as ad time dodged', async () => {
    const { keeper, recorded, tick } = setup();
    expect(await keeper.start(1)).toBe(true);
    tick(95_400);
    expect(await keeper.end(1)).toBe(false);
    expect(recorded).toEqual([95]);
  });

  it('counts nothing after "this isn\'t an ad", or with no break on', async () => {
    const { keeper, recorded, tick } = setup();
    await keeper.start(1);
    tick(30_000);
    await keeper.end(1, { notAd: true });
    await keeper.end(1);
    expect(recorded).toEqual([]);
  });

  it('keeps the first start time when a start repeats (a reconnect mid break)', async () => {
    const { keeper, recorded, tick } = setup();
    await keeper.start(1);
    tick(10_000);
    await keeper.start(1);
    tick(10_000);
    await keeper.end(1);
    expect(recorded).toEqual([20]);
  });

  it('runs one tab\'s steps in order, so an end never overtakes its start', async () => {
    const { keeper, log } = setup();
    const a = keeper.start(1);
    const b = keeper.end(1);
    await Promise.all([a, b]);
    expect(log).toEqual(['mute 1', 'unmute 1']);
  });

  it('keeps tabs apart', async () => {
    const { keeper, recorded, tick } = setup();
    await keeper.start(1);
    tick(5_000);
    await keeper.start(2);
    tick(5_000);
    await keeper.end(2);
    await keeper.end(1);
    expect(recorded).toEqual([5, 10]);
  });

  it('still counts the break when the tab is gone and the unmute fails', async () => {
    const recorded: number[] = [];
    let clock = 0;
    const keeper = createBreakKeeper({
      mute: async () => true,
      unmute: async () => {
        throw new Error('No tab with id: 1');
      },
      starts: memoryRecord<number>(),
      record: async (s) => void recorded.push(s),
      now: () => clock,
    });
    await keeper.start(1);
    clock = 7_000;
    await expect(keeper.end(1)).rejects.toThrow();
    expect(recorded).toEqual([7]);
  });
});
