// Pemformat waktu untuk tampilan. Selalu memakai zona WIB (Asia/Jakarta),
// jadi hasilnya sama baik di komputer pengembang maupun di server (yang
// biasanya memakai UTC).

export function formatWaktuWib(date: Date): string {
  return (
    date.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

// Laporan dianggap pernah direvisi bila waktu terakhir diubah lebih dari
// 1 detik setelah waktu pertama dibuat (selisih kecil terjadi saat pembuatan).
export function isLaporanRevised(createdAt: Date, updatedAt: Date): boolean {
  return updatedAt.getTime() - createdAt.getTime() > 1000;
}
