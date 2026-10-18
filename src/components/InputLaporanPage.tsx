"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui/app-toast";
import { fmtRupiah } from "@/utils/formatters";
import { submitLaporan } from "@/features/laproran/actions";
import { canSubmitReport } from "@/utils/reportAccess";
import {
  formatReportDeadline,
  getReportDeadline,
  isReportDeadlinePassed,
} from "@/utils/reportDeadline";

type KegiatanForInput = {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  pagu: number;
  statusAnggaran: "Dibuka" | "Diblokir";
  uraian: string;
  realLalu: number;
  realIni: number;
  programCategory?: {
    id: string;
    name: string;
    sortOrder: number;
    colorKey: string | null;
    isActive: boolean;
  };
};

type SessionUser = {
  id: string;
  nama: string;
  email: string;
  nip: string;
  jabatan: string;
};

type LaporanHistoryItem = {
  kegiatanId: string;
  periodeBulan: number;
  periodeTahun: number;
  realIni: number;
  uraian: string;
};

interface InputLaporanPageProps {
  kegiatanList: KegiatanForInput[];
  initialSelectedKode: string;
  sessionUser: SessionUser;
  laporanHistory: LaporanHistoryItem[];
  deadline: { day: number; time: string };
  accessOverrides: {
    kegiatanId: string;
    periodeBulan: number;
    periodeTahun: number;
    openedUntil: number;
  }[];
  serverNow: number;
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function generatePeriodeOptions(nowMs: number) {
  const wibNow = new Date(nowMs + 7 * 60 * 60 * 1000);
  const tahun = wibNow.getUTCFullYear();
  const bulanSekarang = wibNow.getUTCMonth() + 1;
  return Array.from({ length: bulanSekarang }, (_, index) => {
    const bulan = bulanSekarang - index;
    return { label: `${NAMA_BULAN[bulan - 1]} ${tahun}`, bulan, tahun };
  });
}

export function InputLaporanPage({
  kegiatanList,
  initialSelectedKode,
  sessionUser,
  laporanHistory,
  deadline,
  accessOverrides,
  serverNow,
}: InputLaporanPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodeIndex, setPeriodeIndex] = useState(0);
  const [clientNow, setClientNow] = useState(serverNow);
  const [selectedKode, setSelectedKode] = useState(initialSelectedKode);
  const [uraian, setUraian] = useState("");
  const [realIni, setRealIni] = useState("0");

  const periodeOptions = useMemo(
    () => generatePeriodeOptions(serverNow),
    [serverNow],
  );
  const periode = periodeOptions[periodeIndex] ?? periodeOptions[0];
  const activeKegiatan =
    kegiatanList.find((kegiatan) => kegiatan.kode === selectedKode) ?? kegiatanList[0];

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const calc = useMemo(() => {
    const reports = laporanHistory.filter(
      (laporan) => laporan.kegiatanId === activeKegiatan.id,
    );
    const isBefore = (bulan: number, tahun: number) =>
      tahun < periode.tahun ||
      (tahun === periode.tahun && bulan < periode.bulan);
    const isSame = (bulan: number, tahun: number) =>
      bulan === periode.bulan && tahun === periode.tahun;
    const priorReports = reports.filter((laporan) =>
      isBefore(laporan.periodeBulan, laporan.periodeTahun),
    );
    const existingLaporan = reports.find((laporan) =>
      isSame(laporan.periodeBulan, laporan.periodeTahun),
    );
    const otherReports = reports.filter(
      (laporan) => !isSame(laporan.periodeBulan, laporan.periodeTahun),
    );
    return {
      realLalu: priorReports.reduce((sum, laporan) => sum + laporan.realIni, 0),
      totalUsedByOtherPeriods: otherReports.reduce(
        (sum, laporan) => sum + laporan.realIni,
        0,
      ),
      existingLaporan,
    };
  }, [activeKegiatan.id, laporanHistory, periode]);

  const reportDeadline = getReportDeadline(periode.tahun, periode.bulan, deadline);
  const deadlinePassed = isReportDeadlinePassed(
    periode.tahun,
    periode.bulan,
    deadline,
    new Date(clientNow),
  );
  // Admin dapat membuka akses lapor untuk kegiatan dan bulan ini walau batas waktu sudah lewat.
  const aksesDibuka = accessOverrides.find(
    (a) =>
      a.kegiatanId === activeKegiatan.id &&
      a.periodeBulan === periode.bulan &&
      a.periodeTahun === periode.tahun,
  );
  const accessActive = Boolean(aksesDibuka) &&
    canSubmitReport({ deadlinePassed: true, access: aksesDibuka, now: clientNow });
  const isReadOnly = !canSubmitReport({
    deadlinePassed,
    access: aksesDibuka,
    now: clientNow,
  });
  const isRevision = Boolean(calc.existingLaporan);
  const isBlocked = activeKegiatan.statusAnggaran === "Diblokir";
  const paguNum = activeKegiatan.pagu;
  const isFullyAbsorbed =
    paguNum > 0 && calc.totalUsedByOtherPeriods >= paguNum;
  const maxAllowedIni = Math.max(
    0,
    paguNum - calc.totalUsedByOtherPeriods,
  );
  const iniNum = Number(realIni) || 0;
  const exceedsRemaining = iniNum > maxAllowedIni;

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (calc.existingLaporan) {
      setUraian(calc.existingLaporan.uraian);
      setRealIni(
        isFullyAbsorbed ? "0" : String(calc.existingLaporan.realIni),
      );
      return;
    }
    setUraian("");
    setRealIni("0");
  }, [calc, isBlocked, isFullyAbsorbed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = () => {
    if (isReadOnly) {
      showToast(
        "error",
        "Laporan terkunci",
        `Batas waktu pelaporan periode ini sudah lewat pada ${formatReportDeadline(reportDeadline)}. Hubungi admin untuk meminta akses lapor.`,
      );
      return;
    }
    if (!uraian.trim()) {
      showToast("error", "Data belum lengkap", "Uraian kegiatan wajib diisi.");
      return;
    }
    startTransition(async () => {
      const result = await submitLaporan({
        kegiatanId: activeKegiatan.id,
        periodeBulan: periode.bulan,
        periodeTahun: periode.tahun,
        uraian,
        realIni: iniNum,
      });
      if (!result.success) {
        showToast("error", "Laporan gagal disimpan", result.error);
        return;
      }
      showToast(
        "success",
        "Laporan tersimpan",
        `Laporan realisasi untuk "${activeKegiatan.kode}" periode ${periode.label} berhasil disimpan.`,
      );
      router.refresh();
    });
  };

  const sdPeriode = calc.realLalu + iniNum;
  const pctSd = paguNum > 0 ? ((sdPeriode / paguNum) * 100).toFixed(1) : "0.0";
  const sisaSebenarnya = Math.max(
    0,
    paguNum - calc.totalUsedByOtherPeriods - iniNum,
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-800 sm:text-xl">
          Input Laporan
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Formulir pelaporan berkala resmi Kementerian Pertanian
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-xs">
        <div className="max-w-5xl space-y-6 p-5 sm:p-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
              <span className="h-3.5 w-1.5 rounded-xs bg-[#E28B59]" />
              1. Identitas Kegiatan, Status Anggaran &amp; Penanggung Jawab (PJ)
            </div>
            {isRevision && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                Anda sedang merevisi laporan yang sudah pernah disubmit sebelumnya untuk periode ini.
              </div>
            )}
            {!isRevision && !isReadOnly && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                Anda sedang membuat laporan baru untuk periode ini.
              </div>
            )}
            {isReadOnly && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Batas waktu pelaporan periode ini sudah lewat pada {formatReportDeadline(reportDeadline)}. Hubungi admin untuk meminta akses lapor.
              </div>
            )}
            {deadlinePassed && accessActive && aksesDibuka && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                Batas waktu periode ini sudah lewat, tetapi admin membuka akses lapor untuk Anda sampai {formatReportDeadline(new Date(aksesDibuka.openedUntil))}.
              </div>
            )}
            {isBlocked && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <strong>Kegiatan ini sedang diblokir oleh admin.</strong> Pelaporan tidak dapat dilakukan sampai status anggaran dibuka kembali. Silakan hubungi admin.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <label className="space-y-1 sm:col-span-6">
                <span className="block text-xs font-semibold text-slate-700">Pilih Kegiatan Yang Dilaporkan *</span>
                <select
                  value={selectedKode}
                  onChange={(event) => setSelectedKode(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#E28B59]"
                >
                  {kegiatanList.map((kegiatan) => (
                    <option key={kegiatan.kode} value={kegiatan.kode}>
                      [{kegiatan.jenis}] {kegiatan.kode} — {kegiatan.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-3">
                <span className="block text-xs font-semibold text-slate-700">Periode Pelaporan *</span>
                <select
                  value={periodeIndex}
                  onChange={(event) => setPeriodeIndex(Number(event.target.value))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#E28B59]"
                >
                  {periodeOptions.map((item, index) => (
                    <option key={item.label} value={index}>{item.label}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-1 sm:col-span-3">
                <span className="block text-xs font-semibold text-slate-700">Status Anggaran</span>
                <div className={`flex h-9 items-center justify-center rounded-md border text-xs font-bold ${isBlocked ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                  ● {activeKegiatan.statusAnggaran}
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#143D32] text-xs font-bold text-white">
                  {sessionUser.nama.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900">{sessionUser.nama}</span>
                  <p className="text-[11px] text-slate-500">NIP: {sessionUser.nip} · {sessionUser.email}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700">Tervalidasi Otomatis dari Sesi Login</span>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
              <span className="h-3.5 w-1.5 rounded-xs bg-[#E28B59]" />
              2. Realisasi Capaian Kegiatan
            </div>
            <label className="block space-y-1">
              <span className="block text-xs font-semibold text-slate-700">Uraian Kegiatan Periode Ini *</span>
              <textarea
                rows={3}
                value={uraian}
                onChange={(event) => setUraian(event.target.value)}
                disabled={isReadOnly || isBlocked}
                placeholder="Deskripsikan realisasi keuangan, output kegiatan, dan kendala/tindak lanjut..."
                className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#E28B59] disabled:bg-slate-100"
              />
            </label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
              <span className="h-3.5 w-1.5 rounded-xs bg-[#E28B59]" />
              3. Rincian Keuangan &amp; Realisasi Anggaran
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Pagu Anggaran (DIPA)</span>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{fmtRupiah(paguNum)}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Realisasi Periode Lalu</span>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{fmtRupiah(calc.realLalu)}</p>
              </div>
              <label className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <span className="block text-[10px] font-bold uppercase text-amber-900">Realisasi Periode Ini (Rp)</span>
                <input
                  type="number"
                  value={realIni}
                  onChange={(event) => setRealIni(event.target.value)}
                  disabled={isReadOnly || isBlocked || isFullyAbsorbed}
                  className="mt-1 h-8 w-full rounded border border-amber-300 bg-white px-2.5 text-xs font-mono font-bold text-slate-900 disabled:bg-slate-100"
                />
                <span className="mt-1 block text-[10px] text-amber-800">Maksimal: {fmtRupiah(maxAllowedIni)}</span>
              </label>
            </div>
            {exceedsRemaining && <p className="text-xs font-semibold text-rose-600">Melebihi batas periode ini ({fmtRupiah(maxAllowedIni)}).</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border-2 border-emerald-600/30 bg-white p-3"><p className="text-[10px] font-bold uppercase text-emerald-800">Realisasi s.d. Periode</p><p className="mt-1 text-base font-bold text-emerald-950">{fmtRupiah(sdPeriode)}</p></div>
              <div className="rounded-lg border-2 border-emerald-600/30 bg-white p-3"><p className="text-[10px] font-bold uppercase text-emerald-800">% Realisasi Anggaran</p><p className="mt-1 text-base font-bold text-emerald-950">{pctSd}%</p></div>
              <div className="rounded-lg border-2 border-slate-300 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-700">Sisa Anggaran</p><p className="mt-1 text-base font-bold text-slate-900">{fmtRupiah(sisaSebenarnya)}</p></div>
            </div>
          </section>

          <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
            <span className="text-xs text-slate-500">Laporan tercatat atas nama <strong>{sessionUser.nama}</strong> untuk periode <strong>{periode.label}</strong>.</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isReadOnly || isBlocked || isPending || exceedsRemaining}
              className="rounded-md bg-[#E28B59] px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#d47c4a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Menyimpan..." : "Simpan & Kirim Laporan Realisasi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
