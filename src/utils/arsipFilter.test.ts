import assert from "node:assert/strict";
import {
  cocokPencarian,
  daftarTahunFilter,
  hitungPetunjukTahun,
  kegiatanWajibLaporPada,
  opsiBulanFilter,
  parseBulanParam,
  parseTahunScope,
  periodeVirtualUntukScope,
  tahunScopeValue,
} from "./arsipFilter";

const okt2026 = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026 WIB

// --- parseTahunScope ---
assert.deepEqual(parseTahunScope(undefined, 2026), { semua: false, tahun: 2026 });
assert.deepEqual(parseTahunScope("2024", 2026), { semua: false, tahun: 2024 });
assert.deepEqual(parseTahunScope("SEMUA", 2026), { semua: true });
assert.deepEqual(parseTahunScope("abc", 2026), { semua: false, tahun: 2026 });
assert.deepEqual(parseTahunScope("1800", 2026), { semua: false, tahun: 2026 });
assert.equal(tahunScopeValue({ semua: true }), "SEMUA");
assert.equal(tahunScopeValue({ semua: false, tahun: 2024 }), "2024");

// --- parseBulanParam ---
assert.equal(parseBulanParam("5"), 5);
assert.equal(parseBulanParam("12"), 12);
assert.equal(parseBulanParam("05"), 5);
assert.equal(parseBulanParam("0"), null);
assert.equal(parseBulanParam("13"), null);
assert.equal(parseBulanParam("5-2024"), null); // format lama tidak berlaku lagi
assert.equal(parseBulanParam("ALL"), null);
assert.equal(parseBulanParam(""), null);
assert.equal(parseBulanParam(undefined), null);

// --- daftarTahunFilter: unik, valid, terbaru dulu, selalu memuat tahun berjalan ---
assert.deepEqual(daftarTahunFilter([2024, 2026, 2026], [2025], 2026), [2026, 2025, 2024]);
assert.deepEqual(daftarTahunFilter([], [], 2026), [2026]);
assert.deepEqual(daftarTahunFilter([2024], [1999], 2026), [2026, 2024]);

// --- opsiBulanFilter: daftar tetap, maksimal 12, urut Januari dulu ---
const bulan2026 = opsiBulanFilter({ semua: false, tahun: 2026 }, [], okt2026);
assert.equal(bulan2026.length, 10);
assert.deepEqual(bulan2026[0], { value: "1", label: "Januari" });
assert.deepEqual(bulan2026[9], { value: "10", label: "Oktober" });
const bulan2024 = opsiBulanFilter({ semua: false, tahun: 2024 }, [], okt2026);
assert.equal(bulan2024.length, 12);
assert.deepEqual(bulan2024[11], { value: "12", label: "Desember" });
// bulan yang sudah punya laporan tetap muncul walau belum "berjalan" (data lama), hanya di tahunnya
const denganLaporan = opsiBulanFilter(
  { semua: false, tahun: 2026 },
  [{ bulan: 12, tahun: 2026 }, { bulan: 3, tahun: 2024 }],
  okt2026,
);
assert.equal(denganLaporan.length, 11);
assert.equal(denganLaporan[10].value, "12");
// Semua Tahun dan tahun yang belum dimulai: tidak ada pilihan bulan
assert.deepEqual(opsiBulanFilter({ semua: true }, [{ bulan: 5, tahun: 2026 }], okt2026), []);
assert.deepEqual(opsiBulanFilter({ semua: false, tahun: 2027 }, [], okt2026), []);

// --- cocokPencarian ---
assert.equal(cocokPencarian("", "apa saja"), true);
assert.equal(cocokPencarian("tanam", "Gerakan Tanam Serempak"), true);
assert.equal(cocokPencarian("alif", "x", "Alif Rijki"), true);
assert.equal(cocokPencarian("zzz", "a", "b"), false);

// --- hitungPetunjukTahun ---
const kegiatan = [
  { tahunAnggaran: 2024, kode: "B.2024", nama: "Gerakan Tanam", pjNama: "Alif", pjEmail: "alif@x.id" },
  { tahunAnggaran: 2024, kode: "C.2024", nama: "Benih", pjNama: "Sari", pjEmail: "sari@x.id" },
  { tahunAnggaran: 2025, kode: "E.2025", nama: "Pelatihan", pjNama: "Alif", pjEmail: "alif@x.id" },
  { tahunAnggaran: 2026, kode: "A.2026", nama: "Pupuk", pjNama: "Budi", pjEmail: "budi@x.id" },
];
// tahun spesifik: tahun yang sedang dilihat tidak diulang; terbaru dulu
assert.deepEqual(hitungPetunjukTahun(kegiatan, "", { semua: false, tahun: 2026 }), [
  { tahun: 2025, jumlah: 1 },
  { tahun: 2024, jumlah: 2 },
]);
// Semua Tahun: semua tahun dicantumkan
assert.deepEqual(hitungPetunjukTahun(kegiatan, "", { semua: true }).map((p) => p.tahun), [2026, 2025, 2024]);
// dengan pencarian: hanya tahun yang punya kegiatan cocok
assert.deepEqual(hitungPetunjukTahun(kegiatan, "alif", { semua: false, tahun: 2026 }), [
  { tahun: 2025, jumlah: 1 },
  { tahun: 2024, jumlah: 1 },
]);
assert.deepEqual(hitungPetunjukTahun(kegiatan, "b.2024", { semua: false, tahun: 2026 }), [{ tahun: 2024, jumlah: 1 }]);
assert.deepEqual(hitungPetunjukTahun(kegiatan, "tidak ada", { semua: false, tahun: 2026 }), []);
// kegiatan hanya ada di tahun yang sedang dilihat: tidak ada petunjuk
assert.deepEqual(hitungPetunjukTahun([kegiatan[3]], "", { semua: false, tahun: 2026 }), []);

// --- periodeVirtualUntukScope: satu aturan, semua bulan yang sudah berjalan ---
const tahunKeg = [2026, 2024, 2024];
// tahun berjalan: Januari sampai bulan berjalan (bukan hanya bulan berjalan)
const virt2026 = periodeVirtualUntukScope({ semua: false, tahun: 2026 }, okt2026, tahunKeg);
assert.equal(virt2026.length, 10);
assert.deepEqual(virt2026[0], { bulan: 10, tahun: 2026 });
assert.deepEqual(virt2026[9], { bulan: 1, tahun: 2026 });
// tahun lampau: 12 bulan
const virt2024 = periodeVirtualUntukScope({ semua: false, tahun: 2024 }, okt2026, tahunKeg);
assert.equal(virt2024.length, 12);
assert.deepEqual(virt2024[0], { bulan: 12, tahun: 2024 });
assert.deepEqual(virt2024[11], { bulan: 1, tahun: 2024 });
assert.ok(virt2024.every((p) => p.tahun === 2024));
// tahun depan: tidak ada
assert.deepEqual(periodeVirtualUntukScope({ semua: false, tahun: 2027 }, okt2026, tahunKeg), []);
// Semua Tahun: gabungan setiap tahun anggaran kegiatan (2026: 10 bulan + 2024: 12 bulan), tanpa duplikat
const virtSemua = periodeVirtualUntukScope({ semua: true }, okt2026, tahunKeg);
assert.equal(virtSemua.length, 22);
assert.equal(new Set(virtSemua.map((p) => `${p.bulan}-${p.tahun}`)).size, 22);
assert.deepEqual(virtSemua[0], { bulan: 10, tahun: 2026 }); // tahun terbaru dulu
// Semua Tahun tanpa kegiatan: tidak ada baris; tahun kegiatan di masa depan diabaikan
assert.deepEqual(periodeVirtualUntukScope({ semua: true }, okt2026, []), []);
assert.deepEqual(periodeVirtualUntukScope({ semua: true }, okt2026, [2027]), []);
// batas bulan mengikuti WIB, bukan zona server (1 Nov 2026 00:00 WIB = 31 Okt 17:00 UTC)
assert.equal(periodeVirtualUntukScope({ semua: false, tahun: 2026 }, Date.UTC(2026, 9, 31, 16, 59), tahunKeg).length, 10);
assert.equal(periodeVirtualUntukScope({ semua: false, tahun: 2026 }, Date.UTC(2026, 9, 31, 17, 0), tahunKeg).length, 11);
// setelah pergantian tahun WIB, 2026 menjadi tahun lampau dengan 12 bulan penuh
assert.equal(periodeVirtualUntukScope({ semua: false, tahun: 2026 }, Date.UTC(2026, 11, 31, 18, 0), tahunKeg).length, 12);

// --- kegiatanWajibLaporPada ---
assert.equal(kegiatanWajibLaporPada(2026, { bulan: 10, tahun: 2026 }, okt2026), true);
assert.equal(kegiatanWajibLaporPada(2024, { bulan: 10, tahun: 2026 }, okt2026), false);
assert.equal(kegiatanWajibLaporPada(2024, { bulan: 5, tahun: 2024 }, okt2026), true);
assert.equal(kegiatanWajibLaporPada(2026, { bulan: 11, tahun: 2026 }, okt2026), false);
assert.equal(kegiatanWajibLaporPada(2027, { bulan: 1, tahun: 2027 }, okt2026), false);

console.log("arsipFilter checks passed");
