-- DropForeignKey
ALTER TABLE "health_checks" DROP CONSTRAINT "health_checks_userId_fkey";

-- AlterTable
ALTER TABLE "health_checks" ALTER COLUMN "checkDate" SET DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
