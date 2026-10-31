// Store hours and delivery area for checkout (S2-07, S2-08). Kept in one place until the store
// profile from S2-46 holds opening hours and the delivery area; then these values move there and
// the manager edits them instead of the code. Times are compared in the store's own time zone,
// because the server runs in UTC on Azure.
export const CHECKOUT_SETTINGS = {
  timeZone: 'America/Denver',
  openHour: 11, // 11:00 AM
  closeHour: 22, // 10:00 PM, last order time
  leadMinutes: 20, // a requested time must be at least this far ahead
  deliveryZipCodes: ['80202', '80203', '80204', '80205', '80206', '80211', '80212'],
} as const;

/** The hour (0 to 23) of the given instant in the store's time zone. */
export function storeHour(instant: Date, timeZone: string = CHECKOUT_SETTINGS.timeZone): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(instant)
    .find((p) => p.type === 'hour');
  return Number(hour?.value ?? instant.getUTCHours());
}

export function isWithinStoreHours(instant: Date): boolean {
  const hour = storeHour(instant);
  return hour >= CHECKOUT_SETTINGS.openHour && hour < CHECKOUT_SETTINGS.closeHour;
}
