# Sprint 2 PR Notes — Public Store Information and Gallery

This branch is intentionally limited to the public information pages requested for S2-46, S2-47, and S2-48.

## Included in this PR

- `/store` displays the store name, description, street address, telephone, email, and opening hours.
- Store data is served by `GET /api/store` from the seeded `StoreSettings` record.
- The street address links to Google Maps directions.
- `/gallery` displays gallery images and captions.
- Store and gallery pages are linked from the shared navigation.
- `StoreSettings.email` and `StoreSettings.openingHours` are added to the Prisma schema and demo seed data.

## Deliberately out of scope

- Manager-editable settings and the shared `MANAGER_SETTINGS_TOKEN` are removed. Store information is read-only until staff authentication and role checks are available.
- Order and order-line models, order creation, status updates, confirmation/status pages, and demo checkout behavior are removed from this PR. Order persistence must align with the payment-authorized flow and the assigned order/payment stories. The original submitted ZIP can be retained as a reference for a separate follow-up branch.
- No payment is processed and no order is created from the cart in this branch.

## Prisma migration note

The incorrectly nested `server/prisma/migrations/migrations/` directory and its duplicate migration files have been removed. This PR intentionally retains the schema changes for `email` and `openingHours` in `server/prisma/schema.prisma` without checking in a hand-created migration. From the `server` directory, use the project's migration workflow to generate a correctly located migration after reviewing the schema changes; the repository's root script is `npm run db:migrate`. Review the generated migration before committing it.

## Validation

Run locally with Node.js 24 and dependencies installed:

```bash
npm test
npm run build
```

These commands have not been run as part of preparing this revised package.
