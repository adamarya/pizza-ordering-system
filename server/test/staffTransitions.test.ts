import { describe, expect, it } from 'vitest';
import { isAllowedStep } from '../src/modules/staff/staff.transitions.js';

// S2-23: the rules for moving an order, with no database needed.
describe('kitchen status steps', () => {
  it('allows each next step', () => {
    expect(isAllowedStep('RECEIVED', 'IN_PROGRESS')).toBe(true);
    expect(isAllowedStep('IN_PROGRESS', 'READY')).toBe(true);
    expect(isAllowedStep('READY', 'COMPLETED')).toBe(true);
  });

  it('refuses skipped steps', () => {
    expect(isAllowedStep('RECEIVED', 'READY')).toBe(false);
    expect(isAllowedStep('RECEIVED', 'COMPLETED')).toBe(false);
    expect(isAllowedStep('IN_PROGRESS', 'COMPLETED')).toBe(false);
  });

  it('refuses going backwards and repeating a status', () => {
    expect(isAllowedStep('READY', 'IN_PROGRESS')).toBe(false);
    expect(isAllowedStep('IN_PROGRESS', 'RECEIVED')).toBe(false);
    expect(isAllowedStep('READY', 'READY')).toBe(false);
  });

  it('refuses orders that are not in the kitchen', () => {
    for (const from of ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'COMPLETED', 'CANCELLED', 'EXPIRED']) {
      expect(isAllowedStep(from, 'IN_PROGRESS')).toBe(false);
      expect(isAllowedStep(from, 'COMPLETED')).toBe(false);
    }
  });
});
