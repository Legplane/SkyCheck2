-- Google Sign-In: optional password hash + optional Google subject id

ALTER TABLE "users" ALTER COLUMN "passHash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
