"use client";

import React, { useState, useTransition } from "react";
import { Activity } from "@/types";
import { fmtRupiah, Icons } from "@/utils/formatters";
import { KpiCard, Badge, ProgressBar } from "./KpiCard";
import { Top5LowSerapanWidget } from "./Top5LowSerapanWidget";
import { DistribusiPaguWidget } from "./DistribusiPaguWidget";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationsWithActions, { type NotificationItem } from "@/components/ui/notifications-with-actions";
import { ingatkanPJ } from "@/features/arsip/actions";
import { showToast } from "@/components/ui/app-toast";
import { hitungKepatuhan } from "@/utils/dashboardAdmin";
import { NAMA_BULAN } from "@/utils/reportAccess";
import { formatJuta, type RekapTahunan, type SelRekap } from "@/utils/rekapTahunan";
import { pesanTahunAnggaranBelumDimulai } from "@/utils/tahunAnggaran";

type TabId = "serapan" | "trend" | "kegiatan" | "rekap";

interface BarDataPoint {
  name: string;
  apbn_real: number;
  non_real: number;
  apbn_pct: number;
  non_pct: number;
}

interface LineDataPoint {
  name: string;
  target: number;
  nilaiRealisasi: number | undefined;
}

interface AdminDashboardProps {
  activities: Activity[];
  categories: { name: string; colorKey: string }[];
  metrics: Record<string, { realLalu: number; realIni: number; sdPeriode: number; sisa: number; persentaseRealisasi: number }>;
  barData: BarDataPoint[];
  lineDataFull: LineDataPoint[];
  notifications: NotificationItem[];
  reportPeriod: { month: number; year: number };
  tahunOptions: number[];
  bulanOptions: { value: string; label: string }[];
  // Tahun anggaran yang dilihat belum dimulai (belum ada bulan yang berjalan).
  belumDimulai: boolean;
  // Tahun lain yang punya kegiatan; diisi hanya bila tahun yang dilihat kosong.
  petunjukTahun: { tahun: number; jumlah: number }[];
  rekap: RekapTahunan;
}

function simbolSel(sel: SelRekap): string {
  switch (sel.status) {
    case "sudah": return "✓";
    case "belum": return sel.terlambat ? "!" : "○";
    case "diblokir": return "–";
    default: return "·";
  }
}

function kelasSel(sel: SelRekap): string {
  switch (sel.status) {
    case "sudah": return "bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
    case "belum":
      return sel.terlambat
        ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
        : "bg-amber-50 text-amber-800 hover:bg-amber-100";
    case "diblokir": return "bg-slate-100 text-slate-500 hover:bg-slate-200";
    default: return "border border-dashed border-slate-200 text-slate-300 hover:bg-slate-50";
  }
}

function teksStatusSel(sel: SelRekap): string {
  switch (sel.status) {
    case "sudah": return "sudah lapor";
    case "belum":
      return sel.terlambat
        ? "belum lapor, batas waktu sudah lewat"
        : "belum lapor, batas waktu belum lewat";
    case "diblokir": return "kegiatan diblokir, bukan kewajiban lapor";
    case "tidak-wajib": return "kegiatan tidak ditetapkan wajib lapor";
    default: return "belum berjalan pada posisi ini";
  }
}

export function AdminDashboard({
  activities,
  categories,
  metrics,
  barData,
  lineDataFull,
  notifications,
  reportPeriod,
  tahunOptions,
  bulanOptions,
  belumDimulai,
  petunjukTahun,
  rekap,
}: AdminDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ubahPeriode = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const [activeTab, setActiveTab] = useState<TabId>("serapan");
  // Rekap tahunan: isi sel (status laporan atau nominal) dan sel yang sedang dilihat.
  const [isiSel, setIsiSel] = useState<"status" | "realisasi">("status");
  const [selDipilih, setSelDipilih] = useState<{ id: string; bulan: number } | null>(null);
  const [search, setSearch] = useState("");
  const [filterJenis, setFilterJenis] = useState<"ALL" | "APBN" | "NON-APBN">(
    "ALL",
  );
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalPagu = activities.reduce((a, b) => a + b.pagu, 0);
  const totalReal = activities.reduce((sum, activity) => sum + (metrics[activity.id]?.sdPeriode ?? 0), 0);
  // Kewajiban lapor: hanya kegiatan wajib yang sedang bisa melapor pada periode ini
  // (tidak diblokir, periodenya sudah berjalan).
  const {
    totalWajib,
    sudah: sudahLapor,
    belum: belumLapor,
  } = hitungKepatuhan(
    activities.map((a) => ({
      wajib: !!a.wajib,
      kepatuhan: a.kepatuhan ?? (a.sudahLapor ? "sudah" : "belum"),
    })),
  );
  const persenSerapan = totalPagu > 0 ? (totalReal / totalPagu) * 100 : 0;
  const sisaAnggaran = totalPagu - totalReal;

  const handleSendReminder = (item: Activity) => {
    if (!item.pj || item.kepatuhan !== "belum") return;
    setRemindingId(item.id);
    startTransition(async () => {
      const result = await ingatkanPJ(item.id, reportPeriod.month, reportPeriod.year);
      if (result.success) {
        showToast("success", `Pengingat terkirim ke ${item.pj}`);
      } else {
        showToast("error", result.error || "Gagal mengirim pengingat.");
      }
      setRemindingId(null);
    });
  };
  const filtered = activities.filter((a) => {
    const matchSearch =
      a.nama.toLowerCase().includes(search.toLowerCase()) ||
      a.kode.toLowerCase().includes(search.toLowerCase()) ||
      (a.pj && a.pj.toLowerCase().includes(search.toLowerCase()));
    const matchJenis = filterJenis === "ALL" || a.jenis === filterJenis;
    return matchSearch && matchJenis;
  });

  const tahunAnggaran = reportPeriod.year;
  const periodeLabel =
    barData.length > 0
      ? `${barData[0].name} – ${barData[barData.length - 1].name} ${tahunAnggaran}`
      : "-";
  const posisiLabel =
    barData.length > 0
      ? `Posisi per ${barData[barData.length - 1].name} ${tahunAnggaran}`
      : "-";

  const lastDataPoint = [...lineDataFull]
    .reverse()
    .find((d) => d.nilaiRealisasi !== undefined);
  const statusLabel = lastDataPoint
    ? `${lastDataPoint.nilaiRealisasi! >= lastDataPoint.target ? "On-Track" : "Perlu Percepatan"} (${lastDataPoint.nilaiRealisasi!.toFixed(1)}% vs ${lastDataPoint.target.toFixed(1)}%)`
    : "Belum ada data";

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
            Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Balai Besar Perakitan dan Modernisasi Sumber Daya Lahan Pertanian ·
            Tahun Anggaran {tahunAnggaran}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="Tahun anggaran"
            value={String(reportPeriod.year)}
            onChange={(e) => ubahPeriode({ tahun: e.target.value, bulan: null })}
            className="h-8 px-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer text-slate-700 font-medium"
          >
            {tahunOptions.map((tahun) => (
              <option key={tahun} value={tahun}>
                TA {tahun}
              </option>
            ))}
          </select>
          <select
            aria-label="Posisi per bulan"
            value={String(reportPeriod.month)}
            onChange={(e) => ubahPeriode({ bulan: e.target.value })}
            disabled={belumDimulai || bulanOptions.length === 0}
            className="h-8 px-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer text-slate-700 font-medium disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            {bulanOptions.length === 0 ? (
              <option value={String(reportPeriod.month)}>Belum dimulai</option>
            ) : (
              bulanOptions.map((b) => (
                <option key={b.value} value={b.value}>
                  Posisi per {b.label}
                </option>
              ))
            )}
          </select>
          <NotificationsWithActions items={notifications} />
          <Link
            href="/admin/master"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold transition cursor-pointer"
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d={Icons.users} />
            </svg>
            Kelola Kegiatan
          </Link>
          <Link
            href="/admin/cetak"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-md text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d={Icons.print} />
            </svg>
            Cetak Dokumen &amp; Laporan
          </Link>
        </div>
      </div>

      {belumDimulai && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {pesanTahunAnggaranBelumDimulai(tahunAnggaran)}
        </div>
      )}
      {activities.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span>
            Belum ada kegiatan untuk tahun anggaran {tahunAnggaran}.
            {petunjukTahun.length > 0 ? " Kegiatan tersedia di tahun:" : ""}
          </span>
          {petunjukTahun.map((p) => (
            <button
              key={p.tahun}
              type="button"
              onClick={() => ubahPeriode({ tahun: String(p.tahun), bulan: null })}
              className="px-2.5 py-1 text-[11px] font-semibold rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              {p.tahun} ({p.jumlah} kegiatan)
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Pagu Anggaran (DIPA)"
          value={fmtRupiah(totalPagu)}
          sub="APBN & PNBP/BLU Terdaftar"
          accent="#134B88"
          icon={Icons.dashboard}
        />
        <KpiCard
          label="Realisasi Anggaran"
          value={fmtRupiah(totalReal)}
          sub={`Realisasi %: ${persenSerapan.toFixed(1)}%`}
          accent="#236437"
          icon={Icons.excel}
        />
        <KpiCard
          label="Sisa Anggaran"
          value={fmtRupiah(sisaAnggaran)}
          sub={posisiLabel}
          accent="#E2A917"
          icon={Icons.consolidate}
        />
        <KpiCard
          label="Kepatuhan Laporan Kegiatan"
          value={
            belumDimulai ? "Belum dimulai" : `${sudahLapor} / ${totalWajib} Kegiatan`
          }
          sub={
            belumDimulai
              ? `Mulai Januari ${tahunAnggaran}`
              : `${belumLapor} Kegiatan Belum Lapor`
          }
          accent="#C0392B"
          icon={Icons.users}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-200/80 bg-slate-50/40">
          <div className="inline-flex p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
            {[
              { id: "serapan", label: "Monitoring Serapan Anggaran" },
              { id: "trend", label: "Analisis Trend & Kurva-S" },
              { id: "kegiatan", label: "Daftar Kegiatan & Kepatuhan PJ" },
              { id: "rekap", label: "Rekap Tahunan" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  setActiveTab(t.id as TabId)
                }
                className={`whitespace-nowrap cursor-pointer transition-all duration-150 ${
                  activeTab === t.id
                    ? "bg-white text-emerald-950 font-semibold shadow-sm rounded-lg px-4 py-2 text-xs"
                    : "text-slate-600 hover:text-slate-900 font-medium px-4 py-2 text-xs"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "serapan" && (
          <div className="p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 xl:col-span-8 bg-slate-50/70 rounded-xl p-5 sm:p-6 border border-slate-200 flex flex-col justify-between h-full min-h-[440px]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block mb-0.5">
                        SERAPAN REALISASI
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                        Realisasi Bulanan APBN vs Non-APBN
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                      {periodeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Total realisasi anggaran per bulan (bukan kumulatif)
                  </p>
                </div>

                <div className="flex-1 w-full min-h-[260px] my-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barData}
                      margin={{ top: 24, right: 16, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "#475569" }}
                        axisLine={{ stroke: "#cbd5e1" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, "auto"]}
                        tick={{ fontSize: 11, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                        label={{ value: "% Realisasi terhadap Pagu", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "#475569", fontSize: 11 } }}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                              <p className="mb-1 font-semibold text-slate-700">{label}</p>
                              {payload.map((entry) => {
                                const original = entry.dataKey === "apbn_pct"
                                  ? Number(entry.payload?.apbn_real ?? 0)
                                  : Number(entry.payload?.non_real ?? 0);
                                return (
                                  <p key={String(entry.dataKey)} style={{ color: entry.color }}>
                                    {entry.name}: {Number(entry.value ?? 0).toFixed(2)}% ({fmtRupiah(original)})
                                  </p>
                                );
                              })}
                            </div>
                          );
                        }}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                        }}
                      />
                      <Bar
                        dataKey="apbn_pct"
                        name="Realisasi APBN"
                        fill="#236437"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                      />
                      <Bar
                        dataKey="non_pct"
                        name="Realisasi Non-APBN"
                        fill="#134B88"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 pt-3 border-t border-slate-200/80 flex flex-wrap justify-center items-center gap-6 text-xs text-slate-600 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#236437]" />
                    <span>Realisasi APBN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#134B88]" />
                    <span>Realisasi Non-APBN</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 xl:col-span-4 h-full">
                <DistribusiPaguWidget activities={activities} categories={categories} metrics={metrics} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "trend" && (
          <div className="p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="bg-slate-50/60 rounded-lg p-5 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block mb-0.5">
                        TREN KUMULATIF
                      </span>
                      <h4 className="text-sm font-bold text-slate-800">
                        Kurva S Rencana Target vs Realisasi (%)
                      </h4>
                    </div>
                    <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/80">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    Realisasi kumulatif bulanan dibandingkan target rencana
                    kerja.
                  </p>
                  <p className="text-[10px] text-amber-700 mb-3">
                    ⚠ Garis target masih berupa asumsi linear (belum ada data
                    rencana pencairan resmi/RKAKL)
                  </p>
                </div>
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={lineDataFull}
                      margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        unit="%"
                        domain={[0, 100]}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const target = Number(payload.find((item) => item.dataKey === "target")?.value ?? 0);
                          const actual = Number(payload.find((item) => item.dataKey === "nilaiRealisasi")?.value ?? 0);
                          const gap = target - actual;
                          return (
                            <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                              <p className="mb-1 font-semibold text-slate-700">{label}</p>
                              <p>Realisasi Aktual (%): {actual.toFixed(1)}%</p>
                              <p>Target Linear (Asumsi): {target.toFixed(1)}%</p>
                              <p className={gap >= 0 ? "text-rose-700" : "text-emerald-700"}>
                                Gap: {gap >= 0 ? "-" : "+"}{Math.abs(gap).toFixed(1)} poin ({gap >= 0 ? "tertinggal dari target" : "di atas target"})
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="target"
                        name="Target Linear (Asumsi)"
                        stroke="#134B88"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="nilaiRealisasi"
                        name="Realisasi Aktual (%)"
                        stroke="#236437"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <Top5LowSerapanWidget activities={activities} metrics={metrics} />
            </div>
          </div>
        )}

        {activeTab === "kegiatan" && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Cari kode, kegiatan, atau PJ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d={Icons.search} />
                  </svg>
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={filterJenis}
                  onChange={(e) =>
                    setFilterJenis(
                      e.target.value as "ALL" | "APBN" | "NON-APBN",
                    )
                  }
                  className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-md font-medium text-slate-700"
                >
                  <option value="ALL">Semua Jenis Anggaran</option>
                  <option value="APBN">APBN Saja</option>
                  <option value="NON-APBN">NON-APBN Saja</option>
                </select>
                <Link
                  href="/admin/master"
                  className="h-9 px-3 text-xs font-semibold bg-emerald-800 text-white rounded-md hover:bg-emerald-900 transition whitespace-nowrap cursor-pointer inline-flex items-center justify-center"
                >
                  + Tambah Kegiatan
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto w-full border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">Kode & Kegiatan</th>
                    <th className="py-2.5 px-3">PJ Kegiatan</th>
                    <th className="py-2.5 px-3">Jenis</th>
                    <th className="py-2.5 px-3 text-right">Pagu</th>
                    <th className="py-2.5 px-3 text-right">Realisasi</th>
                    <th className="py-2.5 px-3">Serapan</th>
                    <th className="py-2.5 px-3 text-center">
                      Status Pelaporan
                    </th>
                                       <th className="py-2.5 px-3 text-center">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-slate-400"
                      >
                        Tidak ada kegiatan yang cocok dengan kriteria pencarian.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, idx) => {
                      const pct =
                        metrics[item.id]?.persentaseRealisasi ?? 0;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 transition"
                        >
                          <td className="py-2.5 px-3 text-slate-400 font-semibold">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 max-w-[240px]">
                            <span className="text-[11px] font-semibold text-emerald-800 font-mono block">
                              {item.kode}
                            </span>
                            <span className="font-medium text-slate-900 line-clamp-1">
                              {item.nama}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                            {item.pj || (
                              <span className="text-slate-400 italic">
                                Belum Ditugaskan
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              text={item.jenis}
                              color={item.jenis === "APBN" ? "blue" : "gold"}
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                            {fmtRupiah(item.pagu)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-800 whitespace-nowrap">
                            {fmtRupiah(metrics[item.id]?.sdPeriode ?? 0)}
                          </td>
                          <td className="py-2.5 px-3 min-w-[130px]">
                            <ProgressBar value={pct} color="#236437" />
                          </td><td className="py-2.5 px-3 text-center">
                            {item.kepatuhan === "diblokir" ? (
                              <Badge text="Diblokir" color="gray" />
                            ) : item.kepatuhan === "belum-berjalan" ? (
                              <Badge text="Belum dimulai" color="gray" />
                            ) : (
                              <Badge
                                text={
                                  item.sudahLapor ? "Sudah Lapor" : "Belum Lapor"
                                }
                                color={item.sudahLapor ? "green" : "red"}
                              />
                            )}
                          </td><td className="py-2.5 px-3 text-center">
                             {item.kepatuhan === "belum" && item.pj ? (
                               <button
                                 type="button"
                                 onClick={() => handleSendReminder(item)}
                                 disabled={isPending && remindingId === item.id}
                                 className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-2xs transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                               >
                                 {isPending && remindingId === item.id ? (
                                   <>
                                     <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-800/40 border-t-amber-800" />
                                     Mengirim...
                                   </>
                                 ) : (
                                   "Ingatkan PJ"
                                 )}
                               </button>
                             ) : null}
                           </td>
                         </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === "rekap" && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-md bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">Pagu TA {tahunAnggaran}</div>
                <div className="text-base font-semibold text-slate-800">{fmtRupiah(rekap.ringkasan.pagu)}</div>
                <div className="text-[11px] text-slate-500">{rekap.baris.length} kegiatan</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">Realisasi {belumDimulai ? "" : `s.d. ${NAMA_BULAN[reportPeriod.month - 1]}`}</div>
                <div className="text-base font-semibold text-slate-800">{fmtRupiah(rekap.ringkasan.realisasi)}</div>
                <div className="text-[11px] text-slate-500">
                  Serapan {rekap.ringkasan.serapan.toFixed(1).replace(".", ",")}%, sisa {fmtRupiah(rekap.ringkasan.sisa)}
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">Kepatuhan setahun</div>
                <div className="text-base font-semibold text-slate-800">
                  {rekap.ringkasan.persenKepatuhan === null
                    ? "—"
                    : `${rekap.ringkasan.terpenuhi} dari ${rekap.ringkasan.kewajiban}`}
                </div>
                <div className="text-[11px] text-slate-500">
                  {rekap.ringkasan.persenKepatuhan === null
                    ? "belum ada kewajiban"
                    : `${rekap.ringkasan.persenKepatuhan.toFixed(1).replace(".", ",")}% kewajiban bulanan terpenuhi`}
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">Terlambat</div>
                <div className={`text-base font-semibold ${rekap.ringkasan.terlambat > 0 ? "text-rose-700" : "text-slate-800"}`}>
                  {rekap.ringkasan.terlambat}
                </div>
                <div className="text-[11px] text-slate-500">kewajiban belum dilaporkan</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-700">
                  Rekap tahunan TA {tahunAnggaran}
                  {belumDimulai ? ", belum dimulai" : `, posisi per ${NAMA_BULAN[reportPeriod.month - 1]}`}
                </span>
                <div role="group" aria-label="Isi sel" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium">
                  {(
                    [
                      { nilai: "status", label: "Status laporan" },
                      { nilai: "realisasi", label: "Realisasi (juta Rp)" },
                    ] as const
                  ).map((opsi) => (
                    <button
                      key={opsi.nilai}
                      type="button"
                      aria-pressed={isiSel === opsi.nilai}
                      onClick={() => setIsiSel(opsi.nilai)}
                      className={`px-3 py-1 cursor-pointer transition ${
                        isiSel === opsi.nilai ? "bg-emerald-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {opsi.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" aria-label="Rekap tahunan kegiatan per bulan">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left font-medium px-3 py-2 min-w-[160px]">Kegiatan</th>
                      {NAMA_BULAN.map((bulan) => (
                        <th key={bulan} className="font-medium px-0.5 py-2 text-center">{bulan.slice(0, 3)}</th>
                      ))}
                      <th className="font-medium px-2 py-2 text-center">Lapor</th>
                      <th className="font-medium px-2 py-2 text-center">Serap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rekap.baris.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="py-8 text-center text-slate-400">
                          Belum ada kegiatan untuk tahun anggaran {tahunAnggaran}.
                        </td>
                      </tr>
                    ) : (
                      rekap.baris.map((baris) => (
                        <tr key={baris.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-800 truncate max-w-[200px]" title={baris.nama}>{baris.nama}</div>
                            <div className="font-mono text-[10px] text-slate-400">{baris.kode}</div>
                          </td>
                          {baris.sel.map((sel) => {
                            const dipilih = selDipilih?.id === baris.id && selDipilih.bulan === sel.bulan;
                            return (
                              <td key={sel.bulan} className="px-0.5 py-1">
                                <button
                                  type="button"
                                  onClick={() => setSelDipilih({ id: baris.id, bulan: sel.bulan })}
                                  aria-label={`${baris.nama}, ${NAMA_BULAN[sel.bulan - 1]}: ${teksStatusSel(sel)}`}
                                  className={`w-full min-w-[26px] h-6 rounded text-[11px] cursor-pointer ${kelasSel(sel)} ${dipilih ? "ring-2 ring-emerald-700" : ""}`}
                                >
                                  {isiSel === "realisasi" && sel.status === "sudah" && sel.realisasi !== null
                                    ? formatJuta(sel.realisasi)
                                    : simbolSel(sel)}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center text-slate-700">{baris.terpenuhi}/{baris.kewajiban}</td>
                          <td className="px-2 py-1.5 text-center text-slate-700">{baris.serapan.toFixed(1).replace(".", ",")}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {isiSel === "realisasi" && rekap.baris.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-200 font-medium text-slate-700">
                        <td className="px-3 py-2">Total bulan</td>
                        {rekap.totalPerBulan.map((total, i) => (
                          <td key={i} className="px-0.5 py-2 text-center">{total > 0 ? formatJuta(total) : ""}</td>
                        ))}
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-700 min-h-[40px]">
                {(() => {
                  const baris = selDipilih ? rekap.baris.find((b) => b.id === selDipilih.id) : undefined;
                  const sel = baris && selDipilih ? baris.sel.find((s) => s.bulan === selDipilih.bulan) : undefined;
                  if (!baris || !sel || !selDipilih) {
                    return <span className="text-slate-400">Klik sebuah sel untuk melihat detailnya.</span>;
                  }
                  return (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        <b className="font-semibold">{baris.nama}</b>, {NAMA_BULAN[sel.bulan - 1]} {tahunAnggaran}: {teksStatusSel(sel)}
                        {sel.status === "sudah" && sel.realisasi !== null ? `, realisasi ${fmtRupiah(sel.realisasi)}` : ""}.
                      </span>
                      {sel.status !== "belum-berjalan" && (
                        <Link
                          href={`/admin/arsip-sp2d?tahun=${tahunAnggaran}&bulan=${sel.bulan}&q=${encodeURIComponent(baris.kode)}`}
                          className="font-semibold text-emerald-800 hover:underline"
                        >
                          Lihat di Arsip
                        </Link>
                      )}
                    </span>
                  );
                })()}
              </div>

              <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span><b className="text-emerald-800">✓</b> Sudah lapor</span>
                <span><b className="text-rose-700">!</b> Belum lapor, terlambat</span>
                <span><b className="text-amber-800">○</b> Belum lapor, belum jatuh tempo</span>
                <span><b className="text-slate-500">–</b> Diblokir, tidak dihitung</span>
                <span><b className="text-slate-400">·</b> Belum berjalan atau tidak wajib</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}






