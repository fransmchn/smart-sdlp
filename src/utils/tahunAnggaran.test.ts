import assert from "node:assert/strict";
import {
  bisaUbahTahunAnggaran,
  buatOpsiPeriode,
  daftarTahunAnggaran,
  getWibYearMonth,
  isPeriodeDalamTahunAnggaran,
  isPeriodeSudahBerjalan,
  isTahunAnggaranValid,
  pesanDiluarTahunAnggaran,
  pesanPeriodeBelumBerjalan,
  pesanTahunAnggaranBelumDimulai,
  pesanTahunAnggaranTidakBisaDiubah,
} from "./tahunAnggaran";

// --- validasi tahun ---
assert.equal(isTahunAnggaranValid(2026), true);
assert.equal(isTahunAnggaranValid(2020), true);
assert.equal(isTahunAnggaranValid(2100), true);
assert.equal(isTahunAnggaranValid(2019), false);
assert.equal(isTahunAnggaranValid(2101), false);
assert.equal(isTahunAnggaranValid(2026.5), false);
assert.equal(isTahunAnggaranValid(Number.NaN), false);

// --- periode harus sama dengan TA ---
assert.equal(isPeriodeDalamTahunAnggaran(2026, 2026), true);
assert.equal(isPeriodeDalamTahunAnggaran(2027, 2026), false);
assert.equal(isPeriodeDalamTahunAnggaran(2025, 2026), false);
assert.match(pesanDiluarTahunAnggaran(2026), /2026/);

// --- tahun/bulan WIB: 31 Des 2026 18:00 UTC sudah 1 Jan 2027 01:00 WIB ---
assert.deepEqual(getWibYearMonth(Date.UTC(2026, 11, 31, 18, 0)), { tahun: 2027, bulan: 1 });
assert.deepEqual(getWibYearMonth(Date.UTC(2026, 11, 31, 16, 59)), { tahun: 2026, bulan: 12 });
assert.deepEqual(getWibYearMonth(Date.UTC(2026, 9, 28, 3, 0)), { tahun: 2026, bulan: 10 });

// --- periode sudah berjalan (28 Okt 2026 WIB) ---
const sekarangOkt = Date.UTC(2026, 9, 28, 3, 0);
assert.equal(isPeriodeSudahBerjalan(sekarangOkt, 10, 2026), true); // bulan berjalan boleh
assert.equal(isPeriodeSudahBerjalan(sekarangOkt, 1, 2026), true);
assert.equal(isPeriodeSudahBerjalan(sekarangOkt, 12, 2025), true);
assert.equal(isPeriodeSudahBerjalan(sekarangOkt, 11, 2026), false); // bulan depan belum
assert.equal(isPeriodeSudahBerjalan(sekarangOkt, 1, 2027), false);
// batas bulan mengikuti WIB: 31 Okt 2026 17:00 UTC = 1 Nov 2026 00:00 WIB
assert.equal(isPeriodeSudahBerjalan(Date.UTC(2026, 9, 31, 16, 59), 11, 2026), false);
assert.equal(isPeriodeSudahBerjalan(Date.UTC(2026, 9, 31, 17, 0), 11, 2026), true);
assert.match(pesanPeriodeBelumBerjalan(1, 2027), /Januari 2027 belum berjalan/);

// --- opsi periode ---
const okt2026 = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026 WIB

// TA tahun ini: Oktober s.d. Januari (terbaru dulu), hanya 2026.
const sekarang = buatOpsiPeriode(okt2026, 2026);
assert.equal(sekarang.length, 10);
assert.deepEqual(sekarang[0], { label: "Oktober 2026", bulan: 10, tahun: 2026 });
assert.deepEqual(sekarang[9], { label: "Januari 2026", bulan: 1, tahun: 2026 });
assert.ok(sekarang.every((o) => o.tahun === 2026));

// TA tahun lalu: seluruh 12 bulan TA tersebut (bukan bulan berjalan).
const lalu = buatOpsiPeriode(okt2026, 2025);
assert.equal(lalu.length, 12);
assert.deepEqual(lalu[0], { label: "Desember 2025", bulan: 12, tahun: 2025 });
assert.deepEqual(lalu[11], { label: "Januari 2025", bulan: 1, tahun: 2025 });

// TA tahun depan: belum ada periode.
assert.deepEqual(buatOpsiPeriode(okt2026, 2027), []);
assert.match(pesanTahunAnggaranBelumDimulai(2027), /2027.*Januari 2027/);

// Pergantian tahun menurut WIB: setelah 1 Jan 2027 WIB, TA 2026 jadi 12 bulan penuh,
// TA 2027 baru punya Januari.
const jan2027 = Date.UTC(2026, 11, 31, 18, 0);
assert.equal(buatOpsiPeriode(jan2027, 2026).length, 12);
assert.deepEqual(buatOpsiPeriode(jan2027, 2027), [
  { label: "Januari 2027", bulan: 1, tahun: 2027 },
]);

// Konsistensi UI dan server: semua opsi yang ditawarkan lolos isPeriodeSudahBerjalan.
for (const ta of [2024, 2025, 2026, 2027]) {
  for (const now of [okt2026, jan2027]) {
    for (const o of buatOpsiPeriode(now, ta)) {
      assert.equal(isPeriodeSudahBerjalan(now, o.bulan, o.tahun), true);
    }
  }
}

// --- mengubah TA ---
assert.equal(bisaUbahTahunAnggaran(2027, []), true); // belum ada laporan
assert.equal(bisaUbahTahunAnggaran(2026, [2026, 2026]), true); // semua sudah di TA baru
assert.equal(bisaUbahTahunAnggaran(2027, [2026]), false);
assert.equal(bisaUbahTahunAnggaran(2027, [2026, 2027]), false);
assert.match(pesanTahunAnggaranTidakBisaDiubah(2027, [2026, 2025, 2026]), /2025, 2026/);

// --- pilihan tahun di form admin ---
assert.deepEqual(daftarTahunAnggaran(2026), [2024, 2025, 2026, 2027, 2028]);
assert.deepEqual(daftarTahunAnggaran(2026, 2027), [2024, 2025, 2026, 2027, 2028]); // sudah termasuk
assert.deepEqual(daftarTahunAnggaran(2026, 2031), [2024, 2025, 2026, 2027, 2028, 2031]); // tahun lama/jauh tetap ada
assert.deepEqual(daftarTahunAnggaran(2026, 1999), [2024, 2025, 2026, 2027, 2028]); // tidak valid diabaikan
assert.deepEqual(daftarTahunAnggaran(2021), [2020, 2021, 2022, 2023]); // dibatasi rentang valid

console.log("tahunAnggaran checks passed");
