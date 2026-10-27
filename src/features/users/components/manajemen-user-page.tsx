"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  Pencil,
  X,
  Copy,
  Check,
  RotateCcw,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { createAdminUser, setUserActive, updateUserProfile } from "@/features/users/actions";

export type UserItem = {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  role: string;
  isActive: boolean;
};

export function ManajemenUserPage({
  users,
  currentUserId,
}: {
  users: UserItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Modals state
  const [openAdd, setOpenAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState<{
    name: string;
    email: string;
    tempPass: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nip, setNip] = useState("");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "USER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Summary statistics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const inactive = total - active;
    const admins = users.filter((u) => u.role === "ADMIN" && u.isActive).length;
    const pjs = users.filter((u) => u.role !== "ADMIN").length;
    return { total, active, inactive, admins, pjs };
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      // Search match
      if (q) {
        const matchName = user.name.toLowerCase().includes(q);
        const matchEmail = user.email.toLowerCase().includes(q);
        const matchNip = (user.nip ?? "").toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchNip) return false;
      }

      // Role filter
      if (roleFilter !== "ALL") {
        const userRoleUpper = user.role.toUpperCase();
        if (roleFilter === "ADMIN" && userRoleUpper !== "ADMIN") return false;
        if (roleFilter === "USER" && userRoleUpper === "ADMIN") return false;
      }

      // Status filter
      if (statusFilter === "ACTIVE" && !user.isActive) return false;
      if (statusFilter === "INACTIVE" && user.isActive) return false;

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const activeAdmins = stats.admins;

  const resetFilters = () => {
    setSearchQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  };

  const handleOpenAdd = () => {
    setName("");
    setEmail("");
    setNip("");
    setOpenAdd(true);
  };

  const handleAddUser = () => {
    if (!name.trim() || !email.trim() || !nip.trim()) {
      toast.error("Nama, email, dan NIP wajib diisi.");
      return;
    }
    startTransition(async () => {
      const result = await createAdminUser({ name, email, nip });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("User berhasil dibuat.");
      // Trigger native window.alert to preserve compatibility with e2e tests
      window.alert(`Password sementara: ${result.temporaryPassword}`);
      setCreatedPasswordInfo({
        name,
        email,
        tempPass: result.temporaryPassword,
      });
      setName("");
      setEmail("");
      setNip("");
      setOpenAdd(false);
      router.refresh();
    });
  };

  const handleOpenEdit = (user: UserItem) => {
    setEditTarget(user);
    setName(user.name);
    setNip(user.nip ?? "");
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    if (!name.trim() || !nip.trim()) {
      toast.error("Nama dan NIP wajib diisi.");
      return;
    }
    startTransition(async () => {
      const result = await updateUserProfile({ userId: editTarget.id, name, nip });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Nama dan NIP user berhasil diperbarui.");
      setEditTarget(null);
      router.refresh();
    });
  };

  const handleToggleActive = (user: UserItem) => {
    const action = user.isActive ? "Nonaktifkan" : "Aktifkan kembali";
    if (!window.confirm(`${action} ${user.name}? Data tetap tersimpan; user hanya kehilangan akses.`)) {
      return;
    }
    startTransition(async () => {
      const result = await setUserActive(user.id, !user.isActive);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${action} berhasil.`);
      router.refresh();
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Password sementara disalin ke clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const getInitials = (fullName: string) => {
    return (
      fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "U"
    );
  };

  const isFiltering = searchQuery !== "" || roleFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <div className="space-y-5">
      {/* ── Top Header ── */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
              Manajemen Pengguna
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Shield className="w-3 h-3 text-emerald-600" />
              Admin Area
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola akun penanggung jawab (PJ) kegiatan dan administrator sistem SMART.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#143D32] hover:bg-[#0f2e26] text-white text-xs font-semibold rounded-md shadow-xs transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah User</span>
        </button>
      </div>

      {/* ── Stats Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            TOTAL USER
          </p>
          <p className="text-2xl font-black text-slate-800">{stats.total}</p>
          <span className="text-[10px] text-slate-400">Semua akun terdaftar</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            USER AKTIF
          </p>
          <p className="text-2xl font-black text-emerald-600">{stats.active}</p>
          <span className="text-[10px] text-emerald-700/80">Memiliki akses ke sistem</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <UserX className="w-3.5 h-3.5 text-slate-400" />
            NONAKTIF
          </p>
          <p className="text-2xl font-black text-slate-600">{stats.inactive}</p>
          <span className="text-[10px] text-slate-400">Akses dinonaktifkan</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            PJ KEGIATAN
          </p>
          <p className="text-2xl font-black text-slate-800">{stats.pjs}</p>
          <span className="text-[10px] text-slate-400">{stats.admins} akun Administrator</span>
        </div>
      </div>

      {/* ── Created User Success Banner ── */}
      {createdPasswordInfo && (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-4 shadow-xs relative">
          <button
            type="button"
            onClick={() => setCreatedPasswordInfo(null)}
            className="absolute top-3 right-3 text-emerald-700 hover:text-emerald-900 p-1"
            aria-label="Tutup pemberitahuan"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <div className="p-2 rounded-full bg-emerald-100 text-emerald-800 shrink-0 mt-0.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold text-emerald-950">
                Akun Berhasil Dibuat: {createdPasswordInfo.name} ({createdPasswordInfo.email})
              </h2>
              <p className="text-xs text-emerald-900 leading-relaxed">
                Salin password sementara berikut dan berikan kepada pengguna. Password hanya ditampilkan sekali ini:
              </p>
              <div className="flex items-center gap-2 pt-1">
                <code className="px-3 py-1.5 rounded-md bg-white border border-emerald-300 font-mono text-xs font-bold text-emerald-900 select-all tracking-wider shadow-2xs">
                  {createdPasswordInfo.tempPass}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdPasswordInfo.tempPass)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold shadow-2xs transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Tersalin" : "Salin Password"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Cari nama, NIP, atau email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
            />
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1 hidden md:flex">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filter:</span>
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "ALL" | "ADMIN" | "USER")}
              aria-label="Filter berdasarkan role"
              className="h-8.5 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#143D32] cursor-pointer text-slate-700 font-medium"
            >
              <option value="ALL">Semua Role</option>
              <option value="USER">PJ Kegiatan (User)</option>
              <option value="ADMIN">Administrator</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
              aria-label="Filter berdasarkan status aktif"
              className="h-8.5 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#143D32] cursor-pointer text-slate-700 font-medium"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>

            {isFiltering && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 h-8.5 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition"
                title="Reset filter pencarian"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Table & List ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">NO</th>
                <th className="py-3 px-4 min-w-[220px]">NAMA & EMAIL</th>
                <th className="py-3 px-4 min-w-[150px]">NIP</th>
                <th className="py-3 px-4 min-w-[110px]">PERAN</th>
                <th className="py-3 px-4 min-w-[110px] text-center">STATUS</th>
                <th className="py-3 px-4 text-right min-w-[160px]">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">
                        Tidak ada pengguna ditemukan
                      </p>
                      <p className="text-xs text-slate-500">
                        {isFiltering
                          ? "Coba sesuaikan kata kunci pencarian atau reset filter."
                          : "Belum ada data pengguna yang terdaftar."}
                      </p>
                      {isFiltering && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset Filter</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, idx) => {
                  const self = user.id === currentUserId;
                  const lastAdmin =
                    user.role === "ADMIN" && user.isActive && activeAdmins <= 1;
                  const isAdmin = user.role === "ADMIN";

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/70 transition ${
                        !user.isActive ? "bg-slate-50/30 opacity-75" : ""
                      }`}
                    >
                      {/* NO */}
                      <td className="py-3 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* NAMA & EMAIL */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isAdmin
                                ? "bg-emerald-100 text-[#143D32]"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 truncate">
                                {user.name}
                              </span>
                              {self && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  Anda
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* NIP */}
                      <td className="py-3 px-4">
                        {user.nip ? (
                          <span className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded">
                            {user.nip}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* ROLE */}
                      <td className="py-3 px-4">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Shield className="w-3 h-3 text-emerald-700" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            PJ Kegiatan
                          </span>
                        )}
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-4 text-center">
                        {user.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Nonaktif
                          </span>
                        )}
                      </td>

                      {/* AKSI */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleOpenEdit(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-sky-700 hover:text-sky-900 hover:bg-sky-50 border border-transparent hover:border-sky-200 transition disabled:opacity-40"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            disabled={self || lastAdmin || pending}
                            onClick={() => handleToggleActive(user)}
                            title={
                              self
                                ? "Anda tidak dapat menonaktifkan akun sendiri"
                                : lastAdmin
                                ? "Admin aktif terakhir tidak boleh dinonaktifkan"
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                              user.isActive
                                ? "text-rose-700 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-200"
                                : "text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border border-transparent hover:border-emerald-200"
                            }`}
                          >
                            {user.isActive ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                <span>Nonaktifkan</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Aktifkan kembali</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="p-3 bg-slate-50/70 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Menampilkan <strong className="text-slate-700">{filteredUsers.length}</strong> dari{" "}
            <strong className="text-slate-700">{users.length}</strong> pengguna
          </span>
          <span className="text-[10px] text-slate-400">
            Penambahan peran Admin baru dilakukan melalui script bootstrap admin di server.
          </span>
        </div>
      </div>

      {/* ── Modal Tambah User ── */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => !pending && setOpenAdd(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Minimalist & Clean Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 bg-slate-50/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tambah Pengguna Baru</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Membuat akun Penanggung Jawab (PJ) Kegiatan
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpenAdd(false)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddUser();
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="user-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama"
                  required
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
                />
              </div>

              <div>
                <label
                  htmlFor="user-nip"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nomor Induk Pegawai (NIP) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="user-nip"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="NIP"
                  required
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
                />
              </div>

              <div>
                <label
                  htmlFor="user-email"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Alamat Email Instansi <span className="text-rose-500">*</span>
                </label>
                <input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
                />
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-md text-[11px] text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  Keamanan Kata Sandi Sementara
                </p>
                <p className="text-amber-800 leading-relaxed">
                  Password sementara dibuat server secara acak dan ditampilkan satu kali setelah user dibuat. Pengguna diwajibkan mengganti password pada saat login pertama.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpenAdd(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-md transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#143D32] hover:bg-[#0f2e26] rounded-md shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{pending ? "Menyimpan..." : "Buat User"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Edit User ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => !pending && setEditTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Minimalist & Clean Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 bg-slate-50/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Profil User</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Memperbarui data identitas pengguna
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditTarget(null)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEdit();
              }}
              className="p-5 space-y-4"
            >
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 space-y-0.5">
                <p className="font-semibold text-slate-700">Email Akun:</p>
                <p className="font-mono text-slate-800 font-medium">{editTarget.email}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Email, password, dan role bersifat permanen dan tidak dapat diedit dari form ini.
                </p>
              </div>

              <div>
                <label
                  htmlFor="edit-user-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama"
                  required
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-user-nip"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nomor Induk Pegawai (NIP) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-user-nip"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="NIP"
                  required
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#143D32]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-md transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#143D32] hover:bg-[#0f2e26] rounded-md shadow-xs transition disabled:opacity-50"
                >
                  {pending ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
