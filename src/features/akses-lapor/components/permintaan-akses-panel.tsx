"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setujuiPermintaanAkses,
  tolakPermintaanAkses,
} from "@/features/akses-lapor/actions";

export interface PermintaanAksesItem {
  id: string;
  kode: string;
  nama: string;
  periode: string;
  pjNama: string;
  pjEmail: string;
  alasan: string;
  dibuatPada: string;
}

// Daftar permintaan akses lapor dari PJ yang menunggu keputusan admin.
// Tidak menampilkan apa pun bila tidak ada permintaan.
export function PermintaanAksesPanel({ items }: { items: PermintaanAksesItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [approveItem, setApproveItem] = useState<PermintaanAksesItem | null>(null);
  const [rejectItem, setRejectItem] = useState<PermintaanAksesItem | null>(null);
  const [days, setDays] = useState("3");
  const [note, setNote] = useState("");

  if (items.length === 0) return null;

  const handleApprove = () => {
    if (!approveItem) return;
    startTransition(async () => {
      const res = await setujuiPermintaanAkses({
        requestId: approveItem.id,
        durasiHari: Number(days),
      });
      if (res.success) {
        toast.success(res.message);
        setApproveItem(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleReject = () => {
    if (!rejectItem) return;
    if (note.trim().length < 3) {
      toast.error("Catatan penolakan wajib diisi (minimal 3 karakter).");
      return;
    }
    startTransition(async () => {
      const res = await tolakPermintaanAkses({
        requestId: rejectItem.id,
        catatan: note.trim(),
      });
      if (res.success) {
        toast.success(res.message);
        setRejectItem(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-sky-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-sky-900">
              Permintaan Akses Lapor ({items.length})
            </h3>
            <p className="text-[11px] text-sky-800 mt-0.5">
              PJ meminta dibukakan akses karena batas waktu sudah lewat.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li
              key={item.id}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {item.kode} — {item.nama}
                </p>
                <p className="text-xs text-slate-600">
                  Periode <strong>{item.periode}</strong> · {item.pjNama} ({item.pjEmail}) ·
                  diajukan {item.dibuatPada}
                </p>
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                  <span className="font-semibold">Alasan:</span> {item.alasan}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setApproveItem(item);
                    setDays("3");
                  }}
                  disabled={isPending}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition cursor-pointer"
                >
                  Setujui
                </button>
                <button
                  onClick={() => {
                    setRejectItem(item);
                    setNote("");
                  }}
                  disabled={isPending}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-50 rounded-md transition cursor-pointer"
                >
                  Tolak
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {approveItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Setujui permintaan akses?</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {approveItem.kode} — {approveItem.nama}, periode{" "}
                <strong>{approveItem.periode}</strong>. PJ diberi tahu lewat sistem dan
                email. Tindakan ini dicatat di Log Audit.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">Dibuka selama</label>
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="1">1 hari</option>
                <option value="3">3 hari</option>
                <option value="7">7 hari</option>
                <option value="14">14 hari</option>
                <option value="30">30 hari</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setApproveItem(null)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition cursor-pointer"
              >
                {isPending ? "Memproses..." : "Ya, Setujui"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Tolak permintaan akses?</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {rejectItem.kode} — {rejectItem.nama}, periode{" "}
                <strong>{rejectItem.periode}</strong>. Catatan Anda akan dikirim ke PJ.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Catatan penolakan <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Laporan sudah dikompilasi, hubungi bagian keuangan."
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setRejectItem(null)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={isPending || note.trim().length < 3}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition cursor-pointer"
              >
                {isPending ? "Memproses..." : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
