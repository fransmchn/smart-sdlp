import assert from "node:assert/strict";
import { generateSecureTemporaryPassword } from "./password";

// 1. Uji panjang default dan minimal 12 karakter
const pwdDefault = generateSecureTemporaryPassword();
assert.ok(
  pwdDefault.length >= 12,
  `Panjang password default harus >= 12, didapat: ${pwdDefault.length}`,
);

const pwdCustom = generateSecureTemporaryPassword(20);
assert.equal(
  pwdCustom.length,
  20,
  `Panjang password custom harus 20, didapat: ${pwdCustom.length}`,
);

const pwdTooShort = generateSecureTemporaryPassword(8);
assert.ok(
  pwdTooShort.length >= 12,
  `Panjang password yang diminta < 12 harus dipaksa minimal 12, didapat: ${pwdTooShort.length}`,
);

// 2. Uji keberadaan kategori karakter (huruf besar, kecil, angka, simbol)
const hasUpper = /[A-Z]/.test(pwdDefault);
const hasLower = /[a-z]/.test(pwdDefault);
const hasDigit = /[0-9]/.test(pwdDefault);
const hasSpecial = /[!@#$%^&*()_+\-=]/.test(pwdDefault);

assert.ok(hasUpper, "Password harus memuat minimal 1 huruf besar");
assert.ok(hasLower, "Password harus memuat minimal 1 huruf kecil");
assert.ok(hasDigit, "Password harus memuat minimal 1 angka");
assert.ok(hasSpecial, "Password harus memuat minimal 1 karakter khusus");

// 3. Uji keacakan dan keunikan: generate 100 password, pastikan tidak ada duplikat
const generatedSet = new Set<string>();
const count = 100;
for (let i = 0; i < count; i++) {
  const pwd = generateSecureTemporaryPassword(16);
  assert.ok(
    !generatedSet.has(pwd),
    `Password harus unik tiap akun, ditemukan duplikat pada iterasi ${i}: ${pwd}`,
  );
  generatedSet.add(pwd);
}
assert.equal(generatedSet.size, count, "Seluruh 100 password yang digenerate harus unik");

console.log("src/lib/password.test.ts passed: password acak, kuat, dan unik per akun.");
