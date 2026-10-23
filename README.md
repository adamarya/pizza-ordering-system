# Pizza Restaurant Online Ordering System

CS492 Capstone Project II, Group 1: Adam Arya (Scrum Master), Aaron Aguirre (Product Owner), Emmanuella Ahinkrah, and Paul Banda.

A responsive Pizza Restaurant Online Ordering System. Sprint 1 covers the menu, item configuration, cart, and server-calculated quotes. This branch adds read-only public store information and a photo gallery.

## Stack

| Layer | Choice |
|---|---|
| Client | React 18, TypeScript, Vite (`/client`) |
| API | Node.js 24 LTS, Express, TypeScript, zod (`/server`) |
| Database | PostgreSQL 16 through Prisma (`/server/prisma`) |
| Tests | Vitest, Supertest, Testing Library |
| CI and deploy | GitHub Actions (`.github/workflows/ci.yml`) to Azure App Service |

## Local setup

You need Node.js 24 LTS, Git, and PostgreSQL 16 (installed locally or through Docker).

```bash
git clone https://github.com/adamarya/pizza-ordering-system.git
cd pizza-ordering-system
npm install

# Database: either start the bundled container...
docker compose up -d
# ...or create a database named "pizza" with user "pizza" / password "pizza" in your local PostgreSQL.

cp .env.example server/.env
# Edit DATABASE_URL if your local database differs.
npm run db:generate --workspace server
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173. The footer shows the build version and whether the API reached the database.

## One-command demo (no PostgreSQL install needed)

```bash
npm ci
npm run build
npm run demo
```

`npm run demo` starts a private PostgreSQL 16 server from the `embedded-postgres` package, applies migrations, loads demo data, and serves the built site. Run it as a normal user, not as root or Administrator.

## Sprint 2 features in this branch

| Feature | Route / endpoint | Notes |
|---|---|---|
| Public store profile, contact details and opening hours | `/store`, `GET /api/store` | Values come from the seeded `StoreSettings` record. The address links to Google Maps directions. |
| Photo gallery | `/gallery` | Responsive gallery entries are rendered from a data list. |

**Scope note:** Store profile editing is intentionally read-only in this PR. Manager editing will be added after staff sign-in and role checks are available. Order persistence, payment authorization, order confirmation, and order status management are out of scope for this PR and should be handled in their assigned stories. The cart continues to display the server-calculated quote but does not submit orders.

## What Sprint 1 delivers

| Screen | Route | Backlog |
|---|---|---|
| Menu by category, unavailable items labeled | `/menu` | PB-03 |
| Item configuration: size, crust, whole or half toppings, quantity, instructions, live server price | `/menu/:itemId` | PB-04 |
| Cart with pickup or delivery, tip, and the server's itemized quote | `/cart` | PB-05 |

| Endpoint | Purpose |
|---|---|
| `GET /api/menu` | Categories, items, sizes, crusts, toppings, availability; ETag on the menu version |
| `GET /api/menu/items/:id` | One item's options |
| `POST /api/cart/quote` | Prices a cart under the Table 21 rules; validates every field on the server |
| `GET /api/store` | Public read-only store profile from seed/database settings |
| `GET /health` | Build version and database status |

Design prototypes by Emmanuella Ahinkrah (cart) and Aaron Aguirre (menu and item configuration) are kept in [`docs/prototypes`](docs/prototypes/).

## Tests and build

```bash
npm test
npm run build
npm run typecheck
```

Run these commands locally with Node.js 24 and the project dependencies installed before requesting approval.

## Repository layout

```
client/                 React application
  src/App.tsx           page shell and routes
  src/components/       shared components
server/
  src/app.ts            Express app, /health, error handling
  src/modules/          one folder per API module
  prisma/schema.prisma  database schema and migrations
  prisma/seed.ts        synthetic seed data
  test/                 API tests
```

## Working agreements

- `main` is protected. Every change goes through a pull request approved by another member, with CI green.
- Branch names: `S1-14-menu-page` (task ID first, then a short description).
- The pull request template carries the Definition of Done checklist. Tick every box or explain why not.
- Never commit `.env`, keys, or connection strings. Settings come from environment variables; see `.env.example`.
- Money is integer cents everywhere (Project Document, Table 21). The browser displays the server's quote and never computes the total itself.
- Log your hours with the task ID, date, and what you did.

## Sprint 1 task owners

| Area | Owner | Tasks |
|---|---|---|
| Build and pipeline | Adam Arya | S1-02, S1-03, S1-05, S1-06, S1-07, S1-08 |
| Customer screens | Aaron Aguirre | S1-11, S1-14, S1-15, S1-19, S1-20, S1-22 |
| Interface and database | Paul Banda | S1-04, S1-13, S1-18, S1-23, S1-25 |
| Test, accessibility, cart screen | Emmanuella Ahinkrah | S1-16, S1-21, S1-24, S1-27 to S1-30 |
