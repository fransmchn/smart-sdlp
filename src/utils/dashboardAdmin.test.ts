import assert from "node:assert/strict";
import {
  bangunBarData,
  bangunLineData,
  hitungKepatuhan,
  opsiBulanDashboard,
  statusKepatuhan,
  tentukanPeriodeDashboard,
} from "./dashboardAdmin";

const okt2026 = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026 WIB

// --- tentukanPeriodeDashboard ---
assert.deepEqual(tentukanPeriodeDashboard(undefined, undefined, okt2026), { tahun: 2026, bulan: 10, bulanTerbaru: 10, belumDimulai: false });
assert.deepEqual(tentukanPeriodeDashboard("2026", "5", okt2026), { tahun: 2026, bulan: 5, bulanTerbaru: 10, belumDimulai: false });
// bulan melewati bulan berjalan dibatasi, bukan ditolak
assert.equal(tentukanPeriodeDashboard("2026", "12", okt2026).bulan, 10);
// tahun lampau: bawaan Desember, bulan bebas 1..12
assert.deepEqual(tentukanPeriodeDashboard("2024", undefined, okt2026), { tahun: 2024, bulan: 12, bulanTerbaru: 12, belumDimulai: false });
assert.equal(tentukanPeriodeDashboard("2024", "5", okt2026).bulan, 5);
// tahun depan: belum dimulai
assert.deepEqual(tentukanPeriodeDashboard("2027", "5", okt2026), { tahun: 2027, bulan: 1, bulanTerbaru: null, belumDimulai: true });
// parameter rusak -> bawaan
assert.deepEqual(tentukanPeriodeDashboard("abc", "xx", okt2026), { tahun: 2026, bulan: 10, bulanTerbaru: 10, belumDimulai: false });
assert.equal(tentukanPeriodeDashboard("1800", undefined, okt2026).tahun, 2026);
assert.equal(tentukanPeriodeDashboard("2024", "0", okt2026).bulan, 12);
assert.equal(tentukanPeriodeDashboard("2024", "13", okt2026).bulan, 12);
// batas tahun mengikuti WIB: 31 Des 2026 18:00 UTC = 1 Jan 2027 01:00 WIB
assert.deepEqual(tentukanPeriodeDashboard(undefined, undefined, Date.UTC(2026, 11, 31, 18, 0)), { tahun: 2027, bulan: 1, bulanTerbaru: 1, belumDimulai: false });

// --- opsiBulanDashboard ---
const opsi26 = opsiBulanDashboard(2026, okt2026);
assert.equal(opsi26.length, 10);
assert.deepEqual(opsi26[0], { value: "1", label: "Januari" });
assert.deepEqual(opsi26[9], { value: "10", label: "Oktober" });
assert.equal(opsiBulanDashboard(2024, okt2026).length, 12);
assert.deepEqual(opsiBulanDashboard(2027, okt2026), []);

// --- statusKepatuhan ---
const p = { bulan: 10, tahun: 2026 };
assert.equal(statusKepatuhan({ diblokir: false, sudahLapor: true, periode: p, nowMs: okt2026 }), "sudah");
assert.equal(statusKepatuhan({ diblokir: false, sudahLapor: false, periode: p, nowMs: okt2026 }), "belum");
assert.equal(statusKepatuhan({ diblokir: true, sudahLapor: false, periode: p, nowMs: okt2026 }), "diblokir");
assert.equal(statusKepatuhan({ diblokir: true, sudahLapor: true, periode: p, nowMs: okt2026 }), "sudah"); // sudah lapor sebelum diblokir tetap dihitung sudah
assert.equal(statusKepatuhan({ diblokir: true, sudahLapor: true, periode: { bulan: 1, tahun: 2027 }, nowMs: okt2026 }), "belum-berjalan");
assert.equal(statusKepatuhan({ diblokir: false, sudahLapor: false, periode: { bulan: 1, tahun: 2027 }, nowMs: okt2026 }), "belum-berjalan");

// --- hitungKepatuhan: hanya wajib dan (sudah|belum) ---
assert.deepEqual(
  hitungKepatuhan([
    { wajib: true, kepatuhan: "sudah" },
    { wajib: true, kepatuhan: "belum" },
    { wajib: true, kepatuhan: "diblokir" },        // tidak dihitung
    { wajib: true, kepatuhan: "belum-berjalan" },  // tidak dihitung
    { wajib: false, kepatuhan: "belum" },          // tidak wajib
    { wajib: false, kepatuhan: "sudah" },
  ]),
  { totalWajib: 2, sudah: 1, belum: 1 },
);
assert.deepEqual(hitungKepatuhan([]), { totalWajib: 0, sudah: 0, belum: 0 });

// --- grafik: hanya kegiatan yang diberikan, hanya tahun itu ---
const kegiatan = [
  { id: "a", jenis: "APBN", pagu: 1000 },
  { id: "b", jenis: "NON_APBN", pagu: 500 },
];
const laporan = [
  { kegiatanId: "a", periodeBulan: 1, periodeTahun: 2026, realIni: 100 },
  { kegiatanId: "a", periodeBulan: 2, periodeTahun: 2026, realIni: 200 },
  { kegiatanId: "b", periodeBulan: 2, periodeTahun: 2026, realIni: 50 },
  { kegiatanId: "a", periodeBulan: 2, periodeTahun: 2025, realIni: 9999 }, // tahun lain: diabaikan
  { kegiatanId: "x", periodeBulan: 2, periodeTahun: 2026, realIni: 9999 }, // kegiatan di luar daftar: diabaikan
];
const bar = bangunBarData(kegiatan, laporan, 2026, 2);
assert.equal(bar.length, 2);
assert.deepEqual(bar[0], { name: "Jan", apbn_real: 100, non_real: 0, apbn_pct: 10, non_pct: 0 });
assert.deepEqual(bar[1], { name: "Feb", apbn_real: 200, non_real: 50, apbn_pct: 20, non_pct: 10 });
assert.deepEqual(bangunBarData(kegiatan, laporan, 2026, 0), []);
assert.deepEqual(bangunBarData([], laporan, 2026, 2).map((b) => b.apbn_pct), [0, 0]); // pagu 0 -> 0%, bukan NaN

const line = bangunLineData(kegiatan, laporan, 2026, 2);
assert.equal(line.length, 12);
assert.deepEqual(line[0], { name: "Jan", target: 8.3, nilaiRealisasi: 6.7 }); // 100/1500
assert.deepEqual(line[1], { name: "Feb", target: 16.7, nilaiRealisasi: 23.3 }); // (100+200+50)/1500
assert.equal(line[2].nilaiRealisasi, undefined); // sesudah bulan acuan kosong
assert.equal(line[11].target, 100);
assert.equal(bangunLineData([], laporan, 2026, 3)[0].nilaiRealisasi, 0);

console.log("dashboardAdmin checks passed");
