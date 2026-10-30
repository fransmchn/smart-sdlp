import { NAMA_BULAN } from "./reportAccess";
import {
  buatOpsiPeriode,
  getWibYearMonth,
  isPeriodeSudahBerjalan,
  isTahunAnggaranValid,
} from "./tahunAnggaran";

// Logika murni dashboard admin: periode yang dilihat, status kepatuhan, dan data
// grafik. Semuanya dihitung hanya untuk kegiatan pada SATU tahun anggaran, supaya
// angka tidak bercampur antar tahun.

const NAMA_BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export type PeriodeDashboard = {
  tahun: number;
  // Bulan acuan ("posisi per bulan ini"), selalu 1..12.
  bulan: number;
  // Bulan terakhir yang sudah berjalan pada tahun itu; null bila tahun belum dimulai.
  bulanTerbaru: number | null;
  belumDimulai: boolean;
};

export type BulanOption = { value: string; label: string };

// Tahun: parameter bila valid, selain itu tahun berjalan (WIB).
// Bulan: parameter bila valid, dibatasi sampai bulan terakhir yang sudah berjalan;
// bawaannya bulan terakhir yang sudah berjalan (tahun berjalan: bulan ini;
// tahun lampau: Desember; tahun depan: Januari, dengan belumDimulai = true).
export function tentukanPeriodeDashboard(
  tahunParam: string | undefined,
  bulanParam: string | undefined,
  nowMs: number,
): PeriodeDashboard {
  const sekarang = getWibYearMonth(nowMs);
  const tahunDiminta = Number(tahunParam);
  const tahun =
    tahunParam && isTahunAnggaranValid(tahunDiminta) ? tahunDiminta : sekarang.tahun;

  const bulanTerbaru =
    tahun > sekarang.tahun ? null : tahun === sekarang.tahun ? sekarang.bulan : 12;
  if (bulanTerbaru === null) {
    return { tahun, bulan: 1, bulanTerbaru, belumDimulai: true };
  }

  const bulanDiminta = /^\d{1,2}$/.test(bulanParam ?? "") ? Number(bulanParam) : NaN;
  const bulan =
    bulanDiminta >= 1 && bulanDiminta <= 12
      ? Math.min(bulanDiminta, bulanTerbaru)
      : bulanTerbaru;
  return { tahun, bulan, bulanTerbaru, belumDimulai: false };
}

// Pilihan bulan: bulan yang sudah berjalan pada tahun itu (Januari lebih dulu).
export function opsiBulanDashboard(tahun: number, nowMs: number): BulanOption[] {
  return buatOpsiPeriode(nowMs, tahun)
    .map((o) => o.bulan)
    .sort((a, b) => a - b)
    .map((b) => ({ value: String(b), label: NAMA_BULAN[b - 1] }));
}

export type StatusKepatuhan = "sudah" | "belum" | "diblokir" | "belum-berjalan";

// Status sebuah kegiatan pada periode yang dilihat:
// - belum-berjalan  : periodenya belum tiba
// - sudah           : ada laporan pada periode itu (juga bila kegiatan kini diblokir,
//                     karena laporannya memang sudah dikirim sebelum diblokir)
// - diblokir        : tidak ada laporan dan PJ tidak bisa mengisi, jadi bukan
//                     kewajiban dan bukan keterlambatan
// - belum           : tidak ada laporan padahal seharusnya ada
export function statusKepatuhan(input: {
  diblokir: boolean;
  sudahLapor: boolean;
  periode: { bulan: number; tahun: number };
  nowMs: number;
}): StatusKepatuhan {
  if (!isPeriodeSudahBerjalan(input.nowMs, input.periode.bulan, input.periode.tahun)) {
    return "belum-berjalan";
  }
  if (input.sudahLapor) return "sudah";
  return input.diblokir ? "diblokir" : "belum";
}

// Hanya kegiatan yang ditetapkan wajib lapor DAN yang sedang bisa/harus lapor yang dihitung.
export function hitungKepatuhan(
  kegiatan: { wajib: boolean; kepatuhan: StatusKepatuhan }[],
): { totalWajib: number; sudah: number; belum: number } {
  let sudah = 0;
  let belum = 0;
  for (const k of kegiatan) {
    if (!k.wajib) continue;
    if (k.kepatuhan === "sudah") sudah++;
    else if (k.kepatuhan === "belum") belum++;
  }
  return { totalWajib: sudah + belum, sudah, belum };
}

type KegiatanGrafik = { id: string; jenis: string | null; pagu: number };
type LaporanGrafik = {
  kegiatanId: string;
  periodeBulan: number;
  periodeTahun: number;
  realIni: number;
};
const adalahApbn = (jenis: string | null) => (jenis || "APBN") === "APBN";

export type BarPoint = {
  name: string;
  apbn_real: number;
  non_real: number;
  apbn_pct: number;
  non_pct: number;
};

// Realisasi per bulan (Januari sampai `bulanSampai`) pada tahun itu, terhadap pagu
// jenis anggarannya. `kegiatan` harus sudah hanya berisi kegiatan satu tahun anggaran.
export function bangunBarData(
  kegiatan: KegiatanGrafik[],
  laporan: LaporanGrafik[],
  tahun: number,
  bulanSampai: number,
): BarPoint[] {
  const ids = new Set(kegiatan.map((k) => k.id));
  const jenisPerId = new Map(kegiatan.map((k) => [k.id, k.jenis]));
  const paguApbn = kegiatan.filter((k) => adalahApbn(k.jenis)).reduce((s, k) => s + k.pagu, 0);
  const paguNon = kegiatan.filter((k) => !adalahApbn(k.jenis)).reduce((s, k) => s + k.pagu, 0);

  return Array.from({ length: Math.max(0, bulanSampai) }, (_, i) => {
    const bulan = i + 1;
    const bulanIni = laporan.filter(
      (l) => ids.has(l.kegiatanId) && l.periodeTahun === tahun && l.periodeBulan === bulan,
    );
    const apbn_real = bulanIni
      .filter((l) => adalahApbn(jenisPerId.get(l.kegiatanId) ?? null))
      .reduce((s, l) => s + Number(l.realIni), 0);
    const non_real = bulanIni
      .filter((l) => !adalahApbn(jenisPerId.get(l.kegiatanId) ?? null))
      .reduce((s, l) => s + Number(l.realIni), 0);
    return {
      name: NAMA_BULAN_SINGKAT[i],
      apbn_real,
      non_real,
      apbn_pct: paguApbn > 0 ? (apbn_real / paguApbn) * 100 : 0,
      non_pct: paguNon > 0 ? (non_real / paguNon) * 100 : 0,
    };
  });
}

export type LinePoint = {
  name: string;
  target: number;
  nilaiRealisasi: number | undefined;
};

// Kurva-S: realisasi kumulatif (%) terhadap total pagu tahun itu, sampai `bulanSampai`;
// bulan sesudahnya kosong. Target linear 1/12 per bulan (asumsi, belum ada rencana
// pencairan resmi di schema).
export function bangunLineData(
  kegiatan: KegiatanGrafik[],
  laporan: LaporanGrafik[],
  tahun: number,
  bulanSampai: number,
): LinePoint[] {
  const ids = new Set(kegiatan.map((k) => k.id));
  const totalPagu = kegiatan.reduce((s, k) => s + k.pagu, 0);
  let kumulatif = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const bulan = i + 1;
    const target = Number(((bulan / 12) * 100).toFixed(1));
    if (bulan > bulanSampai) {
      return { name: NAMA_BULAN_SINGKAT[i], target, nilaiRealisasi: undefined };
    }
    kumulatif += laporan
      .filter((l) => ids.has(l.kegiatanId) && l.periodeTahun === tahun && l.periodeBulan === bulan)
      .reduce((s, l) => s + Number(l.realIni), 0);
    return {
      name: NAMA_BULAN_SINGKAT[i],
      target,
      nilaiRealisasi: totalPagu > 0 ? Number(((kumulatif / totalPagu) * 100).toFixed(1)) : 0,
    };
  });
}
