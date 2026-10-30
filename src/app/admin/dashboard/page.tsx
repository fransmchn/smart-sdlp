import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { Activity } from "@/types";
import { aggregateActivityReports } from "@/utils/reportAggregation";
import { getMyNotifications } from "@/features/notifications/actions";
import { getReportDeadline } from "@/features/app-settings/actions";
import { daftarTahunFilter, hitungPetunjukTahun } from "@/utils/arsipFilter";
import {
  bangunBarData,
  bangunLineData,
  opsiBulanDashboard,
  statusKepatuhan,
  tentukanPeriodeDashboard,
} from "@/utils/dashboardAdmin";
import { bangunRekapTahunan } from "@/utils/rekapTahunan";
import { isReportDeadlinePassed } from "@/utils/reportDeadline";
import { getWibYearMonth } from "@/utils/tahunAnggaran";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string; bulan?: string }>;
}) {
  const params = await searchParams;

  const [kegiatanRows, laporanRows, categories, notifications, deadlineSettings] =
    await Promise.all([
      prisma.kegiatan.findMany({
        include: {
          pj: { select: { id: true, name: true, email: true } },
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.laporan.findMany({
        orderBy: [{ periodeTahun: "asc" }, { periodeBulan: "asc" }],
      }),
      prisma.programCategory.findMany({
        orderBy: { sortOrder: "asc" },
        select: { name: true, sortOrder: true, colorKey: true, isActive: true },
      }),
      getMyNotifications(),
      getReportDeadline(),
    ]);

  // Periode yang dilihat: tahun anggaran + "posisi per bulan". Bawaan: tahun dan
  // bulan berjalan menurut WIB.
  const now = new Date();
  const nowMs = now.getTime();
  const periode = tentukanPeriodeDashboard(params.tahun, params.bulan, nowMs);
  const periodeBulanTahun = { bulan: periode.bulan, tahun: periode.tahun };

  // Seluruh angka dihitung hanya untuk kegiatan pada tahun anggaran terpilih,
  // supaya pagu, realisasi, dan kepatuhan antar tahun tidak bercampur.
  const kegiatanTahun = kegiatanRows.filter(
    (k) => k.tahunAnggaran === periode.tahun,
  );
  const idsTahun = new Set(kegiatanTahun.map((k) => k.id));
  const laporanTahun = laporanRows.filter((l) => idsTahun.has(l.kegiatanId));

  const aggregates = aggregateActivityReports(
    kegiatanTahun.map((k) => ({ id: k.id, pagu: Number(k.pagu) })),
    laporanTahun.map((l) => ({ ...l, realIni: Number(l.realIni) })),
    { month: periode.bulan, year: periode.tahun },
  );

  const activities: Activity[] = kegiatanTahun.map((k) => {
    const agg = aggregates.get(k.id);
    const sudahLapor = agg?.sudahLaporPeriode ?? false;
    return {
      id: k.id,
      kode: k.kode,
      nama: k.nama,
      jenis: k.jenis || "APBN",
      programCategory: k.programCategoryRef?.id
        ? k.programCategoryRef.name
        : (k.programCategory ?? undefined),
      pagu: Number(k.pagu),
      realisasi: agg?.sdPeriode ?? 0,
      fisik: k.fisik ?? 0,
      uraian: k.uraian ?? undefined,
      statusAnggaran: k.statusAnggaran === "DIBLOKIR" ? "Diblokir" : "Dibuka",
      realLalu: agg?.realLalu ?? 0,
      realIni: agg?.realIni ?? 0,
      pj: k.pj?.name,
      email: k.pj?.email,
      wajib: k.wajib,
      sudahLapor,
      status: sudahLapor ? "done" : "pending",
      kepatuhan: statusKepatuhan({
        diblokir: k.statusAnggaran === "DIBLOKIR",
        sudahLapor,
        periode: periodeBulanTahun,
        nowMs,
      }),
    };
  });

  // Grafik batang dan Kurva-S: Januari sampai bulan acuan, hanya kegiatan tahun itu.
  // Kurva-S memakai target LINEAR (asumsi, belum ada data rencana pencairan
  // bulanan resmi/RKAKL di schema).
  const bulanSampai = periode.belumDimulai ? 0 : periode.bulan;
  const grafikKegiatan = kegiatanTahun.map((k) => ({
    id: k.id,
    jenis: k.jenis,
    pagu: Number(k.pagu),
  }));
  const grafikLaporan = laporanTahun.map((l) => ({
    kegiatanId: l.kegiatanId,
    periodeBulan: l.periodeBulan,
    periodeTahun: l.periodeTahun,
    realIni: Number(l.realIni),
  }));
  const barData = bangunBarData(grafikKegiatan, grafikLaporan, periode.tahun, bulanSampai);
  const lineDataFull = bangunLineData(grafikKegiatan, grafikLaporan, periode.tahun, bulanSampai);

  // Rekap tahunan: matriks kegiatan x 12 bulan untuk tahun terpilih, per bulan acuan.
  const rekap = bangunRekapTahunan({
    kegiatan: kegiatanTahun
      .map((k) => ({
        id: k.id,
        kode: k.kode,
        nama: k.nama,
        jenis: k.jenis || "APBN",
        pagu: Number(k.pagu),
        wajib: k.wajib,
        diblokir: k.statusAnggaran === "DIBLOKIR",
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode)),
    laporan: grafikLaporan,
    tahun: periode.tahun,
    bulanAcuan: bulanSampai,
    nowMs,
    deadlineLewat: (bulan, tahun) =>
      isReportDeadlinePassed(tahun, bulan, deadlineSettings, now),
  });

  const tahunOptions = daftarTahunFilter(
    kegiatanRows.map((k) => k.tahunAnggaran),
    laporanRows.map((l) => l.periodeTahun),
    getWibYearMonth(nowMs).tahun,
  );
  // Bila tahun yang dilihat kosong, beri tahu tahun lain yang punya kegiatan.
  const petunjukTahun =
    activities.length === 0
      ? hitungPetunjukTahun(
          kegiatanRows.map((k) => ({
            tahunAnggaran: k.tahunAnggaran,
            kode: k.kode,
            nama: k.nama,
            pjNama: "",
            pjEmail: "",
          })),
          "",
          { semua: false, tahun: periode.tahun },
        )
      : [];

  const metrics = Object.fromEntries(aggregates.entries());

  return (
    <AdminDashboard
      activities={activities}
      metrics={metrics}
      categories={categories
        .filter((category) => category.isActive)
        .map(({ name, colorKey }) => ({ name, colorKey }))}
      barData={barData}
      lineDataFull={lineDataFull}
      notifications={notifications.items}
      reportPeriod={{ month: periode.bulan, year: periode.tahun }}
      tahunOptions={tahunOptions}
      bulanOptions={opsiBulanDashboard(periode.tahun, nowMs)}
      belumDimulai={periode.belumDimulai}
      petunjukTahun={petunjukTahun}
      rekap={rekap}
    />
  );
}
