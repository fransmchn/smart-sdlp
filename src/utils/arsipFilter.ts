import { NAMA_BULAN } from "./reportAccess";
import {
  buatOpsiPeriode,
  isPeriodeSudahBerjalan,
  isTahunAnggaranValid,
} from "./tahunAnggaran";

// Logika filter tahun/bulan/pencarian untuk halaman Arsip SP2D. Dipisah dari
// halaman supaya bisa diuji tanpa database.

export const TAHUN_SEMUA = "SEMUA";

export type TahunScope = { semua: true } | { semua: false; tahun: number };
export type PeriodeBulanTahun = { bulan: number; tahun: number };
export type BulanFilterOption = { value: string; label: string };
export type PetunjukTahun = { tahun: number; jumlah: number };
export type KegiatanPencarian = {
  tahunAnggaran: number;
  kode: string;
  nama: string;
  pjNama: string;
  pjEmail: string;
};

// Tanpa parameter (atau tidak valid) = tahun berjalan.
export function parseTahunScope(
  param: string | undefined,
  tahunSekarang: number,
): TahunScope {
  if (param === TAHUN_SEMUA) return { semua: true };
  const tahun = Number(param);
  if (param && isTahunAnggaranValid(tahun)) return { semua: false, tahun };
  return { semua: false, tahun: tahunSekarang };
}

export function tahunScopeValue(scope: TahunScope): string {
  return scope.semua ? TAHUN_SEMUA : String(scope.tahun);
}

// Parameter bulan: "1" sampai "12". Selain itu dianggap tidak ada.
export function parseBulanParam(param: string | undefined): number | null {
  if (!param || !/^\d{1,2}$/.test(param)) return null;
  const bulan = Number(param);
  return bulan >= 1 && bulan <= 12 ? bulan : null;
}

// Tahun yang ditawarkan pada filter: tahun anggaran kegiatan, tahun laporan, dan tahun berjalan.
export function daftarTahunFilter(
  tahunKegiatan: number[],
  tahunLaporan: number[],
  tahunSekarang: number,
): number[] {
  const semua = new Set([...tahunKegiatan, ...tahunLaporan, tahunSekarang]);
  return [...semua].filter(isTahunAnggaranValid).sort((a, b) => b - a);
}

// Pilihan bulan pada filter: daftar tetap (maksimal 12) untuk satu tahun, yaitu
// bulan yang sudah berjalan ditambah bulan yang sudah punya laporan. Tidak ada
// pilihan bulan untuk "Semua Tahun", karena bulan tanpa tahun tidak bermakna.
export function opsiBulanFilter(
  scope: TahunScope,
  periodeLaporan: PeriodeBulanTahun[],
  nowMs: number,
): BulanFilterOption[] {
  if (scope.semua) return [];
  const bulan = new Set<number>();
  for (const o of buatOpsiPeriode(nowMs, scope.tahun)) bulan.add(o.bulan);
  for (const p of periodeLaporan) {
    if (p.tahun === scope.tahun) bulan.add(p.bulan);
  }
  return [...bulan]
    .sort((a, b) => a - b)
    .map((b) => ({ value: String(b), label: NAMA_BULAN[b - 1] }));
}

// Pencarian: huruf besar/kecil tidak dibedakan, cocok bila salah satu kolom memuat teksnya.
// `q` harus sudah di-trim dan di-lowercase.
export function cocokPencarian(q: string, ...kolom: string[]): boolean {
  return !q || kolom.some((nilai) => nilai.toLowerCase().includes(q));
}

// Saat tabel kosong: tahun lain yang punya kegiatan (dan cocok dengan pencarian
// bila ada), agar pengguna tahu ke mana harus melihat. Pada tahun spesifik,
// tahun yang sedang dilihat tidak diulang. Pada "Semua Tahun", semua tahun
// dicantumkan karena tampilan itu tidak memuat kegiatan tahun lampau tanpa laporan.
export function hitungPetunjukTahun(
  kegiatan: KegiatanPencarian[],
  q: string,
  scope: TahunScope,
): PetunjukTahun[] {
  const jumlah = new Map<number, number>();
  for (const k of kegiatan) {
    if (!cocokPencarian(q, k.kode, k.nama, k.pjNama, k.pjEmail)) continue;
    if (!scope.semua && k.tahunAnggaran === scope.tahun) continue;
    jumlah.set(k.tahunAnggaran, (jumlah.get(k.tahunAnggaran) ?? 0) + 1);
  }
  return [...jumlah]
    .map(([tahun, n]) => ({ tahun, jumlah: n }))
    .sort((a, b) => b.tahun - a.tahun);
}

// Periode yang dibuatkan baris "Belum Upload" pada tampilan "Semua Bulan": setiap
// bulan yang sudah berjalan pada tahun yang dicakup.
// - tahun berjalan : Januari sampai bulan berjalan
// - tahun lampau   : seluruh 12 bulan
// - tahun depan    : tidak ada (belum dimulai)
// - Semua Tahun    : gabungan di atas untuk setiap tahun anggaran yang dimiliki kegiatan
// Kegiatan hanya dibuatkan baris pada tahun anggarannya sendiri (lihat kegiatanWajibLaporPada).
export function periodeVirtualUntukScope(
  scope: TahunScope,
  nowMs: number,
  tahunKegiatan: number[],
): PeriodeBulanTahun[] {
  const tahun = scope.semua
    ? [...new Set(tahunKegiatan)].filter(isTahunAnggaranValid).sort((a, b) => b - a)
    : [scope.tahun];
  return tahun.flatMap((t) =>
    buatOpsiPeriode(nowMs, t).map((o) => ({ bulan: o.bulan, tahun: o.tahun })),
  );
}

// Sebuah kegiatan hanya diharapkan melapor pada periode di dalam tahun anggarannya
// yang sudah berjalan.
export function kegiatanWajibLaporPada(
  tahunAnggaran: number,
  periode: PeriodeBulanTahun,
  nowMs: number,
): boolean {
  return (
    periode.tahun === tahunAnggaran &&
    isPeriodeSudahBerjalan(nowMs, periode.bulan, periode.tahun)
  );
}
