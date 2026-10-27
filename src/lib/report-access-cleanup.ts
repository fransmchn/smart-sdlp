import type { Prisma } from "@/generated/prisma/client";
import { recordAdminAudit } from "@/lib/audit";

export const CATATAN_PENOLAKAN_OTOMATIS =
  "Ditolak otomatis karena kegiatan diblokir.";

type CleanupResult = { aksesDicabut: number; permintaanDitolak: number };

// Dipanggil saat sebuah kegiatan diubah menjadi DIBLOKIR, di dalam transaksi
// yang sama dengan perubahan statusnya. Kegiatan diblokir tidak boleh diisi PJ,
// jadi akses lapor yang masih terbuka dicabut dan permintaan akses yang
// menunggu ditolak, supaya tidak ada akses "menggantung" yang tampak aktif.
// Aman dipanggil berulang: tanpa akses atau permintaan aktif, tidak ada yang berubah.
export async function cabutAksesSaatDiblokir(
  tx: Prisma.TransactionClient,
  kegiatan: { id: string; kode: string; nama: string },
  admin: { id: string; name: string; email: string },
  now: Date = new Date(),
): Promise<CleanupResult> {
  const akses = await tx.reportAccessOverride.updateMany({
    where: {
      kegiatanId: kegiatan.id,
      revokedAt: null,
      openedUntil: { gt: now },
    },
    data: { revokedAt: now },
  });
  const permintaan = await tx.reportAccessRequest.updateMany({
    where: { kegiatanId: kegiatan.id, status: "PENDING" },
    data: {
      status: "REJECTED",
      decidedById: admin.id,
      decidedAt: now,
      decisionNote: CATATAN_PENOLAKAN_OTOMATIS,
    },
  });

  const result = {
    aksesDicabut: akses.count,
    permintaanDitolak: permintaan.count,
  };
  if (result.aksesDicabut === 0 && result.permintaanDitolak === 0) {
    return result;
  }

  await recordAdminAudit(
    {
      action: "REVOKE_REPORT_ACCESS",
      adminName: admin.name,
      adminEmail: admin.email,
      kodeKegiatan: kegiatan.kode,
      namaKegiatan: kegiatan.nama,
      alasan: `Dicabut otomatis karena kegiatan diblokir: ${result.aksesDicabut} akses dicabut, ${result.permintaanDitolak} permintaan ditolak.`,
    },
    tx,
  );
  return result;
}
