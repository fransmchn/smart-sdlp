import { formatPeriodeLabel } from "./reportAccess";
import { JAKARTA_OFFSET_MS } from "./reportDeadline";

// Setiap kegiatan berlaku untuk satu tahun anggaran (TA). Laporan sebuah kegiatan
// hanya boleh dibuat untuk periode di dalam TA-nya, sehingga perhitungan pagu
// (realisasi kumulatif) tidak bercampur antar tahun.

export const TAHUN_ANGGARAN_MIN = 2020;
export const TAHUN_ANGGARAN_MAX = 2100;

export type PeriodeOption = { label: string; bulan: number; tahun: number };

export function isTahunAnggaranValid(tahun: number): boolean {
  return (
    Number.isInteger(tahun) &&
    tahun >= TAHUN_ANGGARAN_MIN &&
    tahun <= TAHUN_ANGGARAN_MAX
  );
}

export function isPeriodeDalamTahunAnggaran(
  periodeTahun: number,
  tahunAnggaran: number,
): boolean {
  return periodeTahun === tahunAnggaran;
}

export function pesanDiluarTahunAnggaran(tahunAnggaran: number): string {
  return `Kegiatan ini berlaku untuk tahun anggaran ${tahunAnggaran}, sehingga laporan hanya dapat dibuat untuk periode tahun ${tahunAnggaran}.`;
}

export function pesanTahunAnggaranBelumDimulai(tahunAnggaran: number): string {
  return `Tahun anggaran ${tahunAnggaran} belum dimulai. Laporan baru dapat diisi mulai Januari ${tahunAnggaran}.`;
}

export function pesanTahunAnggaranTidakBisaDiubah(
  tahunBaru: number,
  tahunLaporan: number[],
): string {
  const daftar = [...new Set(tahunLaporan)].sort((a, b) => a - b).join(", ");
  return `Tahun anggaran tidak dapat diubah menjadi ${tahunBaru} karena kegiatan ini sudah memiliki laporan pada periode tahun ${daftar}.`;
}

// Tahun dan bulan (1-12) saat ini menurut WIB, bukan zona waktu server.
export function getWibYearMonth(nowMs: number): { tahun: number; bulan: number } {
  const wib = new Date(nowMs + JAKARTA_OFFSET_MS);
  return { tahun: wib.getUTCFullYear(), bulan: wib.getUTCMonth() + 1 };
}

// Periode yang sudah berjalan (bulan berjalan menurut WIB ikut dihitung).
// Periode di masa depan belum boleh dilaporkan.
export function isPeriodeSudahBerjalan(
  nowMs: number,
  bulan: number,
  tahun: number,
): boolean {
  const sekarang = getWibYearMonth(nowMs);
  return (
    tahun < sekarang.tahun || (tahun === sekarang.tahun && bulan <= sekarang.bulan)
  );
}

export function pesanPeriodeBelumBerjalan(bulan: number, tahun: number): string {
  return `Periode ${formatPeriodeLabel(bulan, tahun)} belum berjalan, sehingga belum dapat dilaporkan.`;
}

// Periode yang boleh dipilih PJ untuk kegiatan dengan TA tertentu, terbaru dulu:
// - TA tahun ini        : Januari sampai bulan ini
// - TA tahun-tahun lalu : Januari sampai Desember (sudah berlalu seluruhnya)
// - TA tahun depan      : belum ada (kosong)
export function buatOpsiPeriode(
  nowMs: number,
  tahunAnggaran: number,
): PeriodeOption[] {
  const sekarang = getWibYearMonth(nowMs);
  if (tahunAnggaran > sekarang.tahun) return [];
  const bulanTerakhir = tahunAnggaran === sekarang.tahun ? sekarang.bulan : 12;
  return Array.from({ length: bulanTerakhir }, (_, index) => {
    const bulan = bulanTerakhir - index;
    return {
      label: formatPeriodeLabel(bulan, tahunAnggaran),
      bulan,
      tahun: tahunAnggaran,
    };
  });
}

// TA hanya boleh diubah bila semua laporan yang sudah ada berada di TA baru.
export function bisaUbahTahunAnggaran(
  tahunBaru: number,
  tahunLaporanYangAda: number[],
): boolean {
  return tahunLaporanYangAda.every((tahun) => tahun === tahunBaru);
}

// Pilihan tahun pada form admin: dua tahun ke belakang sampai dua tahun ke depan
// dari tahun berjalan, ditambah tahun yang sedang terpilih (bila di luar rentang).
export function daftarTahunAnggaran(
  tahunSekarang: number,
  terpilih?: number,
): number[] {
  const tahun = new Set<number>();
  for (let t = tahunSekarang - 2; t <= tahunSekarang + 2; t++) tahun.add(t);
  if (terpilih !== undefined && isTahunAnggaranValid(terpilih)) tahun.add(terpilih);
  return [...tahun].filter(isTahunAnggaranValid).sort((a, b) => a - b);
}
