-- CreateEnum
CREATE TYPE "access_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "report_access_request" (
    "id" TEXT NOT NULL,
    "kegiatanId" TEXT NOT NULL,
    "periodeBulan" INTEGER NOT NULL,
    "periodeTahun" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "access_request_status" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_access_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_access_request_status_idx" ON "report_access_request"("status");

-- CreateIndex
CREATE INDEX "report_access_request_periode_idx" ON "report_access_request"("kegiatanId", "periodeBulan", "periodeTahun");

-- AddForeignKey
ALTER TABLE "report_access_request" ADD CONSTRAINT "report_access_request_kegiatanId_fkey" FOREIGN KEY ("kegiatanId") REFERENCES "kegiatan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_access_request" ADD CONSTRAINT "report_access_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_access_request" ADD CONSTRAINT "report_access_request_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
