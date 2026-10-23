import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ManajemenKegiatanPage } from "@/features/admin/manage-activities/components/manajemen-kegiatan-page";
import { redirect } from "next/navigation";
import { aggregateActivityReports } from "@/utils/reportAggregation";
import { getReportDeadline } from "@/features/app-settings/actions";

const PAGE_SIZE = 5;
const WAJIB_PAGE_SIZE = 5;

const SORTABLE_COLUMNS = [
  "kode",
  "nama",
  "pagu",
  "realisasi",
  "createdAt",
] as const;
type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortableColumn(value: string | undefined): value is SortableColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    q?: string;
    kategori?: string;
    wpage?: string;
  }>;
}) {
  const params = await searchParams;

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const sort: SortableColumn = isSortableColumn(params.sort)
    ? params.sort
    : "createdAt";
  const order: Prisma.SortOrder = params.order === "asc" ? "asc" : "desc";
  const q = params.q?.trim() ?? "";
  const kategori =
    params.kategori && params.kategori !== "ALL" ? params.kategori : undefined;
  const wajibPage = Math.max(1, Number(params.wpage ?? "1") || 1);

  const where: Prisma.KegiatanWhereInput = {
    ...(q && {
      OR: [
        { nama: { contains: q, mode: "insensitive" } },
        { kode: { contains: q, mode: "insensitive" } },
        { pj: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(kategori && { programCategoryRef: { id: kategori } }),
  };

  const [
    rows,
    total,
    wajibRows,
    wajibTotalCount,
    totalWajibCount,
    sudahLaporCount,
    pjOptions,
    programCategories,
    deadline,
  ] = await Promise.all([
    prisma.kegiatan.findMany({
      where,
      include: {
        pj: { select: { id: true, name: true, email: true } },
        programCategoryRef: { select: { id: true, name: true, sortOrder: true, colorKey: true, isActive: true } },
      },
      orderBy: { [sort]: order },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.kegiatan.count({ where }),

    // Tab Wajib Lapor: SEMUA kegiatan, tanpa filter, paginate sendiri
    prisma.kegiatan.findMany({
      include: {
        pj: { select: { id: true, name: true, email: true } },
        programCategoryRef: { select: { id: true, name: true, sortOrder: true, colorKey: true, isActive: true } },
      },
      orderBy: { nama: "asc" },
      skip: (wajibPage - 1) * WAJIB_PAGE_SIZE,
      take: WAJIB_PAGE_SIZE,
    }),
    prisma.kegiatan.count(), // total SEMUA kegiatan (bukan yang ter-filter)
    prisma.kegiatan.count({ where: { wajib: true } }),
    prisma.kegiatan.count({ where: { wajib: true, sudahLapor: true } }),

    prisma.user.findMany({
      where: { isActive: true, role: "USER" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.programCategory.findMany({ orderBy: { sortOrder: "asc" } }),
     getReportDeadline(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Halaman di URL melebihi data yang tersisa (misal setelah delete) — auto-redirect
  // ke halaman valid terakhir, bukan tampilkan kosong tanpa cara kembali otomatis.
  if (page > totalPages) {
    const next = new URLSearchParams();
    next.set("page", String(totalPages));
    if (params.sort) next.set("sort", params.sort);
    if (params.order) next.set("order", params.order);
    if (params.q) next.set("q", params.q);
    if (params.kategori) next.set("kategori", params.kategori);
    redirect(`/admin/master?${next.toString()}`);
  }

  const belumLaporCount = totalWajibCount - sudahLaporCount;
  const now = new Date();
  const laporanRows = await prisma.laporan.findMany({ select: { kegiatanId: true, periodeBulan: true, periodeTahun: true, realIni: true } });
  const reportMetrics = aggregateActivityReports(rows.map((k) => ({ id: k.id, pagu: Number(k.pagu) })), laporanRows.map((l) => ({ ...l, realIni: Number(l.realIni) })), { month: now.getMonth() + 1, year: now.getFullYear() });

  const serialize = (list: typeof rows) =>
    list.map((k) => ({
      ...k,
      pagu: Number(k.pagu),
      realisasi: reportMetrics.get(k.id)?.sdPeriode ?? 0,
      sdPeriode: reportMetrics.get(k.id)?.sdPeriode ?? 0,
      sisa: reportMetrics.get(k.id)?.sisa ?? Number(k.pagu),
      persentaseRealisasi: reportMetrics.get(k.id)?.persentaseRealisasi ?? 0,
      realLalu: k.realLalu !== null ? Number(k.realLalu) : null,
      realIni: k.realIni !== null ? Number(k.realIni) : null,
       jenis: k.jenis || "APBN",
       programCategory: k.programCategoryRef?.id
          ? k.programCategoryRef.name
          : k.programCategory,
       programCategoryId: k.programCategoryId,

    }));

  return (
    <ManajemenKegiatanPage
      data={serialize(rows)}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      sort={sort}
      order={order}
      pjOptions={pjOptions}
      programCategories={programCategories}

      wajibLaporData={serialize(wajibRows)}
      wajibPage={wajibPage}
      wajibPageSize={WAJIB_PAGE_SIZE}
      wajibTotal={wajibTotalCount}
      totalWajibCount={totalWajibCount}
      sudahLaporCount={sudahLaporCount}
      belumLaporCount={belumLaporCount}
       deadline={deadline}
    />
  );
}


