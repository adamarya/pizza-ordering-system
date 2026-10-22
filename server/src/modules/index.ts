import { Router } from 'express';
import { catalogRouter } from './catalog/catalog.routes.js';
import { cartRouter } from './cart/cart.routes.js';
import { storeRouter } from './store/store.routes.js';
import { ordersRouter } from './orders/orders.routes.js';

export const apiRouter = Router();
apiRouter.use(catalogRouter);
apiRouter.use(cartRouter);
apiRouter.use(storeRouter);
apiRouter.use(ordersRouter);
