import assert from "node:assert/strict";
import {
  buildLaporanSnapshot,
  formatRupiahDariTeks,
  parseLaporanSnapshot,
} from "./laporanSnapshot";

const snapshot = buildLaporanSnapshot(
  {
    id: "lap-1",
    kegiatanId: "keg-1",
    periodeBulan: 9,
    periodeTahun: 2026,
    uraian: "Pembangunan tahap 1",
    fisik: 20,
    statusAnggaran: "DIBUKA",
    realLalu: BigInt(10_000_000),
    realIni: BigInt(25_000_000),
    realisasi: BigInt(35_000_000),
    submittedById: "pj-1",
    createdAt: new Date("2026-10-17T08:05:00.000Z"),
    updatedAt: new Date("2026-10-17T09:30:00.000Z"),
  },
  { kode: "7912.SDA.015.051A", nama: "Bangun Rumah Sakit", pagu: BigInt(120_000_000) },
);

// Nilai uang disimpan sebagai teks supaya aman menjadi JSON (BigInt tidak bisa).
assert.equal(snapshot.realIni, "25000000");
assert.equal(snapshot.paguKegiatan, "120000000");
assert.equal(snapshot.dibuatPada, "2026-10-17T08:05:00.000Z");
const json = JSON.stringify(snapshot);
assert.deepEqual(parseLaporanSnapshot(JSON.parse(json)), snapshot);

// Bentuk yang tidak dikenali ditolak, bukan dianggap salinan yang valid.
assert.equal(parseLaporanSnapshot(null), null);
assert.equal(parseLaporanSnapshot("teks"), null);
assert.equal(parseLaporanSnapshot([]), null);
assert.equal(parseLaporanSnapshot({}), null);
assert.equal(parseLaporanSnapshot({ ...snapshot, versi: 2 }), null);
assert.equal(parseLaporanSnapshot({ ...snapshot, realIni: "abc" }), null);
assert.equal(parseLaporanSnapshot({ ...snapshot, fisik: "20" }), null);
assert.equal(parseLaporanSnapshot({ ...snapshot, uraian: 5 }), null);

assert.equal(formatRupiahDariTeks("0"), "Rp 0");
assert.equal(formatRupiahDariTeks("999"), "Rp 999");
assert.equal(formatRupiahDariTeks("1000"), "Rp 1.000");
assert.equal(formatRupiahDariTeks("120000000"), "Rp 120.000.000");
assert.equal(formatRupiahDariTeks("9007199254740993"), "Rp 9.007.199.254.740.993");

console.log("laporanSnapshot checks passed");
