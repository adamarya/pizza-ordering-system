import { Router } from 'express';

// Each module from Table 19 of the Project Document lives in its own folder under src/modules
// with its routes, service, repository, and tests. Mount new module routers here.
//
// Sprint 1 modules and owners (Sprint Planning document, Sprint 1 sheet):
//   store   GET /api/store            PB-02 (moved to Sprint 2)
//   catalog GET /api/menu, /api/menu/items/:id   PB-03, PB-04   Paul Banda (data), Aaron Aguirre (screens)
//   cart    POST /api/cart/quote       PB-05                    Paul Banda (pricing service)
export const apiRouter = Router();
