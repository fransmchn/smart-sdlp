import React, { useState } from "react";
import { UserProfile } from "@/types";
import { changePassword } from "@/lib/auth-client";
import { markPasswordChanged } from "@/features/users/actions";
import { toast } from "sonner";
import { X, Lock, Loader2 } from "lucide-react";
import Link from "next/link";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  userProfile,
  onSave,
}: EditProfileModalProps) {
  const [formData, setFormData] = useState({ ...userProfile });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isAdmin = userProfile.role?.toLowerCase() === "admin";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError("");

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) return setPasswordError("Kata sandi lama wajib diisi.");
      if (newPassword.length < 6)
        return setPasswordError("Kata sandi baru minimal 6 karakter.");
      if (newPassword !== confirmPassword)
        return setPasswordError("Konfirmasi kata sandi tidak cocok.");

      setLoading(true);
      try {
        const result = await changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (result.error) {
          const msg = result.error.message;
          const friendlyMessage =
            msg === "Invalid password"
              ? "Kata sandi lama tidak sesuai."
              : msg || "Gagal mengubah kata sandi.";
          setPasswordError(friendlyMessage);
          setLoading(false);
          return;
        }
        await markPasswordChanged();
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success("Kata sandi berhasil diubah.");
      } catch {
        setPasswordError("Terjadi kesalahan saat memproses kata sandi.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup dialog"
        disabled={loading}
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Minimalist & Clean Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 bg-slate-50/60">
          <div>
            <h2 className="text-base font-bold text-slate-900">Profil Saya</h2>
            <p className="text-xs text-slate-500 mt-0.5">{userProfile.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">
              Nama
              <input
                value={formData.nama}
                onChange={(e) =>
                  setFormData({ ...formData, nama: e.target.value })
                }
                required
                disabled={loading}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 font-normal focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
              />
            </label>
            <label className="font-semibold text-slate-700">
              NIP
              <span className="mt-1 block h-9 rounded-lg bg-slate-100 px-3 py-2 font-mono font-normal text-slate-600 border border-slate-200/60">
                {userProfile.nip || "Belum diisi"}
              </span>
              {isAdmin ? (
                <small className="mt-1 block font-normal text-emerald-700">
                  Sebagai admin, Anda dapat mengubah NIP melalui menu{" "}
                  <Link
                    href="/admin/users"
                    onClick={onClose}
                    className="font-bold underline hover:text-emerald-900 inline-flex items-center gap-0.5"
                  >
                    Pengguna ↗
                  </Link>
                </small>
              ) : (
                <small className="mt-1 block font-normal text-slate-500">
                  Hubungi admin untuk mengubah NIP.
                </small>
              )}
            </label>
          </div>

          <div className="grid gap-3 border-t border-slate-200/80 pt-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700 sm:col-span-2">
              <span className="flex items-center gap-1.5 text-slate-800">
                <Lock className="h-3.5 w-3.5 text-emerald-700" />
                Kata Sandi Lama
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required={Boolean(newPassword || confirmPassword)}
                disabled={loading}
                placeholder="Masukkan kata sandi lama"
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 font-normal focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
              />
            </label>
            <label className="font-semibold text-slate-700">
              Kata Sandi Baru
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                placeholder="Minimal 6 karakter"
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 font-normal focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
              />
            </label>
            <label className="font-semibold text-slate-700">
              Konfirmasi
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                placeholder="Ulangi kata sandi baru"
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 font-normal focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
              />
            </label>
          </div>

          {passwordError && (
            <p className="rounded-lg bg-rose-50 border border-rose-200/80 p-2 text-rose-700 font-medium">
              {passwordError}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200/80 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#143D32] px-4 py-2 font-bold text-white hover:bg-[#0e2c24] transition disabled:opacity-60"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{loading ? "Menyimpan..." : "Simpan"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
