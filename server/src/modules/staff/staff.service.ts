import type { PrismaClient } from '@prisma/client';
import { isAllowedStep, type KitchenStatus } from './staff.transitions.js';

// The statuses the kitchen still has to act on. PENDING_PAYMENT, PAYMENT_FAILED and EXPIRED never
// reach the queue, and COMPLETED and CANCELLED leave it (S2-25).
export const OPEN_STATUSES = ['RECEIVED', 'IN_PROGRESS', 'READY'] as const;

// Oldest first, which is the sequence the orders were received. Phone and email are not selected:
// the kitchen does not need them, and contact details appear only where fulfillment needs them.
export function listOpenOrders(prisma: PrismaClient) {
  return prisma.order.findMany({
    where: { status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: 'asc' },
    select: {
      orderNumber: true,
      status: true,
      fulfillment: true,
      requestedTime: true,
      createdAt: true,
      customerName: true,
      lines: {
        orderBy: { position: 'asc' },
        select: {
          itemName: true,
          sizeLabel: true,
          crustName: true,
          quantity: true,
          instructions: true,
          toppings: { select: { name: true, placement: true } },
        },
      },
    },
  });
}


export type ChangeStatusResult =
  | { ok: true; order: { orderNumber: number; status: KitchenStatus } }
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_STEP' | 'CHANGED' };

// Moves an order one step (S2-23). The status change and the history row are written in one
// transaction, so an order can never change without a record of who changed it. The update only
// matches while the order still has the status we read, so if two staff press the button at the
// same moment, one succeeds and the other gets CHANGED instead of overwriting.
export function changeOrderStatus(
  prisma: PrismaClient,
  orderNumber: number,
  to: KitchenStatus,
  actor: string,
): Promise<ChangeStatusResult> {
  return prisma.$transaction(async (tx): Promise<ChangeStatusResult> => {
    const order = await tx.order.findUnique({ where: { orderNumber }, select: { id: true, status: true } });
    if (!order) return { ok: false, reason: 'NOT_FOUND' };
    if (!isAllowedStep(order.status, to)) return { ok: false, reason: 'INVALID_STEP' };

    const moved = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to } });
    if (moved.count === 0) return { ok: false, reason: 'CHANGED' };

    await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: to, actor } });
    return { ok: true, order: { orderNumber, status: to } };
  });
}
