-- HealthCheck table
CREATE TABLE "health_checks" (
    "id"                 TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "hasFever"           BOOLEAN NOT NULL DEFAULT false,
    "feverTemp"          DOUBLE PRECISION,
    "hasCough"           BOOLEAN NOT NULL DEFAULT false,
    "hasSoreThroat"      BOOLEAN NOT NULL DEFAULT false,
    "hasFatigue"         BOOLEAN NOT NULL DEFAULT false,
    "hasDifficulty"      BOOLEAN NOT NULL DEFAULT false,
    "hasHeadache"        BOOLEAN NOT NULL DEFAULT false,
    "hasBodyPain"        BOOLEAN NOT NULL DEFAULT false,
    "hasVomiting"        BOOLEAN NOT NULL DEFAULT false,
    "hasChronicCondition" BOOLEAN NOT NULL DEFAULT false,
    "chronicDetail"      TEXT,
    "overallFeeling"     TEXT NOT NULL DEFAULT 'well',
    "additionalNotes"    TEXT,
    "checkDate"          DATE NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "health_checks_userId_checkDate_key"
    ON "health_checks"("userId", "checkDate");

ALTER TABLE "health_checks"
    ADD CONSTRAINT "health_checks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

-- SchoolAnnouncement table
CREATE TABLE "school_announcements" (
    "id"          TEXT NOT NULL,
    "schoolName"  TEXT NOT NULL DEFAULT 'Gordon College',
    "status"      TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt"   TIMESTAMP(3),
    "postedBy"    TEXT,
    "sourceUrl"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_announcements_pkey" PRIMARY KEY ("id")
);

-- GovAnnouncement table
CREATE TABLE "gov_announcements" (
    "id"          TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "severity"    TEXT NOT NULL DEFAULT 'INFO',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt"   TIMESTAMP(3),
    "sourceUrl"   TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gov_announcements_pkey" PRIMARY KEY ("id")
);
