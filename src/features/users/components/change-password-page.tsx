"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, KeyRound, ShieldAlert, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { changePassword } from "@/lib/auth-client";
import { markPasswordChanged } from "@/features/users/actions";

export function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Live checklist helpers
  const isLengthValid = newPassword.length >= 6;
  const isMatchValid = newPassword.length > 0 && newPassword === confirmPassword;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Kata sandi baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Kata sandi baru tidak boleh sama dengan kata sandi lama.");
      return;
    }

    setSaving(true);
    const result = await changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });

    if (result.error) {
      setError(result.error.message || "Gagal mengubah kata sandi.");
      setSaving(false);
      return;
    }

    await markPasswordChanged();
    setSuccess(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 600);
  }

  return (
    <main className="min-h-[85vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header Banner */}
        <div className="bg-[#143D32] px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-800/80 text-emerald-200 border border-emerald-700/60">
              <ShieldAlert className="w-3 h-3 text-emerald-300" />
              Keamanan Akun
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-800/60 flex items-center justify-center text-emerald-200">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Ganti Kata Sandi
          </h1>
          <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
            Perbarui kata sandi akun SMART Anda sebelum melanjutkan ke sistem.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Error Alert */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-rose-800">Gagal Memperbarui</p>
                <p className="leading-snug">{error}</p>
              </div>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-emerald-900">Kata Sandi Berhasil Diubah</p>
                <p className="leading-snug">Mengalihkan ke dashboard...</p>
              </div>
            </div>
          )}

          {/* Current Password Field */}
          <div>
            <label
              htmlFor="current-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Kata sandi lama <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="current-password"
                required
                type={showCurrent ? "text" : "password"}
                placeholder="Kata sandi lama"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-3 pr-10 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 transition cursor-pointer"
                aria-label={showCurrent ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password Field */}
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Kata sandi baru <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="new-password"
                required
                type={showNew ? "text" : "password"}
                placeholder="Kata sandi baru"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-3 pr-10 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 transition cursor-pointer"
                aria-label={showNew ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Konfirmasi kata sandi baru <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                required
                type={showConfirm ? "text" : "password"}
                placeholder="Konfirmasi kata sandi baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-3 pr-10 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 transition cursor-pointer"
                aria-label={showConfirm ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1.5">
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Aturan Kata Sandi
            </p>
            <ul className="space-y-1 text-[11px]">
              <li className="flex items-center gap-2">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    isLengthValid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-400"
                  }`}
                >
                  <Check className="w-2.5 h-2.5" />
                </span>
                <span className={isLengthValid ? "text-emerald-700 font-medium" : "text-slate-500"}>
                  Minimal 6 karakter
                </span>
              </li>

              <li className="flex items-center gap-2">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    isMatchValid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-400"
                  }`}
                >
                  <Check className="w-2.5 h-2.5" />
                </span>
                <span className={isMatchValid ? "text-emerald-700 font-medium" : "text-slate-500"}>
                  Konfirmasi kata sandi cocok
                </span>
              </li>
            </ul>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || success}
              className="w-full bg-[#143D32] hover:bg-[#0f2e26] text-white rounded-lg py-2.5 text-xs font-bold tracking-wide transition shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Kata Sandi</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
