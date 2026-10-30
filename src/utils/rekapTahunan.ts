import { isPeriodeSudahBerjalan } from "./tahunAnggaran";

// Rekap tahunan dashboard admin: matriks kegiatan x 12 bulan untuk SATU tahun
// anggaran, dihitung "per bulan acuan" (bulan sesudahnya dianggap belum berjalan).

export type StatusSel =
  | "sudah" // ada laporan pada bulan itu
  | "belum" // kewajiban belum dipenuhi
  | "diblokir" // kegiatan diblokir dan tidak ada laporan: bukan kewajiban
  | "tidak-wajib" // kegiatan tidak ditetapkan wajib lapor dan tidak ada laporan
  | "belum-berjalan"; // bulan sesudah bulan acuan

export type SelRekap = {
  bulan: number;
  status: StatusSel;
  // Hanya bermakna untuk status "belum": batas waktu bulan itu sudah lewat.
  terlambat: boolean;
  // Realisasi bulan itu (rupiah); null bila tidak ada laporan.
  realisasi: number | null;
};

export type KegiatanRekap = {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  pagu: number;
  wajib: boolean;
  diblokir: boolean;
};

export type LaporanRekap = {
  kegiatanId: string;
  periodeBulan: number;
  periodeTahun: number;
  realIni: number;
};

export type BarisRekap = KegiatanRekap & {
  sel: SelRekap[];
  // Kewajiban bulanan (kegiatan wajib x bulan yang berjalan, tanpa bulan diblokir/tanpa laporan).
  kewajiban: number;
  terpenuhi: number;
  terlambat: number;
  realisasi: number;
  serapan: number;
};

export type RingkasanRekap = {
  pagu: number;
  realisasi: number;
  serapan: number;
  sisa: number;
  kewajiban: number;
  terpenuhi: number;
  // null bila belum ada kewajiban sama sekali.
  persenKepatuhan: number | null;
  terlambat: number;
};

export type RekapTahunan = {
  baris: BarisRekap[];
  ringkasan: RingkasanRekap;
  // Total realisasi per bulan (indeks 0 = Januari), 0 untuk bulan di luar posisi.
  totalPerBulan: number[];
};

export function bangunRekapTahunan(input: {
  kegiatan: KegiatanRekap[];
  laporan: LaporanRekap[];
  tahun: number;
  // Posisi per bulan ini (1..12). 0 = tahun belum dimulai (semua sel belum berjalan).
  bulanAcuan: number;
  nowMs: number;
  // Apakah batas waktu lapor untuk bulan itu sudah lewat.
  deadlineLewat: (bulan: number, tahun: number) => boolean;
}): RekapTahunan {
  const { kegiatan, laporan, tahun, bulanAcuan, nowMs, deadlineLewat } = input;

  // Total realisasi per (kegiatan, bulan) pada tahun itu.
  const realisasiSel = new Map<string, number>();
  for (const l of laporan) {
    if (l.periodeTahun !== tahun) continue;
    const kunci = `${l.kegiatanId}:${l.periodeBulan}`;
    realisasiSel.set(kunci, (realisasiSel.get(kunci) ?? 0) + Number(l.realIni));
  }

  const totalPerBulan = new Array<number>(12).fill(0);

  const baris: BarisRekap[] = kegiatan.map((k) => {
    let kewajiban = 0;
    let terpenuhi = 0;
    let terlambat = 0;
    let realisasi = 0;

    const sel: SelRekap[] = Array.from({ length: 12 }, (_, i) => {
      const bulan = i + 1;
      const berjalan =
        bulan <= bulanAcuan && isPeriodeSudahBerjalan(nowMs, bulan, tahun);
      if (!berjalan) {
        return { bulan, status: "belum-berjalan", terlambat: false, realisasi: null };
      }

      const nilai = realisasiSel.get(`${k.id}:${bulan}`);
      if (nilai !== undefined) {
        realisasi += nilai;
        totalPerBulan[i] += nilai;
        if (k.wajib) {
          kewajiban++;
          terpenuhi++;
        }
        return { bulan, status: "sudah", terlambat: false, realisasi: nilai };
      }
      if (k.diblokir) {
        return { bulan, status: "diblokir", terlambat: false, realisasi: null };
      }
      if (!k.wajib) {
        return { bulan, status: "tidak-wajib", terlambat: false, realisasi: null };
      }
      kewajiban++;
      const lewat = deadlineLewat(bulan, tahun);
      if (lewat) terlambat++;
      return { bulan, status: "belum", terlambat: lewat, realisasi: null };
    });

    return {
      ...k,
      sel,
      kewajiban,
      terpenuhi,
      terlambat,
      realisasi,
      serapan: k.pagu > 0 ? (realisasi / k.pagu) * 100 : 0,
    };
  });

  const pagu = baris.reduce((s, b) => s + b.pagu, 0);
  const realisasi = baris.reduce((s, b) => s + b.realisasi, 0);
  const kewajiban = baris.reduce((s, b) => s + b.kewajiban, 0);
  const terpenuhi = baris.reduce((s, b) => s + b.terpenuhi, 0);

  return {
    baris,
    totalPerBulan,
    ringkasan: {
      pagu,
      realisasi,
      serapan: pagu > 0 ? (realisasi / pagu) * 100 : 0,
      sisa: pagu - realisasi,
      kewajiban,
      terpenuhi,
      persenKepatuhan: kewajiban > 0 ? (terpenuhi / kewajiban) * 100 : null,
      terlambat: baris.reduce((s, b) => s + b.terlambat, 0),
    },
  };
}

// Rupiah -> "juta" untuk sel matriks: bilangan bulat bila >= 100 juta atau bila
// hasil pembulatannya bulat, selain itu satu desimal (koma), dan "<0,1" untuk
// nilai positif yang sangat kecil.
export function formatJuta(rupiah: number): string {
  const juta = rupiah / 1_000_000;
  if (juta === 0) return "0";
  if (Math.abs(juta) >= 100) return String(Math.round(juta));
  if (Math.abs(juta) < 0.05) return "<0,1";
  const bulat1 = Math.round(juta * 10) / 10;
  return Number.isInteger(bulat1) ? String(bulat1) : bulat1.toFixed(1).replace(".", ",");
}
