import assert from "node:assert/strict";
import { assertActiveSession, assertAdminSession } from "./active-session";

const fakeUserSession = {
  user: {
    id: "usr-1",
    email: "user@example.com",
    role: "USER",
    isActive: true,
    mustChangePassword: true,
  },
  session: { id: "sess-1", userId: "usr-1" },
};

const fakeAdminSession = {
  user: {
    id: "adm-1",
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
    mustChangePassword: true,
  },
  session: { id: "sess-2", userId: "adm-1" },
};

// 1. Session null harus ditolak
assert.throws(
  () => assertActiveSession(null),
  /Sesi tidak valid atau akun tidak aktif/,
  "Session null harus throw error",
);

// 2. User dengan mustChangePassword = true harus ditolak oleh requireActiveSession default
assert.throws(
  () => assertActiveSession(fakeUserSession),
  /Wajib ganti kata sandi terlebih dahulu/,
  "User dengan mustChangePassword true harus ditolak",
);

// 3. User dengan mustChangePassword = true diizinkan jika allowMustChangePassword: true (untuk markPasswordChanged)
const allowedSession = assertActiveSession(fakeUserSession, { allowMustChangePassword: true });
assert.equal(allowedSession.user.id, "usr-1");

// 4. Admin dengan mustChangePassword = true harus ditolak oleh requireAdminSession default
assert.throws(
  () => assertAdminSession(fakeAdminSession),
  /Wajib ganti kata sandi terlebih dahulu/,
  "Admin dengan mustChangePassword true harus ditolak jika belum ganti password",
);

// 5. Admin dengan role non-admin harus ditolak
const fakeUserMustFalse = {
  ...fakeUserSession,
  user: { ...fakeUserSession.user, mustChangePassword: false },
};
assert.throws(
  () => assertAdminSession(fakeUserMustFalse),
  /Hanya admin yang diizinkan/,
  "Role USER harus ditolak oleh assertAdminSession",
);

// 6. User dan Admin dengan mustChangePassword = false harus berhasil lolos
const activeUser = assertActiveSession(fakeUserMustFalse);
assert.equal(activeUser.user.id, "usr-1");

const fakeAdminMustFalse = {
  ...fakeAdminSession,
  user: { ...fakeAdminSession.user, mustChangePassword: false },
};
const activeAdmin = assertAdminSession(fakeAdminMustFalse);
assert.equal(activeAdmin.user.id, "adm-1");

console.log("src/lib/active-session.test.ts passed: penegakan wajib ganti kata sandi berjalan benar.");
