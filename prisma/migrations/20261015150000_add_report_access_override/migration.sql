-- CreateTable
CREATE TABLE "report_access_override" (
    "id" TEXT NOT NULL,
    "kegiatanId" TEXT NOT NULL,
    "periodeBulan" INTEGER NOT NULL,
    "periodeTahun" INTEGER NOT NULL,
    "openedUntil" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "report_access_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_access_override_kegiatanId_idx" ON "report_access_override"("kegiatanId");

-- CreateIndex
CREATE UNIQUE INDEX "report_access_override_kegiatan_periode_key" ON "report_access_override"("kegiatanId", "periodeBulan", "periodeTahun");

-- AddForeignKey
ALTER TABLE "report_access_override" ADD CONSTRAINT "report_access_override_kegiatanId_fkey" FOREIGN KEY ("kegiatanId") REFERENCES "kegiatan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_access_override" ADD CONSTRAINT "report_access_override_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
