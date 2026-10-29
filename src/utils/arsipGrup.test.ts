import assert from "node:assert/strict";
import {
  hitungRingkasan,
  kelompokkanPerKegiatan,
  urutkanPeriodeTerbaruDulu,
  type GrupRow,
} from "./arsipGrup";

const baris = (o: Partial<GrupRow> & { kegiatanId: string; kode: string }): GrupRow => ({
  nama: `Kegiatan ${o.kode}`, jenis: "APBN", pjNama: "PJ", pjEmail: "pj@x.id",
  status: "BELUM_UPLOAD", periodeBulan: 1, periodeTahun: 2024, ...o,
});

// --- hitungRingkasan ---
assert.deepEqual(hitungRingkasan([]), { total: 0, sudah: 0, belum: 0, terlambat: 0 });
assert.deepEqual(
  hitungRingkasan([
    baris({ kegiatanId: "a", kode: "A", status: "SUDAH_UPLOAD" }),
    baris({ kegiatanId: "a", kode: "A", status: "BELUM_UPLOAD", deadlinePassed: true }), // terlambat
    baris({ kegiatanId: "a", kode: "A", status: "BELUM_UPLOAD", deadlinePassed: false }), // belum jatuh tempo
    baris({ kegiatanId: "a", kode: "A", status: "BELUM_UPLOAD", deadlinePassed: true, kegiatanDiblokir: true }), // diblokir bukan terlambat
  ]),
  { total: 4, sudah: 1, belum: 3, terlambat: 1 },
);

// --- urutan periode: terbaru dulu, lintas tahun ---
const urut = urutkanPeriodeTerbaruDulu([
  baris({ kegiatanId: "a", kode: "A", periodeBulan: 3, periodeTahun: 2024 }),
  baris({ kegiatanId: "a", kode: "A", periodeBulan: 12, periodeTahun: 2023 }),
  baris({ kegiatanId: "a", kode: "A", periodeBulan: 11, periodeTahun: 2024 }),
]);
assert.deepEqual(urut.map((r) => `${r.periodeBulan}/${r.periodeTahun}`), ["11/2024", "3/2024", "12/2023"]);

// --- kelompokkanPerKegiatan ---
const semua: GrupRow[] = [
  baris({ kegiatanId: "b", kode: "B.002", periodeBulan: 1, status: "SUDAH_UPLOAD" }),
  baris({ kegiatanId: "b", kode: "B.002", periodeBulan: 2, status: "BELUM_UPLOAD", deadlinePassed: true }),
  baris({ kegiatanId: "b", kode: "B.002", periodeBulan: 3, status: "BELUM_UPLOAD", deadlinePassed: true }),
  baris({ kegiatanId: "a", kode: "A.001", periodeBulan: 1, status: "SUDAH_UPLOAD" }),
  baris({ kegiatanId: "a", kode: "A.001", periodeBulan: 2, status: "SUDAH_UPLOAD" }),
  baris({ kegiatanId: "c", kode: "C.003", periodeBulan: 1, status: "BELUM_UPLOAD", deadlinePassed: true, kegiatanDiblokir: true }),
];
const grup = kelompokkanPerKegiatan(semua, semua);
assert.deepEqual(grup.map((g) => g.kode), ["A.001", "B.002", "C.003"]); // urut kode
assert.equal(grup.length, 3);
const a = grup[0], b = grup[1], c = grup[2];
assert.deepEqual(a.ringkasan, { total: 2, sudah: 2, belum: 0, terlambat: 0 }); // lengkap
assert.deepEqual(b.ringkasan, { total: 3, sudah: 1, belum: 2, terlambat: 2 });
assert.deepEqual(b.rows.map((r) => r.periodeBulan), [3, 2, 1]); // baris: periode terbaru dulu
assert.equal(c.diblokir, true);
assert.equal(c.ringkasan.terlambat, 0); // diblokir tidak dihitung terlambat
assert.equal(a.diblokir, false);

// Filter status mengubah baris yang terlihat, tetapi TIDAK mengubah ringkasan kegiatan.
const hanyaBelum = semua.filter((r) => r.status === "BELUM_UPLOAD");
const grupBelum = kelompokkanPerKegiatan(hanyaBelum, semua);
assert.deepEqual(grupBelum.map((g) => g.kode), ["B.002", "C.003"]); // A (lengkap) tidak tampil
const bBelum = grupBelum[0];
assert.equal(bBelum.rows.length, 2);
assert.deepEqual(bBelum.ringkasan, { total: 3, sudah: 1, belum: 2, terlambat: 2 }); // ringkasan tetap utuh

// Tidak ada baris = tidak ada kelompok.
assert.deepEqual(kelompokkanPerKegiatan([], semua), []);
// Tanpa ringkasan terpisah, ringkasan dihitung dari baris yang ada.
assert.deepEqual(kelompokkanPerKegiatan([semua[0]], [])[0].ringkasan, { total: 1, sudah: 1, belum: 0, terlambat: 0 });

console.log("arsipGrup checks passed");
