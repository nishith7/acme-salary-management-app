import { describe, expect, it } from 'vitest';
import { describeGap } from './format-gap.ts';

describe('describing the gap in words', () => {
  it('says lower, higher or no gap, so the direction does not depend on a minus sign or a colour', () => {
    expect(describeGap('-8.3')).toBe('8.3% lower');
    expect(describeGap('2.8')).toBe('2.8% higher');
    expect(describeGap('0.0')).toBe('No gap');
  });
});
