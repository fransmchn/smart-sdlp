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
import {
  cocokPencarian,
  daftarTahunFilter,
  hitungPetunjukTahun,
  kegiatanWajibLaporPada,
  opsiBulanFilter,
  parseBulanParam,
  parseTahunScope,
  periodeVirtualUntukScope,
  TAHUN_SEMUA,
  tahunScopeValue,
} from "@/utils/arsipFilter";
import { kelompokkanPerKegiatan } from "@/utils/arsipGrup";
import { getWibYearMonth } from "@/utils/tahunAnggaran";
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
    bulan?: string;
    status?: string;
    tahun?: string;
    tampilan?: string;
  }>;
}) {
  const session = await getActiveSession();

  if (!session) redirect("/login?error=inactive");
  if (session.user.role?.toLowerCase() !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  // Teks pencarian apa adanya untuk ditampilkan kembali; huruf kecil untuk mencocokkan.
  const qRaw = params.q?.trim() ?? "";
  const q = qRaw.toLowerCase();
  const statusParam =
    params.status && params.status !== "ALL" ? params.status : "ALL";
  // Bawaan: satu baris per kegiatan. "daftar" = tabel kegiatan x periode.
  const tampilan = params.tampilan === "daftar" ? "daftar" : "kegiatan";

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
  const nowMs = now.getTime();
  // Bulan/tahun berjalan menurut WIB (bukan zona waktu server).
  const { bulan: currentMonth, tahun: currentYear } = getWibYearMonth(nowMs);
  const activeMonth = currentMonth;
  const activeYear = currentYear;

  // Filter tahun: default tahun berjalan. Periode di luar cakupan tahun diabaikan.
  const tahunScope = parseTahunScope(params.tahun, currentYear);
  // Bulan hanya bermakna bila tahunnya spesifik; pada "Semua Tahun" diabaikan.
  const bulanDipilih = parseBulanParam(params.bulan);
  const periodeAktif =
    bulanDipilih && !tahunScope.semua
      ? { bulan: bulanDipilih, tahun: tahunScope.tahun }
      : null;
  const targetMonth = periodeAktif?.bulan ?? null;
  const targetYear = periodeAktif?.tahun ?? null;
  const laporanScoped = tahunScope.semua
    ? laporanList
    : laporanList.filter((l) => l.periodeTahun === tahunScope.tahun);

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
      // Kegiatan hanya diharapkan melapor pada periode di dalam tahun anggarannya.
      if (
        !uploadedKegiatanIds.has(k.id) &&
        kegiatanWajibLaporPada(
          k.tahunAnggaran,
          { bulan: targetMonth, tahun: targetYear },
          nowMs,
        )
      ) {
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
    for (const l of laporanScoped) {
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

    // Baris "Belum Upload": untuk setiap periode yang relevan pada tahun terpilih,
    // kegiatan yang tahun anggarannya sesuai dan belum punya laporan.
    const sudahLapor = new Set(
      laporanList.map((l) => `${l.kegiatanId}-${l.periodeBulan}-${l.periodeTahun}`),
    );
    for (const periode of periodeVirtualUntukScope(
      tahunScope,
      nowMs,
      kegiatanList.map((k) => k.tahunAnggaran),
    )) {
      const periodeLabel = `${NAMA_BULAN[periode.bulan - 1]} ${periode.tahun}`;
      for (const k of kegiatanList) {
        if (
          sudahLapor.has(`${k.id}-${periode.bulan}-${periode.tahun}`) ||
          !kegiatanWajibLaporPada(k.tahunAnggaran, periode, nowMs)
        ) {
          continue;
        }
        allItems.push({
          id: `unuploaded-${k.id}-${periode.bulan}-${periode.tahun}`,
          kegiatanId: k.id,
          laporanId: null,
          kode: k.kode,
          nama: k.nama,
          periode: periodeLabel,
          periodeBulan: periode.bulan,
          periodeTahun: periode.tahun,
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
    filteredItems = filteredItems.filter((item) =>
      cocokPencarian(q, item.kode, item.nama, item.pjNama, item.pjEmail),
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

  // Tampilan Per kegiatan: halaman dan total dihitung per kegiatan, bukan per baris.
  const grupSemua =
    tampilan === "kegiatan" ? kelompokkanPerKegiatan(filteredItems, allItems) : [];
  const totalFiltered =
    tampilan === "kegiatan" ? grupSemua.length : filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  if (page > totalPages) {
    const next = new URLSearchParams();
    next.set("page", String(totalPages));
    if (params.q) next.set("q", params.q);
    if (params.bulan) next.set("bulan", params.bulan);
    if (params.tahun) next.set("tahun", params.tahun);
    if (params.status) next.set("status", params.status);
    if (params.tampilan) next.set("tampilan", params.tampilan);
    redirect(`/admin/arsip-sp2d?${next.toString()}`);
  }

  const paginatedItems =
    tampilan === "daftar"
      ? filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      : [];
  const tahunPerKegiatan = new Map(kegiatanList.map((k) => [k.id, k.tahunAnggaran]));
  const grupList = grupSemua
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((g) => ({ ...g, tahunAnggaran: tahunPerKegiatan.get(g.kegiatanId) ?? 0 }));

  const periodeLaporanTersedia = availablePeriods.map((p) => ({
    bulan: p.periodeBulan,
    tahun: p.periodeTahun,
  }));
  const tahunTersedia = daftarTahunFilter(
    kegiatanList.map((k) => k.tahunAnggaran),
    periodeLaporanTersedia.map((p) => p.tahun),
    currentYear,
  );
  const bulanOptions = opsiBulanFilter(tahunScope, periodeLaporanTersedia, nowMs);
  // Saat tabel kosong tanpa filter bulan/status: beri tahu tahun lain yang punya kegiatan.
  const petunjukTahun =
    totalFiltered === 0 && statusParam === "ALL" && !periodeAktif
      ? hitungPetunjukTahun(
          kegiatanList.map((k) => ({
            tahunAnggaran: k.tahunAnggaran,
            kode: k.kode,
            nama: k.nama,
            pjNama: k.pj?.name ?? "",
            pjEmail: k.pj?.email ?? "",
          })),
          q,
          tahunScope,
        )
      : [];
  const tahunOptions = [
    { value: TAHUN_SEMUA, label: "Semua Tahun" },
    ...tahunTersedia.map((t) => ({ value: String(t), label: String(t) })),
  ];

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
        grupList={grupList}
        tampilan={tampilan}
        stats={{ total: totalCount, sudah: sudahCount, belum: belumCount }}
        pagination={{
          page,
          totalPages,
          total: totalFiltered,
          pageSize: PAGE_SIZE,
        }}
        bulanOptions={bulanOptions}
        tahunOptions={tahunOptions}
        petunjukTahun={petunjukTahun}
        currentParams={{
          q: qRaw,
          bulan: periodeAktif ? String(periodeAktif.bulan) : "ALL",
          status: statusParam,
          tahun: tahunScopeValue(tahunScope),
        }}
      />
    </div>
  );
}
