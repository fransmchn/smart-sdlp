import assert from "node:assert/strict";
import { __setMockSessionForTest, getActionSession } from "@/lib/active-session";
import { submitLaporan } from "@/features/laproran/actions";
import { createKegiatan } from "@/features/kegiatan/actions";
import { deleteLaporan } from "@/features/arsip/actions";
import { deleteDokumen } from "@/features/repositori/actions";
import { bukaAksesLapor, cabutAksesLapor } from "@/features/akses-lapor/actions";
import { getMyNotifications, markMyNotificationsRead } from "@/features/notifications/actions";

// Mock helper
function setSession(user: { id: string; name: string; email: string; role: string; mustChangePassword: boolean; isActive: boolean } | null) {
  if (!user) {
    __setMockSessionForTest(null);
  } else {
    __setMockSessionForTest({
      user,
      session: { id: `sess-${user.id}`, userId: user.id },
    });
  }
}

// ==============================================================================
// 1. Uji getActionSession helper langsung
// ==============================================================================
setSession(null);
const nullSession = await getActionSession();
assert.equal(nullSession, null, "getActionSession harus return null saat tidak ada sesi");

setSession({
  id: "u-must-change",
  name: "PJ Must Change",
  email: "pj.change@pertanian.go.id",
  role: "USER",
  mustChangePassword: true,
  isActive: true,
});
await assert.rejects(
  async () => getActionSession(),
  /Wajib ganti kata sandi terlebih dahulu\./,
  "getActionSession harus melempar error saat mustChangePassword true",
);

const allowed = await getActionSession({ allowMustChangePassword: true });
assert.ok(allowed, "getActionSession harus lolos bila opsi allowMustChangePassword true");
assert.equal(allowed.user.id, "u-must-change");

// ==============================================================================
// 2. Uji Laporan: submitLaporan
// ==============================================================================
// Kasus: mustChangePassword true -> ditolak dengan pesan spesifik
setSession({
  id: "pj-1",
  name: "PJ User",
  email: "pj1@pertanian.go.id",
  role: "USER",
  mustChangePassword: true,
  isActive: true,
});
const laporanBlocked = await submitLaporan({
  kegiatanId: "keg-1",
  periodeBulan: 1,
  periodeTahun: 2026,
  uraian: "Realisasi test",
  realIni: 1000000,
});
assert.equal(laporanBlocked.success, false);
assert.equal(laporanBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");

// ==============================================================================
// 3. Uji Kegiatan: createKegiatan
// ==============================================================================
// Kasus 1: Ditolak saat mustChangePassword true (bahkan jika admin)
setSession({
  id: "admin-must-change",
  name: "Admin Baru",
  email: "admin.baru@pertanian.go.id",
  role: "ADMIN",
  mustChangePassword: true,
  isActive: true,
});
const kegiatanBlocked = await createKegiatan({
  kode: "KEG-001",
  nama: "Kegiatan Baru",
  jenis: "APBN",
  programCategoryId: "prog-1",
  pagu: 10000000,
  statusAnggaran: "DIBUKA",
});
assert.equal(kegiatanBlocked.success, false);
assert.equal(kegiatanBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");

// Kasus 2: PJ (role USER) dengan mustChangePassword false tetap ditolak untuk aksi admin
setSession({
  id: "pj-active",
  name: "PJ Aktif",
  email: "pj.aktif@pertanian.go.id",
  role: "USER",
  mustChangePassword: false,
  isActive: true,
});
const kegiatanUserDenied = await createKegiatan({
  kode: "KEG-001",
  nama: "Kegiatan Baru",
  jenis: "APBN",
  programCategoryId: "prog-1",
  pagu: 10000000,
  statusAnggaran: "DIBUKA",
});
assert.equal(kegiatanUserDenied.success, false);
assert.equal(kegiatanUserDenied.error, "Hanya admin yang bisa menambahkan kegiatan.");

// ==============================================================================
// 4. Uji Arsip: deleteLaporan
// ==============================================================================
// Kasus 1: Ditolak saat mustChangePassword true
setSession({
  id: "admin-must-change-2",
  name: "Admin Baru",
  email: "admin.baru@pertanian.go.id",
  role: "ADMIN",
  mustChangePassword: true,
  isActive: true,
});
const arsipBlocked = await deleteLaporan("lap-1", "Alasan penghapusan");
assert.equal(arsipBlocked.success, false);
assert.equal(arsipBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");

// Kasus 2: PJ (role USER) dengan mustChangePassword false tetap ditolak untuk aksi admin
setSession({
  id: "pj-active",
  name: "PJ Aktif",
  email: "pj.aktif@pertanian.go.id",
  role: "USER",
  mustChangePassword: false,
  isActive: true,
});
const arsipUserDenied = await deleteLaporan("lap-1", "Alasan penghapusan");
assert.equal(arsipUserDenied.success, false);
assert.equal(arsipUserDenied.error, "Hanya Admin yang berhak menghapus laporan arsip.");

// ==============================================================================
// 5. Uji Repositori: deleteDokumen
// ==============================================================================
// Kasus 1: Ditolak saat mustChangePassword true
setSession({
  id: "admin-must-change-3",
  name: "Admin Baru",
  email: "admin.baru@pertanian.go.id",
  role: "ADMIN",
  mustChangePassword: true,
  isActive: true,
});
const repoBlocked = await deleteDokumen("doc-1");
assert.equal(repoBlocked.success, false);
assert.equal(repoBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");

// Kasus 2: PJ (role USER) dengan mustChangePassword false tetap ditolak untuk aksi admin
setSession({
  id: "pj-active",
  name: "PJ Aktif",
  email: "pj.aktif@pertanian.go.id",
  role: "USER",
  mustChangePassword: false,
  isActive: true,
});
const repoUserDenied = await deleteDokumen("doc-1");
assert.equal(repoUserDenied.success, false);
assert.equal(repoUserDenied.error, "Hanya Admin yang berhak menghapus dokumen.");

// ==============================================================================
// 6. Uji Notifikasi: getMyNotifications & markMyNotificationsRead tidak melempar error
// ==============================================================================
setSession({
  id: "pj-must-change-notif",
  name: "PJ Notif",
  email: "pj.notif@pertanian.go.id",
  role: "USER",
  mustChangePassword: true,
  isActive: true,
});
const notifResult = await getMyNotifications();
assert.deepEqual(
  notifResult,
  { items: [], unreadCount: 0 },
  "Notifikasi harus mengembalikan items kosong tanpa melempar error",
);

const markResult = await markMyNotificationsRead(["notif-1"]);
assert.deepEqual(
  markResult,
  { success: false },
  "Mark notifikasi harus mengembalikan success: false tanpa melempar error",
);

// Reset mock session setelah pengujian
__setMockSessionForTest(null);

console.log("src/features/security-actions.test.ts passed: semua penegakan mustChangePassword dan otorisasi role terverifikasi.");

// ==============================================================================
// Akses lapor: bukaAksesLapor dan cabutAksesLapor
// ==============================================================================
const aksesInput = {
  kegiatanId: "keg-1",
  periodeBulan: 1,
  periodeTahun: 2026,
  durasiHari: 3,
  alasan: "PJ sedang dinas luar kota",
};

// Kasus 1: ditolak saat wajib ganti password (bahkan jika admin)
setSession({
  id: "admin-must-change",
  name: "Admin Baru",
  email: "admin.baru@pertanian.go.id",
  role: "ADMIN",
  mustChangePassword: true,
  isActive: true,
});
const aksesBlocked = await bukaAksesLapor(aksesInput);
assert.equal(aksesBlocked.success, false);
assert.equal(aksesBlocked.success === false && aksesBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");
const cabutBlocked = await cabutAksesLapor("akses-1");
assert.equal(cabutBlocked.success, false);
assert.equal(cabutBlocked.success === false && cabutBlocked.error, "Wajib ganti kata sandi terlebih dahulu.");

// Kasus 2: PJ (role USER) tidak boleh membuka atau mencabut akses
setSession({
  id: "pj-1",
  name: "PJ User",
  email: "pj1@pertanian.go.id",
  role: "USER",
  mustChangePassword: false,
  isActive: true,
});
const aksesUserDenied = await bukaAksesLapor(aksesInput);
assert.equal(aksesUserDenied.success, false);
assert.equal(aksesUserDenied.success === false && aksesUserDenied.error, "Hanya admin yang bisa mengatur akses lapor.");
const cabutUserDenied = await cabutAksesLapor("akses-1");
assert.equal(cabutUserDenied.success, false);
assert.equal(cabutUserDenied.success === false && cabutUserDenied.error, "Hanya admin yang bisa mengatur akses lapor.");

// Kasus 3: tanpa sesi
setSession(null);
const aksesNoSession = await bukaAksesLapor(aksesInput);
assert.equal(aksesNoSession.success, false);
assert.equal(aksesNoSession.success === false && aksesNoSession.error, "Sesi tidak valid, silakan login ulang.");

// Kasus 4: admin dengan data tidak valid ditolak sebelum menyentuh database
setSession({
  id: "admin-1",
  name: "Admin",
  email: "admin@pertanian.go.id",
  role: "ADMIN",
  mustChangePassword: false,
  isActive: true,
});
const aksesAlasanPendek = await bukaAksesLapor({ ...aksesInput, alasan: "x" });
assert.equal(aksesAlasanPendek.success, false);
assert.equal(aksesAlasanPendek.success === false && aksesAlasanPendek.error, "Alasan minimal 5 karakter.");
const aksesDurasiTerlaluLama = await bukaAksesLapor({ ...aksesInput, durasiHari: 31 });
assert.equal(aksesDurasiTerlaluLama.success, false);
assert.equal(aksesDurasiTerlaluLama.success === false && aksesDurasiTerlaluLama.error, "Durasi maksimal 30 hari.");
const aksesDurasiNol = await bukaAksesLapor({ ...aksesInput, durasiHari: 0 });
assert.equal(aksesDurasiNol.success, false);
assert.equal(aksesDurasiNol.success === false && aksesDurasiNol.error, "Durasi minimal 1 hari.");

console.log("akses lapor security checks passed");
