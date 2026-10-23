"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { generateSmartReportExcel } from "@/utils/excelExport";
import { Icons } from "@/utils/formatters";
import { deleteLaporan, ingatkanPJ } from "@/features/arsip/actions";
import { bukaAksesLapor, cabutAksesLapor } from "@/features/akses-lapor/actions";
import { getReminderMode } from "@/utils/reportAccess";

export interface ArsipItem {
  id: string;
  kegiatanId: string;
  laporanId: string | null;
  kode: string;
  nama: string;
  periode: string;
  periodeBulan: number;
  periodeTahun: number;
  jenis: string;
  pjNama: string;
  pjEmail: string;
  waktuUpload: string;
  // Waktu revisi terakhir bila laporan pernah dikirim ulang.
  waktuRevisi?: string | null;
  status: "SUDAH_UPLOAD" | "BELUM_UPLOAD";
  pagu: number;
  realisasi: number;
  realIni: number;
  fisik: number;
  statusAnggaran: string;
  uraian?: string | null;
  // Diisi oleh halaman arsip: apakah batas waktu periode ini sudah lewat, dan
  // akses lapor yang sedang dibuka admin (bila ada).
  deadlinePassed?: boolean;
  aksesId?: string | null;
  aksesSampai?: string | null;
}

interface MasterArsipSMARTPageProps {
  arsipList: ArsipItem[];
  stats: {
    total: number;
    sudah: number;
    belum: number;
  };
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
  };
  periodOptions: { value: string; label: string }[];
  currentParams: {
    q: string;
    periode: string;
    status: string;
  };
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export function MasterArsipSMARTPage({
  arsipList,
  stats,
  pagination,
  periodOptions,
  currentParams,
}: MasterArsipSMARTPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(currentParams.q);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // Deletion Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ArsipItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [allowRefill, setAllowRefill] = useState(true);

  // Modal Buka Akses Lapor
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessItem, setAccessItem] = useState<ArsipItem | null>(null);
  const [accessDays, setAccessDays] = useState("3");
  const [accessReason, setAccessReason] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const updateQueryParams = (
    updates: Record<string, string | number | null>,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === "" || val === "ALL") {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    });
    router.push(`${pathname}?${params.toString()}`);
  };

  // Debounced Search Input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentParams.q) {
        updateQueryParams({ q: searchInput.trim() || null, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const openDeleteModal = (item: ArsipItem) => {
    setSelectedItem(item);
    setDeleteReason("");
    setAllowRefill(true);
    setDeleteModalOpen(true);
  };

  // Pengisian ulang hanya relevan bila batas waktu sudah lewat.
  // Bila batas waktu belum lewat, PJ memang masih bisa mengisi ulang tanpa akses khusus.
  const refillApplicable = Boolean(selectedItem?.deadlinePassed);

  const handleConfirmDelete = () => {
    if (!selectedItem || !selectedItem.laporanId) return;
    if (!deleteReason.trim()) {
      toast.error("Alasan penghapusan wajib diisi.");
      return;
    }

    startTransition(async () => {
      const res = await deleteLaporan(
        selectedItem.laporanId!,
        deleteReason.trim(),
        refillApplicable && allowRefill,
      );
      if (res.success) {
        toast.success(
          `Laporan "${selectedItem.nama}" periode ${selectedItem.periode} berhasil dihapus.` +
            (res.aksesDibukaSampai
              ? ` PJ dapat mengisi ulang sampai ${res.aksesDibukaSampai}.`
              : ""),
        );
        setDeleteModalOpen(false);
        setSelectedItem(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus laporan.");
      }
    });
  };

  const openAccessModal = (item: ArsipItem) => {
    setAccessItem(item);
    setAccessDays("3");
    setAccessReason("");
    setAccessModalOpen(true);
  };

  const handleConfirmAccess = () => {
    if (!accessItem) return;
    if (accessReason.trim().length < 5) {
      toast.error("Alasan wajib diisi (minimal 5 karakter).");
      return;
    }
    startTransition(async () => {
      const res = await bukaAksesLapor({
        kegiatanId: accessItem.kegiatanId,
        periodeBulan: accessItem.periodeBulan,
        periodeTahun: accessItem.periodeTahun,
        durasiHari: Number(accessDays),
        alasan: accessReason.trim(),
      });
      if (res.success) {
        toast.success(res.message);
        setAccessModalOpen(false);
        setAccessItem(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleRevokeAccess = (item: ArsipItem) => {
    if (!item.aksesId) return;
    const accessId = item.aksesId;
    setRevokingId(item.id);
    startTransition(async () => {
      const res = await cabutAksesLapor(accessId);
      if (res.success) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setRevokingId(null);
    });
  };

  // Jenis pengingat yang masuk akal untuk baris ini (lihat getReminderMode).
  const reminderModeOf = (item: ArsipItem) =>
    getReminderMode({
      hasReport: item.status === "SUDAH_UPLOAD",
      deadlinePassed: Boolean(item.deadlinePassed),
      accessActive: Boolean(item.aksesId),
    });

  const handleSendReminder = (item: ArsipItem) => {
    setRemindingId(item.id);
    startTransition(async () => {
      const res = await ingatkanPJ(item.kegiatanId, item.periodeBulan, item.periodeTahun);
      if (res.success) {
        toast.success(
          res.message || `Email pengingat berhasil dikirim ke ${item.pjNama}!`,
        );
      } else {
        toast.error(res.error || "Gagal mengirim email pengingat.");
      }
      setRemindingId(null);
    });
  };

  const handleDownloadExcel = async (item: ArsipItem) => {
    await generateSmartReportExcel([{
      no: 1,
      kode: item.kode,
      nama: item.nama,
      jenis: item.jenis === "APBN" ? "Dibuka" : "Dibuka",
      pj: item.pjNama,
      uraian: item.uraian || "-",
      pagu: item.pagu,
      statusAnggaran: item.statusAnggaran === "DIBLOKIR" ? "Diblokir" : "Dibuka",
      realLalu: item.realisasi - item.realIni,
      realIni: item.realIni,
      realSd: item.realisasi,
      pct: item.pagu > 0 ? (item.realisasi / item.pagu) * 100 : 0,
      sisa: item.pagu - item.realisasi,
    }], item.periode, `Laporan_${item.kode.replace(/[^a-zA-Z0-9]/g, "_")}_${item.periode.replace(/\s+/g, "_")}.xlsx`);
    toast.success(`Mengunduh berkas laporan ${item.kode}`);
  };

  return (
    <div className="space-y-5">
      {/* ── Top Header ── */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
            Arsip
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Repositori terpusat berkas laporan realisasi yang diunggah
            oleh seluruh PJ Kegiatan
          </p>
        </div>
        <Link
          href="/admin/log-audit"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d={Icons.shield} />
          </svg>
          Lihat Log Audit Penghapusan
        </Link>
      </div>

      {/* ── Stats Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            TOTAL ARSIP
          </p>
          <p className="text-2xl font-black text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
            SUDAH TERUNGGAH
          </p>
          <p className="text-2xl font-black text-emerald-600">{stats.sudah}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-1">
            BELUM DIUNGGAH
          </p>
          <p className="text-2xl font-black text-rose-600">{stats.belum}</p>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Cari kode, nama kegiatan, atau pengunggah..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <path d={Icons.search} />
            </svg>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={currentParams.periode}
              onChange={(e) =>
                updateQueryParams({ periode: e.target.value, page: 1 })
              }
              className="h-8.5 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer text-slate-700 font-medium"
            >
              <option value="ALL">Semua Periode</option>
              {periodOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={currentParams.status}
              onChange={(e) =>
                updateQueryParams({ status: e.target.value, page: 1 })
              }
              className="h-8.5 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer text-slate-700 font-medium"
            >
              <option value="ALL">Semua Status</option>
              <option value="SUDAH_UPLOAD">Sudah Upload</option>
              <option value="BELUM_UPLOAD">Belum Upload</option>
            </select>
          </div>
        </div>

        {/* ── Table Matching Screenshot ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">NO</th>
                <th className="py-3 px-4">KODE & KEGIATAN</th>
                <th className="py-3 px-4">PERIODE</th>
                <th className="py-3 px-4">JENIS</th>
                <th className="py-3 px-4">PENGUNGGAH (PJ)</th>
                <th className="py-3 px-4">WAKTU UPLOAD</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {arsipList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Tidak ada data arsip yang sesuai kriteria pencarian.
                  </td>
                </tr>
              ) : (
                arsipList.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 text-slate-400 font-semibold text-center">
                      {(pagination.page - 1) * pagination.pageSize + idx + 1}
                    </td>
                    <td className="py-3 px-4 max-w-[280px]">
                      <span className="font-mono font-bold text-emerald-800 text-[11px] block">
                        {item.kode}
                      </span>
                      <span
                        className="font-medium text-slate-900 block truncate"
                        title={item.nama}
                      >
                        {item.nama}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700 font-medium">
                      {item.periode}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.jenis === "APBN"
                            ? "bg-sky-50 text-sky-800 border-sky-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {item.jenis}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">
                        {item.pjNama}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {item.pjEmail}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {item.waktuUpload}
                      {item.waktuRevisi && (
                        <div className="mt-0.5 text-[10.5px] font-semibold text-amber-700">
                          Direvisi {item.waktuRevisi}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.status === "SUDAH_UPLOAD" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Sudah Upload
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Belum Upload
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.status === "SUDAH_UPLOAD" ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleDownloadExcel(item)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded transition cursor-pointer"
                            title="Unduh Berkas Laporan (.xlsx)"
                          >
                            <svg
                              width={14}
                              height={14}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d={Icons.download} />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteModal(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition cursor-pointer"
                            title="Hapus Dokumen Laporan"
                          >
                            <svg
                              width={14}
                              height={14}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d={Icons.trash} />
                            </svg>
                          </button>
                        </div>
                      ) : reminderModeOf(item) === "none" ? null : (
                        <button
                          onClick={() => handleSendReminder(item)}
                          disabled={isPending && remindingId === item.id}
                          title="Kirim pengingat ke PJ."
                          className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                        >
                          {isPending && remindingId === item.id ? (
                            <>
                              <span className="w-2.5 h-2.5 border-2 border-amber-800/40 border-t-amber-800 rounded-full animate-spin" />
                              <span>Mengirim...</span>
                            </>
                          ) : (
                            <span>Ingatkan PJ</span>
                          )}
                        </button>
                      )}
                      {item.aksesId ? (
                        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10.5px]">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                            Akses dibuka s.d. {item.aksesSampai}
                          </span>
                          <button
                            onClick={() => handleRevokeAccess(item)}
                            disabled={isPending && revokingId === item.id}
                            className="px-2 py-0.5 font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded transition cursor-pointer disabled:opacity-50"
                          >
                            {isPending && revokingId === item.id ? "Mencabut..." : "Cabut"}
                          </button>
                        </div>
                      ) : item.deadlinePassed ? (
                        <div className="mt-1.5 flex flex-col items-center gap-1">
                          {item.status === "BELUM_UPLOAD" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Terlambat
                            </span>
                          )}
                          <button
                            onClick={() => openAccessModal(item)}
                            className="px-2.5 py-1 text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-300 hover:bg-sky-100 rounded-md transition cursor-pointer shadow-2xs"
                            title="Batas waktu sudah lewat. Buka akses lapor untuk PJ."
                          >
                            Buka Akses
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className="p-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50">
          <span>
            Menampilkan <b className="text-slate-800">{arsipList.length}</b>{" "}
            dari <b className="text-slate-800">{pagination.total}</b> total
            berkas
          </span>

          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => updateQueryParams({ page: pagination.page - 1 })}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                aria-label="Halaman sebelumnya"
              >
                ‹
              </button>

              {getPageNumbers(pagination.page, pagination.totalPages).map(
                (p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-2 text-xs text-slate-400 select-none"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => updateQueryParams({ page: p })}
                      className={`min-w-7.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border cursor-pointer transition ${
                        p === pagination.page
                          ? "bg-emerald-800 border-emerald-800 text-white"
                          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                      aria-current={p === pagination.page ? "page" : undefined}
                    >
                      {p}
                    </button>
                  ),
              )}

              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => updateQueryParams({ page: pagination.page + 1 })}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                aria-label="Halaman berikutnya"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Buka Akses Lapor ── */}
      {accessModalOpen && accessItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Buka Akses Lapor?
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Batas waktu periode <strong>{accessItem.periode}</strong> sudah
                lewat. Dengan membuka akses, PJ bisa mengirim atau merevisi
                laporan periode ini untuk sementara. Setelah waktunya habis,
                akses menutup sendiri. Tindakan ini dicatat di Log Audit.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1 text-xs text-slate-700">
              <p>
                <strong>Kegiatan:</strong> {accessItem.kode} - {accessItem.nama}
              </p>
              <p>
                <strong>Penanggung Jawab:</strong> {accessItem.pjNama} (
                {accessItem.pjEmail})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Dibuka selama
              </label>
              <select
                value={accessDays}
                onChange={(e) => setAccessDays(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1">1 hari</option>
                <option value="3">3 hari</option>
                <option value="7">7 hari</option>
                <option value="14">14 hari</option>
                <option value="30">30 hari</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Alasan <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={accessReason}
                onChange={(e) => setAccessReason(e.target.value)}
                placeholder="Contoh: PJ sedang dinas luar kota, laporan SP2D perlu dilengkapi..."
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAccessModalOpen(false)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAccess}
                disabled={isPending || accessReason.trim().length < 5}
                className="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                {isPending && (
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {isPending ? "Membuka..." : "Ya, Buka Akses"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Hapus Laporan dengan Alasan Audit Log ── */}
      {deleteModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full shrink-0">
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d={Icons.trash} />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Hapus Berkas Laporan?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tindakan ini akan menghapus data laporan periode{" "}
                  <strong>{selectedItem.periode}</strong> dan dicatat ke dalam
                  Log Audit Penghapusan.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1 text-xs text-slate-700">
              <p>
                <strong>Kegiatan:</strong> {selectedItem.kode} -{" "}
                {selectedItem.nama}
              </p>
              <p>
                <strong>Penanggung Jawab:</strong> {selectedItem.pjNama} (
                {selectedItem.pjEmail})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Alasan Penghapusan <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Contoh: Salah input data SP2D oleh PJ, perlu perbaikan berkas..."
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            {selectedItem?.aksesSampai && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                Akses lapor periode ini masih dibuka sampai{" "}
                <strong>{selectedItem.aksesSampai}</strong>.{" "}
                {allowRefill && refillApplicable
                  ? "Akses akan diperbarui menjadi 7 hari dari sekarang."
                  : "Karena PJ tidak diizinkan mengisi ulang, akses ini akan ditutup."}
              </p>
            )}
            {refillApplicable ? (
              <label className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowRefill}
                  onChange={(e) => setAllowRefill(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
                />
                <span>
                  <strong>Izinkan PJ mengisi ulang.</strong> Batas waktu periode ini
                  sudah lewat, jadi akses lapor dibuka selama 7 hari agar PJ bisa
                  mengirim laporan pengganti.
                </span>
              </label>
            ) : (
              <p className="text-[11px] text-slate-500">
                PJ masih dapat mengisi ulang laporan ini selama batas waktu
                periodenya belum lewat.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending || !deleteReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                {isPending && (
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {isPending ? "Menghapus..." : "Ya, Hapus & Catat Log"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
