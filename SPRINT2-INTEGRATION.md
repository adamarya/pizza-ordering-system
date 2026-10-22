# Sprint 2 Integration Notes

This branch extends the existing React/TypeScript + Express + Prisma project. Adam's menu and item configuration screens remain in place; the new work adds shared-navigation links and the Sprint 2 store/order pages.

## Requirements mapped to code

1. **Manager-editable store profile:** `StoreSettings` now stores `email` and `openingHours`; the existing name, description, address and phone remain persisted fields. `StoreSettingsPage.tsx` edits those values through `PUT /api/store/settings`. The API validates the fields and requires a bearer token matching `MANAGER_SETTINGS_TOKEN`.
2. **Public information pages:** `/store` renders persisted store details and hours from `GET /api/store`. `/gallery` renders gallery entries from a separate data array. Both are linked in shared navigation.
3. **Map directions:** the public store page links the address to a Google Maps directions URL, which can open in the installed Maps app or browser.
4. **Order confirmation:** `POST /api/orders` re-prices the cart on the server, stores an order-number and line-item snapshot, and returns an order number plus a random public reference. `/order/confirmation/:reference` shows items, order total, fulfillment method and creation time.
5. **Private order status:** `/order/status/:reference` fetches status using the 256-bit random reference. It displays all four stages and polls every 15 seconds. A token-protected `PATCH /api/orders/:orderNumber/status` endpoint lets an authorized manager/staff process update the status.

## Local setup

Use Node.js 24 (see `.nvmrc`). Follow the main README to install dependencies and configure PostgreSQL. Copy `.env.example` to `server/.env`, then replace `MANAGER_SETTINGS_TOKEN` with a long random value. Do not commit `server/.env` or share the token. Apply migrations and generate Prisma client before running the app:

```bash
npm ci
npm run db:generate --workspace server
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. The manager settings page is `/store/settings`; enter the configured token when saving profile changes.

## Important limitation

No payment provider is integrated. Orders store `paymentStatus=NOT_PROCESSED`; the confirmation shows the server-calculated order total, not a real card charge. Real payment processing must be added before accepting or claiming actual charges. The temporary shared manager token is also not a substitute for the planned full staff authentication/session system.

## Validation performed in this workspace

All TypeScript/TSX source files passed a syntax-transpilation check. A full TypeScript build, Prisma generation, and integration test run could not be completed here because dependencies could not be installed from the npm registry in this environment; the project requires Node 24 while this environment provides Node 22. Run `npm run typecheck`, `npm test`, and `npm run build` after installing dependencies under Node 24.
