import type { PrismaClient } from '@prisma/client';

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
