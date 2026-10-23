# Revised Sprint 2 PR package

This package reflects Adam's review feedback and narrows the branch to the public store information and gallery work.

## Retained / updated
- `client/src/pages/StorePage.tsx`: public store profile, contact details, opening hours, Google Maps directions.
- `client/src/pages/GalleryPage.tsx`: public gallery.
- `client/src/App.tsx`: shared navigation and routes for store and gallery only.
- `client/src/lib/api.ts`: public store profile types and fetch call.
- `server/src/modules/store/store.routes.ts`: read-only `GET /api/store`.
- `server/src/modules/index.ts`: mounts only the relevant store route alongside existing catalog/cart routes.
- `server/prisma/schema.prisma`: adds store email and opening-hours fields; order/payment models removed.
- `server/src/seed/demoData.ts`: synthetic store contact details and weekly opening hours.
- Tests and README / integration notes updated for the reduced scope.

## Removed from this PR
- `server/prisma/migrations/migrations/` (including the duplicate initial migration and incorrectly nested store/order migration).
- `server/src/modules/orders/orders.routes.ts`.
- `client/src/pages/OrderConfirmationPage.tsx`.
- `client/src/pages/OrderStatusPage.tsx`.
- `client/src/pages/StoreSettingsPage.tsx`.
- Order models and enums from `server/prisma/schema.prisma`.
- Order API types/functions from `client/src/lib/api.ts`.
- Demo order submission from `client/src/pages/CartPage.tsx`.
- Order-related route/navigation links and tests.

## Before requesting approval
1. Keep the original ZIP as a reference for future order/status work, or preserve that work on a separate branch before deleting it from your current PR branch.
2. From the project folder with Node.js 24 and dependencies installed, run `npm test` and `npm run build`.
3. Generate the store profile migration locally from the updated schema (for example, from `server`, run `npx prisma migrate dev --name store_profile`) and review the generated migration. Commit that correctly located migration.
4. Do not merge until CI is green and the team has reviewed the generated migration.
