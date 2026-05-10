-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('WEATHER', 'TRAFFIC', 'FLOOD');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passHash" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyTok" TEXT,
    "verifyExp" TIMESTAMP(3),
    "resetTok" TEXT,
    "resetExp" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "morningAlerts" BOOLEAN NOT NULL DEFAULT true,
    "alertSound" BOOLEAN NOT NULL DEFAULT false,
    "vibration" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "startAddress" TEXT NOT NULL,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLon" DOUBLE PRECISION NOT NULL,
    "destAddress" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLon" DOUBLE PRECISION NOT NULL,
    "departTime" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastWeatherRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastTrafficRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastFloodRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastOverallRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastRiskBasis" TEXT NOT NULL DEFAULT '',
    "lastRiskAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT,
    "type" "AlertType" NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_verifyTok_key" ON "users"("verifyTok");

-- CreateIndex
CREATE UNIQUE INDEX "users_resetTok_key" ON "users"("resetTok");

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
