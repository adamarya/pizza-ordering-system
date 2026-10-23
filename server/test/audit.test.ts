import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnect, getPrisma } from '../src/db.js';
import { recordAudit } from '../src/modules/audit/audit.js';
import { seedDemoData } from '../src/seed/demoData.js';

// S2-02: every change records the acting account, in the same transaction as the change.
// Runs against the real test database; seedDemoData resets it to the demo data first.
const prisma = getPrisma();
let managerId: string;
let categoryId: string;

beforeAll(async () => {
  await seedDemoData(prisma);
  managerId = (await prisma.userAccount.findUniqueOrThrow({ where: { username: 'manager' } })).id;
  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: 'asc' } })).id;
});
afterAll(() => disconnect());

describe('audit entries (S2-02)', () => {
  it('records the acting account together with the change', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id: categoryId }, data: { name: 'Pizzas (edited)' } });
      await recordAudit(tx, {
        actorId: managerId,
        action: 'category.update',
        entityType: 'Category',
        entityId: categoryId,
        correlationId: 'req-test-1',
      });
    });
    const entry = await prisma.auditEntry.findFirstOrThrow({ where: { entityId: categoryId } });
    expect(entry).toMatchObject({
      actorId: managerId,
      action: 'category.update',
      entityType: 'Category',
      correlationId: 'req-test-1',
    });
    expect((await prisma.category.findUniqueOrThrow({ where: { id: categoryId } })).name).toBe('Pizzas (edited)');
  });

  it('keeps no audit entry when the change is rolled back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit(tx, {
          actorId: managerId,
          action: 'category.update',
          entityType: 'Category',
          entityId: 'rolled-back',
        });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await prisma.auditEntry.count({ where: { entityId: 'rolled-back' } })).toBe(0);
  });
});