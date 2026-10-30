import assert from "node:assert/strict";
import { bangunRekapTahunan, formatJuta, type KegiatanRekap } from "./rekapTahunan";

const okt2026 = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026 WIB
const juta = (n: number) => n * 1_000_000;
// Batas waktu tanggal 25: bulan sampai Oktober sudah lewat (hari ini 28 Okt).
const lewat = (bulan: number, tahun: number) => tahun < 2026 || (tahun === 2026 && bulan <= 10);

const kegiatan: KegiatanRekap[] = [
  { id: "a", kode: "A", nama: "Bloody Moody", jenis: "APBN", pagu: juta(1200), wajib: true, diblokir: false },
  { id: "b", kode: "B", nama: "Benih", jenis: "NON_APBN", pagu: juta(800), wajib: true, diblokir: false },
  { id: "c", kode: "C", nama: "Pelatihan", jenis: "APBN", pagu: juta(500), wajib: true, diblokir: true },
  { id: "d", kode: "D", nama: "Alat", jenis: "APBN", pagu: juta(600), wajib: true, diblokir: false },
];
const lap = (kegiatanId: string, bulan: number, realIni: number) => ({ kegiatanId, periodeBulan: bulan, periodeTahun: 2026, realIni: juta(realIni) });
const laporan = [
  ...[80, 90, 100, 110, 100, 95, 120, 105, 110].map((v, i) => lap("a", i + 1, v)), // Jan-Sep, Okt belum
  ...[50, 60, 70, 60, 80, 70, 60, 90, 70, 80].map((v, i) => lap("b", i + 1, v)),   // Jan-Okt lengkap
  ...[30, 40, 40, 50, 40, 50].map((v, i) => lap("c", i + 1, v)),                    // Jan-Jun, lalu diblokir
  ...[40, 50, 50, 40, 60, 50, 40].map((v, i) => lap("d", i + 1, v)),                // Jan-Jul, Agu-Okt belum
];

const r = bangunRekapTahunan({ kegiatan, laporan, tahun: 2026, bulanAcuan: 10, nowMs: okt2026, deadlineLewat: lewat });
const [a, b, c, d] = r.baris;
const ringkas = (x: typeof a) => x.sel.map((s) => ({ sudah: "s", belum: x.sel && s.terlambat ? "T" : "b", diblokir: "x", "tidak-wajib": "-", "belum-berjalan": "." })[s.status]).join("");

// pola sel sesuai mockup yang disetujui
assert.equal(ringkas(a), "sssssssssT..");
assert.equal(ringkas(b), "ssssssssss..");
assert.equal(ringkas(c), "ssssssxxxx..");
assert.equal(ringkas(d), "sssssssTTT..");

// kewajiban: bulan diblokir (c) tidak dihitung; bulan belum berjalan tidak dihitung
assert.deepEqual([a.kewajiban, a.terpenuhi, a.terlambat], [10, 9, 1]);
assert.deepEqual([b.kewajiban, b.terpenuhi, b.terlambat], [10, 10, 0]);
assert.deepEqual([c.kewajiban, c.terpenuhi, c.terlambat], [6, 6, 0]); // "6 dari 6", bukan "6 dari 10"
assert.deepEqual([d.kewajiban, d.terpenuhi, d.terlambat], [10, 7, 3]);

// ringkasan = angka pada mockup
assert.equal(r.ringkasan.pagu, juta(3100));
assert.equal(r.ringkasan.realisasi, juta(2180));
assert.equal(Math.round(r.ringkasan.serapan * 10) / 10, 70.3);
assert.equal(r.ringkasan.sisa, juta(920));
assert.deepEqual([r.ringkasan.kewajiban, r.ringkasan.terpenuhi, r.ringkasan.terlambat], [36, 32, 4]);
assert.equal(Math.round((r.ringkasan.persenKepatuhan ?? 0) * 10) / 10, 88.9);

// per baris dan total per bulan
assert.equal(Math.round(a.serapan * 10) / 10, 75.8);
assert.equal(c.realisasi, juta(250));
assert.equal(r.totalPerBulan[0], juta(80 + 50 + 30 + 40));
assert.equal(r.totalPerBulan[10], 0); // November belum berjalan
assert.equal(r.totalPerBulan.reduce((x, y) => x + y, 0), juta(2180)); // total matriks = realisasi

// posisi per bulan: bulan sesudah acuan menjadi 'belum-berjalan', angka ikut menyusut
const mei = bangunRekapTahunan({ kegiatan, laporan, tahun: 2026, bulanAcuan: 5, nowMs: okt2026, deadlineLewat: lewat });
assert.equal(mei.baris[0].sel[5].status, "belum-berjalan");
assert.equal(mei.baris[0].sel[5].realisasi, null); // laporan Juni ada, tetapi di luar posisi
assert.equal(mei.ringkasan.realisasi, juta(80 + 90 + 100 + 110 + 100 + 50 + 60 + 70 + 60 + 80 + 30 + 40 + 40 + 50 + 40 + 40 + 50 + 50 + 40 + 60));
assert.deepEqual([mei.ringkasan.kewajiban, mei.ringkasan.terpenuhi], [20, 20]);
assert.equal(mei.ringkasan.terlambat, 0);

// bulan acuan tidak boleh melewati bulan yang benar-benar sudah berjalan
const lewatAcuan = bangunRekapTahunan({ kegiatan, laporan, tahun: 2026, bulanAcuan: 12, nowMs: okt2026, deadlineLewat: lewat });
assert.equal(lewatAcuan.baris[1].sel[10].status, "belum-berjalan"); // November belum tiba
assert.equal(lewatAcuan.ringkasan.kewajiban, 36);

// tahun belum dimulai: semua sel belum berjalan, tanpa kewajiban
const depan = bangunRekapTahunan({ kegiatan, laporan: [], tahun: 2027, bulanAcuan: 0, nowMs: okt2026, deadlineLewat: lewat });
assert.ok(depan.baris.every((x) => x.sel.every((s) => s.status === "belum-berjalan")));
assert.deepEqual([depan.ringkasan.kewajiban, depan.ringkasan.persenKepatuhan, depan.ringkasan.realisasi], [0, null, 0]);

// tahun lampau: 12 bulan penuh
const lampau = bangunRekapTahunan({
  kegiatan: [kegiatan[0]], laporan: [{ kegiatanId: "a", periodeBulan: 5, periodeTahun: 2024, realIni: juta(10) }],
  tahun: 2024, bulanAcuan: 12, nowMs: okt2026, deadlineLewat: lewat,
});
assert.equal(lampau.baris[0].kewajiban, 12);
assert.equal(lampau.baris[0].terpenuhi, 1);
assert.equal(lampau.baris[0].terlambat, 11);

// belum lapor tetapi batas waktu belum lewat: 'belum' namun bukan 'terlambat'
const belumJatuhTempo = bangunRekapTahunan({ kegiatan: [kegiatan[0]], laporan: [], tahun: 2026, bulanAcuan: 10, nowMs: okt2026, deadlineLewat: (bulan) => bulan < 10 });
assert.equal(belumJatuhTempo.baris[0].sel[9].status, "belum");
assert.equal(belumJatuhTempo.baris[0].sel[9].terlambat, false);
assert.equal(belumJatuhTempo.baris[0].kewajiban, 10);
assert.equal(belumJatuhTempo.baris[0].terlambat, 9);

// tidak wajib lapor: tanpa laporan netral; dengan laporan tampil sudah, tetapi tidak dihitung kewajiban
const tidakWajib = bangunRekapTahunan({
  kegiatan: [{ ...kegiatan[0], wajib: false }], laporan: [lap("a", 1, 10)], tahun: 2026, bulanAcuan: 3, nowMs: okt2026, deadlineLewat: lewat,
});
assert.equal(tidakWajib.baris[0].sel[0].status, "sudah");
assert.equal(tidakWajib.baris[0].sel[1].status, "tidak-wajib");
assert.deepEqual([tidakWajib.baris[0].kewajiban, tidakWajib.ringkasan.persenKepatuhan], [0, null]);

// laporan tahun lain diabaikan; laporan ganda pada bulan yang sama dijumlahkan
const ganda = bangunRekapTahunan({
  kegiatan: [kegiatan[0]],
  laporan: [lap("a", 1, 10), lap("a", 1, 5), { kegiatanId: "a", periodeBulan: 1, periodeTahun: 2025, realIni: juta(999) }],
  tahun: 2026, bulanAcuan: 1, nowMs: okt2026, deadlineLewat: lewat,
});
assert.equal(ganda.baris[0].sel[0].realisasi, juta(15));

// pagu 0 -> serapan 0, bukan NaN
const nol = bangunRekapTahunan({ kegiatan: [{ ...kegiatan[0], pagu: 0 }], laporan: [], tahun: 2026, bulanAcuan: 1, nowMs: okt2026, deadlineLewat: lewat });
assert.equal(nol.baris[0].serapan, 0);
assert.equal(nol.ringkasan.serapan, 0);

// --- formatJuta ---
assert.equal(formatJuta(0), "0");
assert.equal(formatJuta(juta(80)), "80");
assert.equal(formatJuta(juta(80.04)), "80");
assert.equal(formatJuta(juta(12.5)), "12,5");
assert.equal(formatJuta(juta(1200)), "1200");
assert.equal(formatJuta(juta(100)), "100");
assert.equal(formatJuta(250_000), "0,3");
assert.equal(formatJuta(10_000), "<0,1");
assert.equal(formatJuta(juta(5.55)), "5,6");

console.log("rekapTahunan checks passed");
