import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/active-session";
import { prisma } from "@/lib/prisma";
import { aggregateActivityReports } from "@/utils/reportAggregation";
import {
  formatReportDeadline,
  isReportDeadlinePassed,
} from "@/utils/reportDeadline";
import { formatPeriodeLabel, isReportAccessActive } from "@/utils/reportAccess";
import { formatWaktuWib, isLaporanRevised } from "@/utils/waktu";
import { PermintaanAksesPanel } from "@/features/akses-lapor/components/permintaan-akses-panel";
import { getReportDeadline as getReportDeadlineSettings } from "@/features/app-settings/actions";
import {
  MasterArsipSMARTPage,
  type ArsipItem,
} from "@/features/arsip/components/master-arsip";

const PAGE_SIZE = 10;

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default async function ArsipPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    periode?: string;
    status?: string;
  }>;
}) {
  const session = await getActiveSession();

  if (!session) redirect("/login?error=inactive");
  if (session.user.role?.toLowerCase() !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const q = params.q?.trim().toLowerCase() ?? "";
  const statusParam =
    params.status && params.status !== "ALL" ? params.status : "ALL";
  const periodeParam =
    params.periode && params.periode !== "ALL" ? params.periode : "ALL";

  const [kegiatanList, laporanList, availablePeriods] = await Promise.all([
    prisma.kegiatan.findMany({
      include: {
        pj: true,
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
      orderBy: { kode: "asc" },
    }),
    prisma.laporan.findMany({
      include: {
        kegiatan: { include: { pj: true } },
        submittedBy: true,
      },
      orderBy: [
        { periodeTahun: "desc" },
        { periodeBulan: "desc" },
        { createdAt: "desc" },
      ],
    }),
    prisma.laporan.groupBy({
      by: ["periodeBulan", "periodeTahun"],
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
    }),
  ]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const activeMonth = currentMonth;
  const activeYear = currentYear;

  let targetMonth: number | null = null;
  let targetYear: number | null = null;

  if (periodeParam !== "ALL" && periodeParam.includes("-")) {
    const [b, t] = periodeParam.split("-");
    targetMonth = Number(b);
    targetYear = Number(t);
  }

  // ── Bangun Matriks Arsip ────────────────────────────────────────────────
  const reportMetrics = aggregateActivityReports(kegiatanList.map((k) => ({ id: k.id, pagu: Number(k.pagu) })), laporanList.map((l) => ({ kegiatanId: l.kegiatanId, periodeBulan: l.periodeBulan, periodeTahun: l.periodeTahun, realIni: Number(l.realIni) })), { month: activeMonth, year: activeYear });
  const allItems: ArsipItem[] = [];

  if (targetMonth && targetYear) {
    // Mode Spesifik Periode
    const activeLabel = `${NAMA_BULAN[targetMonth - 1]} ${targetYear}`;
    const laporanBulanIni = laporanList.filter(
      (l) => l.periodeBulan === targetMonth && l.periodeTahun === targetYear,
    );
    const uploadedKegiatanIds = new Set(
      laporanBulanIni.map((l) => l.kegiatanId),
    );

    for (const l of laporanBulanIni) {
      allItems.push({
        id: l.id,
        kegiatanId: l.kegiatanId,
        laporanId: l.id,
        kode: l.kegiatan.kode,
        nama: l.kegiatan.nama,
        periode: activeLabel,
        periodeBulan: l.periodeBulan,
        periodeTahun: l.periodeTahun,
        jenis: l.kegiatan.jenis || "APBN",
        pjNama: l.submittedBy?.name || l.kegiatan.pj?.name || "PJ Kegiatan",
        pjEmail: l.submittedBy?.email || l.kegiatan.pj?.email || "-",
        waktuUpload: formatWaktuWib(l.createdAt),
        waktuRevisi: isLaporanRevised(l.createdAt, l.updatedAt)
          ? formatWaktuWib(l.updatedAt)
          : null,
        status: "SUDAH_UPLOAD",
        pagu: Number(l.kegiatan.pagu),
        realisasi: Number(l.realisasi),
        realIni: Number(l.realIni),
        fisik: l.fisik,
        statusAnggaran: l.statusAnggaran,
        uraian: l.uraian,
      });
    }

    for (const k of kegiatanList) {
      if (!uploadedKegiatanIds.has(k.id)) {
        allItems.push({
          id: `unuploaded-${k.id}-${targetMonth}-${targetYear}`,
          kegiatanId: k.id,
          laporanId: null,
          kode: k.kode,
          nama: k.nama,
          periode: activeLabel,
          periodeBulan: targetMonth,
          periodeTahun: targetYear,
          jenis: k.jenis || "APBN",
          pjNama: k.pj?.name || "PJ Belum Ditentukan",
          pjEmail: k.pj?.email || "-",
          waktuUpload: "—",
          status: "BELUM_UPLOAD",
          pagu: Number(k.pagu),
          realisasi: reportMetrics.get(k.id)?.sdPeriode ?? 0,
          realIni: Number(k.realIni || 0),
          fisik: k.fisik || 0,
          statusAnggaran: k.statusAnggaran,
          uraian: null,
        });
      }
    }
  } else {
    // Mode Semua Periode
    for (const l of laporanList) {
      allItems.push({
        id: l.id,
        kegiatanId: l.kegiatanId,
        laporanId: l.id,
        kode: l.kegiatan.kode,
        nama: l.kegiatan.nama,
        periode: `${NAMA_BULAN[l.periodeBulan - 1]} ${l.periodeTahun}`,
        periodeBulan: l.periodeBulan,
        periodeTahun: l.periodeTahun,
        jenis: l.kegiatan.jenis || "APBN",
        pjNama: l.submittedBy?.name || l.kegiatan.pj?.name || "PJ Kegiatan",
        pjEmail: l.submittedBy?.email || l.kegiatan.pj?.email || "-",
        waktuUpload: formatWaktuWib(l.createdAt),
        waktuRevisi: isLaporanRevised(l.createdAt, l.updatedAt)
          ? formatWaktuWib(l.updatedAt)
          : null,
        status: "SUDAH_UPLOAD",
        pagu: Number(l.kegiatan.pagu),
        realisasi: Number(l.realisasi),
        realIni: Number(l.realIni),
        fisik: l.fisik,
        statusAnggaran: l.statusAnggaran,
        uraian: l.uraian,
      });
    }

    const uploadedInDefault = new Set(
      laporanList
        .filter(
          (l) =>
            l.periodeBulan === activeMonth && l.periodeTahun === activeYear,
        )
        .map((l) => l.kegiatanId),
    );

    const activePeriodLabel = `${NAMA_BULAN[activeMonth - 1]} ${activeYear}`;
    for (const k of kegiatanList) {
      if (!uploadedInDefault.has(k.id)) {
        allItems.push({
          id: `unuploaded-${k.id}-${activeMonth}-${activeYear}`,
          kegiatanId: k.id,
          laporanId: null,
          kode: k.kode,
          nama: k.nama,
          periode: activePeriodLabel,
          periodeBulan: activeMonth,
          periodeTahun: activeYear,
          jenis: k.jenis || "APBN",
          pjNama: k.pj?.name || "PJ Belum Ditentukan",
          pjEmail: k.pj?.email || "-",
          waktuUpload: "—",
          status: "BELUM_UPLOAD",
          pagu: Number(k.pagu),
          realisasi: reportMetrics.get(k.id)?.sdPeriode ?? 0,
          realIni: Number(k.realIni || 0),
          fisik: k.fisik || 0,
          statusAnggaran: k.statusAnggaran,
          uraian: null,
        });
      }
    }
  }

  // ── SEMUA KODE DI BAWAH INI SEKARANG DI LUAR if/else — dipakai KEDUA mode ──

  // Tandai baris yang batas waktunya sudah lewat, dan akses lapor yang sedang dibuka admin.
  const deadlineSettings = await getReportDeadlineSettings();
  const aksesAktif = await prisma.reportAccessOverride.findMany({
    where: { revokedAt: null, openedUntil: { gt: new Date() } },
  });
  const aksesByKey = new Map(
    aksesAktif.map((a) => [
      `${a.kegiatanId}-${a.periodeBulan}-${a.periodeTahun}`,
      a,
    ]),
  );
  // Status blokir kegiatan saat ini. `statusAnggaran` pada baris laporan adalah
  // snapshot saat laporan dikirim, jadi tidak bisa dipakai untuk keputusan ini.
  const kegiatanDiblokirIds = new Set(
    kegiatanList.filter((k) => k.statusAnggaran === "DIBLOKIR").map((k) => k.id),
  );
  for (const item of allItems) {
    item.kegiatanDiblokir = kegiatanDiblokirIds.has(item.kegiatanId);
    item.deadlinePassed = isReportDeadlinePassed(
      item.periodeTahun,
      item.periodeBulan,
      deadlineSettings,
    );
    const akses = aksesByKey.get(
      `${item.kegiatanId}-${item.periodeBulan}-${item.periodeTahun}`,
    );
    const aktif = akses && isReportAccessActive(akses);
    item.aksesId = aktif ? akses.id : null;
    item.aksesSampai = aktif ? formatReportDeadline(akses.openedUntil) : null;
  }

  const sudahCount = allItems.filter((i) => i.status === "SUDAH_UPLOAD").length;
  const belumCount = allItems.filter((i) => i.status === "BELUM_UPLOAD").length;
  const totalCount = allItems.length;

  let filteredItems = allItems;

  if (q) {
    filteredItems = filteredItems.filter(
      (item) =>
        item.kode.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        item.pjNama.toLowerCase().includes(q) ||
        item.pjEmail.toLowerCase().includes(q),
    );
  }

  if (statusParam === "SUDAH_UPLOAD") {
    filteredItems = filteredItems.filter(
      (item) => item.status === "SUDAH_UPLOAD",
    );
  } else if (statusParam === "BELUM_UPLOAD") {
    filteredItems = filteredItems.filter(
      (item) => item.status === "BELUM_UPLOAD",
    );
  }

  const totalFiltered = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  if (page > totalPages) {
    const next = new URLSearchParams();
    next.set("page", String(totalPages));
    if (params.q) next.set("q", params.q);
    if (params.periode) next.set("periode", params.periode);
    if (params.status) next.set("status", params.status);
    redirect(`/admin/arsip-sp2d?${next.toString()}`);
  }

  const paginatedItems = filteredItems.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const periodOptionsMap = new Map<string, string>();

  for (const p of availablePeriods) {
    const key = `${p.periodeBulan}-${p.periodeTahun}`;
    periodOptionsMap.set(
      key,
      `${NAMA_BULAN[p.periodeBulan - 1]} ${p.periodeTahun}`,
    );
  }

  for (let bulan = 1; bulan <= currentMonth; bulan++) {
    const key = `${bulan}-${currentYear}`;
    if (!periodOptionsMap.has(key)) {
      periodOptionsMap.set(key, `${NAMA_BULAN[bulan - 1]} ${currentYear}`);
    }
  }

  const periodOptions = Array.from(periodOptionsMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      const [bMa, tMa] = a.value.split("-").map(Number);
      const [bMb, tMb] = b.value.split("-").map(Number);
      return tMb !== tMa ? tMb - tMa : bMb - bMa;
    });

  // Permintaan akses lapor dari PJ yang menunggu keputusan admin.
  const permintaanMenunggu = await prisma.reportAccessRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      kegiatan: { select: { kode: true, nama: true } },
      requestedBy: { select: { name: true, email: true } },
    },
  });
  const permintaanItems = permintaanMenunggu.map((p) => ({
    id: p.id,
    kode: p.kegiatan.kode,
    nama: p.kegiatan.nama,
    periode: formatPeriodeLabel(p.periodeBulan, p.periodeTahun),
    pjNama: p.requestedBy.name,
    pjEmail: p.requestedBy.email,
    alasan: p.reason,
    dibuatPada: formatReportDeadline(p.createdAt),
  }));

  return (
    <div className="space-y-5">
      <PermintaanAksesPanel items={permintaanItems} />
      <MasterArsipSMARTPage
        arsipList={paginatedItems}
        stats={{ total: totalCount, sudah: sudahCount, belum: belumCount }}
        pagination={{
          page,
          totalPages,
          total: totalFiltered,
          pageSize: PAGE_SIZE,
        }}
        periodOptions={periodOptions}
        currentParams={{ q, periode: periodeParam, status: statusParam }}
      />
    </div>
  );
}
