import { describe, expect, it } from 'vitest';
import { mutePlan, type MuteMemory } from './mute-plan';

describe('mutePlan', () => {
  it('mutes at the start of a break and unmutes at the end', () => {
    const memory: MuteMemory = new Map();
    expect(mutePlan(memory, 1, 'start', false)).toEqual({ setMuted: true });
    expect(mutePlan(memory, 1, 'end', true)).toEqual({ setMuted: false });
  });

  it('leaves a tab the viewer had muted muted after the break', () => {
    const memory: MuteMemory = new Map();
    expect(mutePlan(memory, 2, 'start', true)).toEqual({});
    expect(mutePlan(memory, 2, 'end', true)).toEqual({});
  });

  it('keeps the first state when a break start repeats', () => {
    const memory: MuteMemory = new Map();
    mutePlan(memory, 3, 'start', false);
    mutePlan(memory, 3, 'start', true);
    expect(mutePlan(memory, 3, 'end', true)).toEqual({ setMuted: false });
  });
});
