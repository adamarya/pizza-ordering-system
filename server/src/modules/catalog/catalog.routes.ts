import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../db.js';
import { getMenu, getMenuItem } from './catalog.repository.js';

// GET /api/menu            categories, items, sizes, crusts, toppings, availability (PB-03)
// GET /api/menu/items/:id  options for one item (PB-04)
export const catalogRouter = Router();

catalogRouter.get('/menu', async (req, res, next) => {
  try {
    const menu = await getMenu(getPrisma());
    if (!menu) return res.status(503).json({ error: 'The menu is not set up yet.' });
    // The ETag follows menuVersion, which the manager's changes increase, so a browser that
    // already holds the current menu gets a 304 instead of downloading it again (Table 22).
    const etag = `W/"menu-${menu.menuVersion}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(menu);
  } catch (err) {
    next(err);
  }
});

const idSchema = z.string().uuid();

catalogRouter.get('/menu/items/:id', async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'Item id is not valid.' });
    const item = await getMenuItem(getPrisma(), id.data);
    if (!item) return res.status(404).json({ error: 'That item is not on the menu.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});
