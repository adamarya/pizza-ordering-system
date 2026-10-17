import { Router } from 'express';
import { catalogRouter } from './catalog/catalog.routes.js';
import { cartRouter } from './cart/cart.routes.js';

// Each module from Table 19 of the Project Document lives in its own folder under src/modules
// with its routes, service, and repository. Mount new module routers here.
//   catalog  GET /api/menu, GET /api/menu/items/:id   PB-03, PB-04
//   cart     POST /api/cart/quote                      PB-04, PB-05
export const apiRouter = Router();
apiRouter.use(catalogRouter);
apiRouter.use(cartRouter);
