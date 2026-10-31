// Calls for the staff and manager screens (S2-27, S2-28). Kept apart from api.ts, which serves the
// customer pages. Every change sends the session's CSRF token, which the server checks (#20).

export type Role = 'STAFF' | 'MANAGER';
export interface Me { user: { id: string; username: string; role: Role }; csrfToken: string }

export interface AdminSize { id: string; label: string; priceCents: number; displayOrder: number }
export interface AdminItem {
  id: string;
  name: string;
  description: string | null;
  isPizza: boolean;
  isAvailable: boolean;
  isRetired: boolean;
  sizes: AdminSize[];
}
export interface AdminCategory { id: string; name: string; isRetired: boolean; menuItems: AdminItem[] }
export interface AdminCrust { id: string; name: string; surchargeCents: number; isAvailable: boolean }
export interface AdminTopping { id: string; name: string; priceCents: number; isAvailable: boolean }
export interface AdminMenu { menuVersion: number; categories: AdminCategory[]; crusts: AdminCrust[]; toppings: AdminTopping[] }

export class NotSignedIn extends Error {}

/** The signed-in account, or NotSignedIn when there is no session. */
export async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) throw new NotSignedIn();
  if (!res.ok) throw new Error('Something went wrong. Please try again.');
  return res.json();
}

export async function fetchAdminMenu(): Promise<AdminMenu> {
  const res = await fetch('/api/admin/menu');
  if (res.status === 401) throw new NotSignedIn();
  if (!res.ok) throw new Error('The menu could not be loaded. Please try again.');
  return res.json();
}

async function change(me: Me, method: 'PATCH' | 'POST', url: string, body: object) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new NotSignedIn();
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const field = json.errors ? Object.values(json.errors as Record<string, string>)[0] : undefined;
    throw new Error(field ?? json.error ?? 'The change was not saved. Please try again.');
  }
  return res.json();
}

export const setSizePrice = (me: Me, sizeId: string, priceCents: number) =>
  change(me, 'PATCH', `/api/admin/sizes/${encodeURIComponent(sizeId)}`, { priceCents });
export const setItemRetired = (me: Me, itemId: string, isRetired: boolean) =>
  change(me, 'PATCH', `/api/admin/items/${encodeURIComponent(itemId)}`, { isRetired });
export const setToppingPrice = (me: Me, id: string, priceCents: number) =>
  change(me, 'PATCH', `/api/admin/toppings/${encodeURIComponent(id)}`, { priceCents });
export const setCrustSurcharge = (me: Me, id: string, surchargeCents: number) =>
  change(me, 'PATCH', `/api/admin/crusts/${encodeURIComponent(id)}`, { surchargeCents });
export const setAvailability = (me: Me, kind: 'item' | 'crust' | 'topping', id: string, isAvailable: boolean) =>
  change(me, 'PATCH', '/api/admin/availability', { kind, id, isAvailable });

/**
 * Reads a dollar amount typed by the manager ("12.99", "$12.5", "12") as whole cents, by reading
 * the digits as text, so no decimal arithmetic touches money (Table 21). Returns null for anything
 * that is not a plain amount with at most two decimal places.
 */
export function dollarsToCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

/** The reverse, for the input's starting value: 1299 becomes "12.99". */
export const centsToDollars = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
