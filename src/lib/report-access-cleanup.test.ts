import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import {
  cabutAksesSaatDiblokir,
  CATATAN_PENOLAKAN_OTOMATIS,
} from "./report-access-cleanup";

const now = new Date("2026-10-27T10:00:00.000Z");
const kegiatan = { id: "keg-1", kode: "7912.SDA.015.051A", nama: "Makan Makan" };
const admin = { id: "adm-1", name: "Admin", email: "admin@example.test" };

// tx palsu: mencatat panggilan dan mengembalikan jumlah baris yang "terubah".
function buatTx(counts: { akses: number; permintaan: number }) {
  const calls = {
    akses: [] as unknown[],
    permintaan: [] as unknown[],
    audit: [] as Record<string, unknown>[],
  };
  const tx = {
    reportAccessOverride: {
      updateMany: async (args: unknown) => {
        calls.akses.push(args);
        return { count: counts.akses };
      },
    },
    reportAccessRequest: {
      updateMany: async (args: unknown) => {
        calls.permintaan.push(args);
        return { count: counts.permintaan };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.audit.push(args.data);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

// Ada akses aktif dan permintaan menunggu: keduanya dibersihkan, audit tercatat.
{
  const { tx, calls } = buatTx({ akses: 2, permintaan: 1 });
  const hasil = await cabutAksesSaatDiblokir(tx, kegiatan, admin, now);
  assert.deepEqual(hasil, { aksesDicabut: 2, permintaanDitolak: 1 });

  // Hanya akses yang masih aktif (belum dicabut, belum kedaluwarsa) milik kegiatan itu.
  assert.deepEqual(calls.akses, [
    {
      where: { kegiatanId: "keg-1", revokedAt: null, openedUntil: { gt: now } },
      data: { revokedAt: now },
    },
  ]);
  // Hanya permintaan PENDING milik kegiatan itu, ditolak dengan catatan otomatis.
  assert.deepEqual(calls.permintaan, [
    {
      where: { kegiatanId: "keg-1", status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: "adm-1",
        decidedAt: now,
        decisionNote: CATATAN_PENOLAKAN_OTOMATIS,
      },
    },
  ]);
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].action, "REVOKE_REPORT_ACCESS");
  assert.equal(calls.audit[0].kodeKegiatan, kegiatan.kode);
  assert.equal(calls.audit[0].adminEmail, admin.email);
  assert.match(String(calls.audit[0].alasan), /2 akses dicabut, 1 permintaan ditolak/);
}

// Hanya permintaan menunggu yang ada: tetap dibersihkan dan dicatat.
{
  const { tx, calls } = buatTx({ akses: 0, permintaan: 3 });
  const hasil = await cabutAksesSaatDiblokir(tx, kegiatan, admin, now);
  assert.deepEqual(hasil, { aksesDicabut: 0, permintaanDitolak: 3 });
  assert.equal(calls.audit.length, 1);
}

// Tidak ada yang perlu dibersihkan (mis. kegiatan sudah diblokir dan disimpan ulang):
// tidak ada catatan audit sia-sia.
{
  const { tx, calls } = buatTx({ akses: 0, permintaan: 0 });
  const hasil = await cabutAksesSaatDiblokir(tx, kegiatan, admin, now);
  assert.deepEqual(hasil, { aksesDicabut: 0, permintaanDitolak: 0 });
  assert.equal(calls.audit.length, 0);
}

console.log("report-access-cleanup checks passed");
