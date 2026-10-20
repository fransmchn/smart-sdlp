import assert from "node:assert/strict";
import { formatWaktuWib, isLaporanRevised } from "./waktu";

// 08.05 UTC sama dengan 15.05 WIB, apa pun zona waktu komputernya.
const waktu = formatWaktuWib(new Date("2026-10-17T08:05:00.000Z"));
assert.match(waktu, /17/);
assert.match(waktu, /2026/);
assert.match(waktu, /15\.05/);
assert.ok(waktu.endsWith(" WIB"));

// Tengah malam UTC jatuh pada pagi hari berikutnya di WIB.
assert.match(formatWaktuWib(new Date("2026-10-17T20:30:00.000Z")), /18/);

const dibuat = new Date("2026-10-17T08:05:00.000Z");
assert.equal(isLaporanRevised(dibuat, new Date(dibuat.getTime() + 200)), false);
assert.equal(isLaporanRevised(dibuat, new Date(dibuat.getTime() + 1000)), false);
assert.equal(isLaporanRevised(dibuat, new Date(dibuat.getTime() + 60_000)), true);

console.log("waktu checks passed");
