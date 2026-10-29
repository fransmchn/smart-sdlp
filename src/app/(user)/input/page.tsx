import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/active-session";
import { prisma } from "@/lib/prisma";
import { InputLaporanPage } from "@/components/InputLaporanPage";
import { getReportDeadline } from "@/features/app-settings/actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kode?: string }>;
}) {
  const session = await getActiveSession();
  if (!session) redirect("/login?error=inactive");

  const params = await searchParams;

  const [kegiatanRows, laporanHistory, deadline, aksesRows, permintaanRows] = await Promise.all([
    prisma.kegiatan.findMany({
      where: { pjId: session.user.id },
      include: {
        programCategoryRef: {
          select: {
            id: true,
            name: true,
            sortOrder: true,
            colorKey: true,
            isActive: true,
          },
        },
      },
      orderBy: { nama: "asc" },
    }),
    prisma.laporan.findMany({
      where: { kegiatan: { pjId: session.user.id } },
      select: {
        kegiatanId: true,
        periodeBulan: true,
        periodeTahun: true,
        realIni: true,
        fisik: true,
        uraian: true,
      },
    }),
    getReportDeadline(),
    // Akses lapor yang dibuka admin dan masih berlaku untuk kegiatan milik PJ ini.
    prisma.reportAccessOverride.findMany({
      where: {
        kegiatan: { pjId: session.user.id },
        revokedAt: null,
        openedUntil: { gt: new Date() },
      },
      select: {
        kegiatanId: true,
        periodeBulan: true,
        periodeTahun: true,
        openedUntil: true,
      },
    }),
    // Permintaan akses lapor yang pernah diajukan PJ ini (terbaru lebih dulu).
    prisma.reportAccessRequest.findMany({
      where: { requestedById: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        kegiatanId: true,
        periodeBulan: true,
        periodeTahun: true,
        status: true,
        decisionNote: true,
      },
    }),
  ]);

  if (kegiatanRows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">
          Belum ada kegiatan yang ditugaskan kepada Anda.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Hubungi admin untuk penugasan sebagai Penanggung Jawab kegiatan.
        </p>
      </div>
    );
  }

  const kegiatan = kegiatanRows.map((k) => ({
    id: k.id,
    kode: k.kode,
    nama: k.nama,
    jenis: k.jenis || "APBN",
    pagu: Number(k.pagu),
    statusAnggaran:
      k.statusAnggaran === "DIBLOKIR"
        ? ("Diblokir" as const)
        : ("Dibuka" as const),
    tahunAnggaran: k.tahunAnggaran,
    uraian: k.uraian ?? "",
    fisik: k.fisik ?? 0,
    realLalu: k.realLalu !== null ? Number(k.realLalu) : 0,
    realIni: k.realIni !== null ? Number(k.realIni) : 0,
    programCategory: k.programCategoryRef
      ? {
          id: k.programCategoryRef.id,
          name: k.programCategoryRef.name,
          sortOrder: k.programCategoryRef.sortOrder,
          colorKey: k.programCategoryRef.colorKey,
          isActive: k.programCategoryRef.isActive,
        }
      : undefined,
  }));

  const initialSelectedKode =
    params.kode && kegiatan.some((k) => k.kode === params.kode)
      ? params.kode
      : kegiatan[0].kode;

  const laporanHistorySerialized = laporanHistory.map((l) => ({
    kegiatanId: l.kegiatanId,
    periodeBulan: l.periodeBulan,
    periodeTahun: l.periodeTahun,
    realIni: Number(l.realIni),
    fisik: l.fisik,
    uraian: l.uraian,
  }));

  const accessOverrides = aksesRows.map((a) => ({
    kegiatanId: a.kegiatanId,
    periodeBulan: a.periodeBulan,
    periodeTahun: a.periodeTahun,
    openedUntil: a.openedUntil.getTime(),
  }));

  const accessRequests = permintaanRows.map((r) => ({
    kegiatanId: r.kegiatanId,
    periodeBulan: r.periodeBulan,
    periodeTahun: r.periodeTahun,
    status: r.status,
    decisionNote: r.decisionNote,
  }));

  return (
    <InputLaporanPage
      kegiatanList={kegiatan}
      initialSelectedKode={initialSelectedKode}
      sessionUser={{
        id: session.user.id,
        nama: session.user.name,
        email: session.user.email,
        nip: session.user.nip ?? "-",
        jabatan: session.user.jabatan ?? "Penanggung Jawab (PJ) Kegiatan",
      }}
      laporanHistory={laporanHistorySerialized}
      deadline={deadline}
      accessOverrides={accessOverrides}
      accessRequests={accessRequests}
      serverNow={new Date().getTime()}
    />
  );
}
