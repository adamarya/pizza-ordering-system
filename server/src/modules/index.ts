import { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { cartRouter } from './cart/cart.routes.js';
import { catalogRouter } from './catalog/catalog.routes.js';
import { menuAdminRouter } from './menuAdmin/menuAdmin.routes.js';
import { paymentsRouter } from './payments/payments.routes.js';
import { ordersRouter } from './orders/orders.routes.js';
import { staffRouter } from './staff/staff.routes.js';


// Each module from Table 19 of the Project Document lives in its own folder under src/modules
// with its routes, service, and repository. Mount new module routers here.
//   catalog  GET /api/menu, GET /api/menu/items/:id   PB-03, PB-04
//   cart     POST /api/cart/quote                      PB-04, PB-05
//   payments GET /api/payments/config                  PB-07 (the webhook is mounted in app.ts)
//   admin    /api/admin/menu, categories, items, sizes, crusts, toppings, availability   PB-10
//   orders   POST /api/orders                          PB-06, PB-07 (and the payment webhook handlers)
//   staff    GET /api/staff/orders   PB-09
export const apiRouter = Router();
apiRouter.use(catalogRouter);
apiRouter.use(cartRouter);
apiRouter.use(paymentsRouter);
apiRouter.use(authRouter);
apiRouter.use(menuAdminRouter);
apiRouter.use(ordersRouter);
apiRouter.use(staffRouter);
