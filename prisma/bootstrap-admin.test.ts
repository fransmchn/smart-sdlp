import assert from "node:assert/strict";
import { validateBootstrapInput } from "./bootstrap-admin";

// 1. Email kosong / tidak ada harus ditolak
assert.throws(
  () => validateBootstrapInput("", "PasswordSangatKuat123!"),
  /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set/,
  "Harus menolak jika email kosong",
);

assert.throws(
  () => validateBootstrapInput(undefined, "PasswordSangatKuat123!"),
  /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set/,
  "Harus menolak jika email undefined",
);

// 2. Password kosong / tidak ada harus ditolak
assert.throws(
  () => validateBootstrapInput("admin@pertanian.go.id", ""),
  /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set/,
  "Harus menolak jika password kosong",
);

assert.throws(
  () => validateBootstrapInput("admin@pertanian.go.id", undefined),
  /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set/,
  "Harus menolak jika password undefined",
);

// 3. Password lemah (< 12 karakter) harus ditolak
assert.throws(
  () => validateBootstrapInput("admin@pertanian.go.id", "pendek123"),
  /BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long/,
  "Harus menolak jika password 9 karakter",
);

assert.throws(
  () => validateBootstrapInput("admin@pertanian.go.id", "12345678901"),
  /BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long/,
  "Harus menolak jika password 11 karakter",
);

// 4. Input valid (password >= 12 karakter) harus diterima
const valid = validateBootstrapInput("  admin@pertanian.go.id  ", "PasswordSangatKuat123!");
assert.equal(valid.email, "admin@pertanian.go.id", "Email harus di-trim");
assert.equal(valid.password, "PasswordSangatKuat123!", "Password harus sesuai");

console.log("prisma/bootstrap-admin.test.ts passed: bootstrap menolak password lemah dan input tidak lengkap.");
