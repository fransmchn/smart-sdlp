import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/active-session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { LogAuditPage } from "@/components/LogAuditPage";
import {
  formatRupiahDariTeks,
  parseLaporanSnapshot,
} from "@/utils/laporanSnapshot";
import { formatPeriodeLabel } from "@/utils/reportAccess";
import { formatWaktuWib } from "@/utils/waktu";

const PAGE_SIZE = 10;

export default async function AuditLogRoute({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
}) {
  const session = await getActiveSession();

  if (!session) redirect("/login?error=inactive");
  if (session.user.role?.toLowerCase() !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const q = params.q?.trim() ?? "";

  const where: Prisma.AuditLogWhereInput = {
    ...(q && {
      OR: [
        { namaFile: { contains: q, mode: "insensitive" } },
        { kodeKegiatan: { contains: q, mode: "insensitive" } },
        { namaKegiatan: { contains: q, mode: "insensitive" } },
        { pemilikNama: { contains: q, mode: "insensitive" } },
        { alasan: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const serializedLogs = logs.map((log) => {
    // Salinan isi laporan yang disimpan saat laporan dihapus (log lama tidak punya).
    const snap = parseLaporanSnapshot(log.dataSnapshot);
    const salinan = snap
      ? [
          { label: "Periode", value: formatPeriodeLabel(snap.periodeBulan, snap.periodeTahun) },
          { label: "Kegiatan", value: `${snap.kodeKegiatan} - ${snap.namaKegiatan}` },
          { label: "Pagu kegiatan", value: formatRupiahDariTeks(snap.paguKegiatan) },
          { label: "Realisasi periode lalu", value: formatRupiahDariTeks(snap.realLalu) },
          { label: "Realisasi periode ini", value: formatRupiahDariTeks(snap.realIni) },
          { label: "Realisasi s.d. periode", value: formatRupiahDariTeks(snap.realisasi) },
          { label: "Capaian fisik", value: `${snap.fisik}%` },
          { label: "Status anggaran", value: snap.statusAnggaran },
          { label: "Uraian", value: snap.uraian || "-" },
          { label: "Pertama dikirim", value: formatWaktuWib(new Date(snap.dibuatPada)) },
          { label: "Revisi terakhir", value: formatWaktuWib(new Date(snap.diubahPada)) },
        ]
      : null;
    return {
    id: log.id,
    waktu:
      log.createdAt.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB",
    namaFile: log.namaFile,
    kegiatan: `${log.kodeKegiatan} - ${log.namaKegiatan}`,
    pemilik: log.pemilikNama,
    emailPemilik: log.pemilikEmail,
    admin: log.adminNama,
    adminEmail: log.adminEmail,
    alasan: log.alasan,
    notif: log.notifStatus,
    salinan,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > totalPages) {
    const next = new URLSearchParams();
    next.set("page", String(totalPages));
    if (params.q) next.set("q", params.q);
    redirect(`/admin/log-audit?${next.toString()}`);
  }

  return (
    <LogAuditPage
      logs={serializedLogs}
      pagination={{
        page,
        totalPages,
        total,
        pageSize: PAGE_SIZE,
      }}
      currentSearch={q}
    />
  );
}
