-- PB-02 store profile fields and PB order confirmation/status records.
ALTER TABLE "StoreSettings"
  ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "openingHours" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'READY', 'COMPLETED');
CREATE TYPE "OrderFulfillment" AS ENUM ('PICKUP', 'DELIVERY');
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_PROCESSED', 'PAID', 'FAILED');

CREATE TABLE "Order" (
  "id" UUID NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "publicReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
  "fulfillment" "OrderFulfillment" NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "taxCents" INTEGER NOT NULL,
  "deliveryFeeCents" INTEGER NOT NULL,
  "tipCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_PROCESSED',
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_publicReference_key" ON "Order"("publicReference");

CREATE TABLE "OrderLine" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "options" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "extendedPriceCents" INTEGER NOT NULL,
  CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
