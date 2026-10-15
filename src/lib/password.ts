import { randomBytes, randomInt } from "crypto";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes confusing I, O
const LOWERCASE = "abcdefghjkmnpqrstuvwxyz"; // excludes confusing l, o
const DIGITS = "23456789"; // excludes confusing 0, 1
const SPECIAL = "!@#$%^&*()_+-=";
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SPECIAL;

/**
 * Menghasilkan password sementara yang acak dan kuat (cryptographically secure).
 * - Panjang minimal 12 karakter (default 16)
 * - Mengandung huruf besar, huruf kecil, angka, dan karakter khusus
 * - Dibuat menggunakan crypto (randomInt & randomBytes), bukan Math.random
 * - Unik per pembuatan
 */
export function generateSecureTemporaryPassword(length = 16): string {
  const safeLength = Math.max(length, 12);

  // Pastikan minimal ada 1 karakter dari tiap kategori
  const requiredChars = [
    UPPERCASE[randomInt(UPPERCASE.length)],
    LOWERCASE[randomInt(LOWERCASE.length)],
    DIGITS[randomInt(DIGITS.length)],
    SPECIAL[randomInt(SPECIAL.length)],
  ];

  const remainingLength = safeLength - requiredChars.length;
  const buffer = randomBytes(remainingLength);
  const result: string[] = [...requiredChars];

  for (let i = 0; i < remainingLength; i++) {
    result.push(ALL_CHARS[buffer[i] % ALL_CHARS.length]);
  }

  // Fisher-Yates shuffle menggunakan crypto randomInt
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result.join("");
}
