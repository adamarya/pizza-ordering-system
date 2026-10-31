-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openingHours" JSONB NOT NULL DEFAULT '{}';
