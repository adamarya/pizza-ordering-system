// The only order a kitchen order moves through (S2-23). One step at a time, forward only.
// Cancelling and refunding are not kitchen actions and are not part of this.
export const KITCHEN_STATUSES = ['IN_PROGRESS', 'READY', 'COMPLETED'] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

const NEXT_STEP: Record<string, KitchenStatus | undefined> = {
  RECEIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'READY',
  READY: 'COMPLETED',
};

// True only when `to` is the very next step after `from`. Skipping a step, going backwards,
// repeating the same status, and moving an order that is not in the kitchen all return false.
export function isAllowedStep(from: string, to: string): boolean {
  return NEXT_STEP[from] === to;
}
