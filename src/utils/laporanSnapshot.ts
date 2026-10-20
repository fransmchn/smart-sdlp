// Salinan isi laporan yang disimpan di Log Audit sebelum laporan dihapus.
// Nilai uang (BigInt) disimpan sebagai teks supaya aman disimpan sebagai JSON.

export type LaporanSnapshot = {
  versi: 1;
  laporanId: string;
  kegiatanId: string;
  kodeKegiatan: string;
  namaKegiatan: string;
  paguKegiatan: string;
  periodeBulan: number;
  periodeTahun: number;
  uraian: string;
  fisik: number;
  statusAnggaran: string;
  realLalu: string;
  realIni: string;
  realisasi: string;
  submittedById: string | null;
  dibuatPada: string;
  diubahPada: string;
};

type LaporanInput = {
  id: string;
  kegiatanId: string;
  periodeBulan: number;
  periodeTahun: number;
  uraian: string;
  fisik: number;
  statusAnggaran: string;
  realLalu: bigint;
  realIni: bigint;
  realisasi: bigint;
  submittedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type KegiatanInput = { kode: string; nama: string; pagu: bigint };

export function buildLaporanSnapshot(
  laporan: LaporanInput,
  kegiatan: KegiatanInput,
): LaporanSnapshot {
  return {
    versi: 1,
    laporanId: laporan.id,
    kegiatanId: laporan.kegiatanId,
    kodeKegiatan: kegiatan.kode,
    namaKegiatan: kegiatan.nama,
    paguKegiatan: kegiatan.pagu.toString(),
    periodeBulan: laporan.periodeBulan,
    periodeTahun: laporan.periodeTahun,
    uraian: laporan.uraian,
    fisik: laporan.fisik,
    statusAnggaran: laporan.statusAnggaran,
    realLalu: laporan.realLalu.toString(),
    realIni: laporan.realIni.toString(),
    realisasi: laporan.realisasi.toString(),
    submittedById: laporan.submittedById,
    dibuatPada: laporan.createdAt.toISOString(),
    diubahPada: laporan.updatedAt.toISOString(),
  };
}

function isDigits(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+$/.test(value);
}

// Membaca kembali salinan dari database dengan aman. Mengembalikan null bila
// bentuknya tidak dikenali (misalnya log lama yang tidak punya salinan).
export function parseLaporanSnapshot(value: unknown): LaporanSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.versi !== 1) return null;
  const teks = [
    "laporanId",
    "kegiatanId",
    "kodeKegiatan",
    "namaKegiatan",
    "uraian",
    "statusAnggaran",
    "dibuatPada",
    "diubahPada",
  ] as const;
  for (const key of teks) {
    if (typeof v[key] !== "string") return null;
  }
  if (!isDigits(v.paguKegiatan) || !isDigits(v.realLalu) || !isDigits(v.realIni) || !isDigits(v.realisasi)) {
    return null;
  }
  if (typeof v.periodeBulan !== "number" || typeof v.periodeTahun !== "number") return null;
  if (typeof v.fisik !== "number") return null;
  if (v.submittedById !== null && typeof v.submittedById !== "string") return null;
  return v as unknown as LaporanSnapshot;
}

// Rupiah tanpa pembulatan, dari angka bulat berbentuk teks. Contoh: 1500000 -> Rp 1.500.000
export function formatRupiahDariTeks(value: string): string {
  const negatif = value.startsWith("-");
  const digits = negatif ? value.slice(1) : value;
  const titik = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negatif ? "-" : ""}Rp ${titik}`;
}
