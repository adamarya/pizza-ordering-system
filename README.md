# Pizza Restaurant Online Ordering System

CS492 Capstone Project II, Group 1: Adam Arya (Scrum Master), Aaron Aguirre (Product Owner), Emmanuella Ahinkrah, and Paul Banda.

A responsive website where a customer browses the menu, configures a pizza, and sees an itemized, server-calculated bill. Sprint 1 Goal: a guest customer can browse the menu, configure an item, and see a correct, itemized bill on a phone or desktop browser, running on the automated pipeline.

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

cp .env.example server/.env      # then edit DATABASE_URL if your database differs
npm run db:generate --workspace server
npm run db:migrate               # creates the tables
npm run db:seed                  # loads the sample menu and test accounts
npm run dev                      # API on http://localhost:3000, site on http://localhost:5173
```

Open http://localhost:5173. The footer shows the build version and whether the API reached the database.

## Running the built application

```bash
npm run build
npm start                        # serves the site and the API together on http://localhost:3000
```

## One-command demo (no PostgreSQL install needed)

```bash
npm ci
npm run build
npm run demo                     # http://localhost:3000, Ctrl+C to stop
```

`npm run demo` starts a private PostgreSQL 16 server from the `embedded-postgres` package (Windows x64, macOS, and Linux), keeps its data in `.demo-db/`, applies the migrations, loads the demo menu, and serves the built site. Delete `.demo-db/` to start from a fresh menu. Run it as a normal user, not as root or Administrator, because PostgreSQL refuses to run with administrator rights.

## Shared test environment

Every merge to `main` that passes CI deploys to https://pizza-group1-defxdagdbsh6hmfv.mexicocentral-01.azurewebsites.net (Azure App Service, Mexico Central, with Azure Database for PostgreSQL). The deploy job builds the app, ships it with production dependencies, and the server applies pending migrations when it starts. `/health` on that site shows the deployed version and database status. With the web app setting `SEED_DEMO_DATA=true`, the server loads the demo menu at startup, but only when the database is empty, so it never overwrites data. The demo manager and staff accounts are never created there, because their passwords are in this public repository. The database password and the publish profile are held in Azure and in the repository's Actions secrets, never in the code.

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
| `GET /health` | Build version and database status |

Design prototypes by Emmanuella Ahinkrah (cart) and Aaron Aguirre (menu and item configuration) are kept in [`docs/prototypes`](docs/prototypes/).

## Tests

```bash
npm test          # server and client test suites (the API tests reset the database in DATABASE_URL to the demo data)
npm run typecheck
```

The server tests delete and reload every catalog, settings, and account row in the database named by `DATABASE_URL`. Point it only at a local or CI database, never at the Azure database. CI also runs `npm audit --omit=dev --audit-level=high`, so a high or critical vulnerability in a package that ships to the site blocks the merge.

## Repository layout

```
client/                 React application
  src/App.tsx           page shell and routes
  src/components/       shared components
server/
  src/app.ts            Express app, /health, error handling
  src/modules/          one folder per module: catalog, cart, store (routes, service, repository, tests)
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
