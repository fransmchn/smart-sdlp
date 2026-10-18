import assert from "node:assert/strict";
import {
  canSubmitReport,
  computeAccessOpenedUntil,
  formatPeriodeLabel,
  isReportAccessActive,
  isValidAccessDays,
} from "./reportAccess";

const now = new Date("2026-10-15T08:00:00.000Z");

// Sebelum batas waktu: selalu boleh, tidak perlu akses khusus.
assert.equal(canSubmitReport({ deadlinePassed: false, now }), true);

// Setelah batas waktu tanpa akses: ditolak.
assert.equal(canSubmitReport({ deadlinePassed: true, now }), false);
assert.equal(canSubmitReport({ deadlinePassed: true, access: null, now }), false);

// Setelah batas waktu dengan akses aktif: diizinkan.
const aktif = { openedUntil: new Date("2026-10-18T08:00:00.000Z"), revokedAt: null };
assert.equal(isReportAccessActive(aktif, now), true);
assert.equal(canSubmitReport({ deadlinePassed: true, access: aktif, now }), true);

// Akses sudah kedaluwarsa (tepat di batas dianggap berakhir).
const kedaluwarsa = { openedUntil: new Date("2026-10-15T08:00:00.000Z") };
assert.equal(isReportAccessActive(kedaluwarsa, now), false);
assert.equal(canSubmitReport({ deadlinePassed: true, access: kedaluwarsa, now }), false);

// Akses sudah dicabut walau waktunya belum habis.
const dicabut = {
  openedUntil: new Date("2026-10-18T08:00:00.000Z"),
  revokedAt: new Date("2026-10-15T07:00:00.000Z"),
};
assert.equal(isReportAccessActive(dicabut, now), false);
assert.equal(canSubmitReport({ deadlinePassed: true, access: dicabut, now }), false);

// Nilai berupa angka atau teks (dari tampilan) juga dipahami.
assert.equal(isReportAccessActive({ openedUntil: now.getTime() + 1000 }, now), true);
assert.equal(isReportAccessActive({ openedUntil: "2026-10-18T08:00:00.000Z" }, now), true);
assert.equal(isReportAccessActive({ openedUntil: "bukan tanggal" }, now), false);

// Durasi akses.
assert.equal(isValidAccessDays(1), true);
assert.equal(isValidAccessDays(30), true);
assert.equal(isValidAccessDays(0), false);
assert.equal(isValidAccessDays(31), false);
assert.equal(isValidAccessDays(2.5), false);
assert.equal(
  computeAccessOpenedUntil(3, now).toISOString(),
  "2026-10-18T08:00:00.000Z",
);
assert.throws(() => computeAccessOpenedUntil(0, now), /Durasi akses/);

assert.equal(formatPeriodeLabel(10, 2026), "Oktober 2026");

console.log("reportAccess checks passed");
