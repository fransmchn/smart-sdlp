-- Tambah tahun anggaran (TA) per kegiatan.
-- Kolom dibuat dengan default 2026 agar baris yang sudah ada terisi, lalu default
-- dilepas supaya kegiatan baru wajib menyebut tahunnya secara eksplisit.
ALTER TABLE "kegiatan" ADD COLUMN "tahunAnggaran" INTEGER NOT NULL DEFAULT 2026;
ALTER TABLE "kegiatan" ALTER COLUMN "tahunAnggaran" DROP DEFAULT;

-- Kegiatan yang sudah punya laporan mengikuti tahun laporannya (terbaru), agar
-- laporan lama tidak berada di luar TA kegiatannya. Yang belum punya laporan
-- tetap 2026.
UPDATE "kegiatan" AS k
SET "tahunAnggaran" = l."tahunTerbaru"
FROM (
    SELECT "kegiatanId", MAX("periodeTahun") AS "tahunTerbaru"
    FROM "laporan"
    GROUP BY "kegiatanId"
) AS l
WHERE l."kegiatanId" = k."id";
