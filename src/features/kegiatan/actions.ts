"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getActionSession } from "@/lib/active-session";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/audit";
import { cabutAksesSaatDiblokir } from "@/lib/report-access-cleanup";

const createKegiatanSchema = z.object({
  kode: z.string().min(1, "Kode kegiatan wajib diisi"),
  nama: z.string().min(1, "Nama kegiatan wajib diisi"),
  jenis: z.enum(["APBN", "NON_APBN"]),
  programCategoryId: z.string().min(1, "Kategori program wajib dipilih"),
  pagu: z.coerce.number().int().positive("Pagu harus lebih dari 1"),
  pjId: z.string().optional(),
  uraian: z.string().optional(),
  statusAnggaran: z.enum(["DIBUKA", "DIBLOKIR"]).default("DIBUKA"),
});

export type CreateKegiatanInput = z.infer<typeof createKegiatanSchema>;

type CreateKegiatanResult =
  | {
      success: true;
      kegiatan: {
        id: string;
        kode: string;
        nama: string;
        jenis: string;
        programCategory: string | null;
        pagu: number;
        realisasi: number;
        pj: { id: string; name: string; email: string } | null;
      };
    }
  | { success: false; error: string };

export async function createKegiatan(
  input: CreateKegiatanInput,
): Promise<CreateKegiatanResult> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session) {
    return { success: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya admin yang bisa menambahkan kegiatan.",
    };
  }

  const parsed = createKegiatanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const data = parsed.data;

  try {
  const category = await prisma.programCategory.findUnique({ where: { id: data.programCategoryId } });
  if (!category || !category.isActive) return { success: false, error: "Kategori program tidak aktif atau tidak ditemukan." };

  const existing = await prisma.kegiatan.findUnique({
    where: { kode: data.kode },
  });
  if (existing) {
    return {
      success: false,
      error: `Kode kegiatan "${data.kode}" sudah terdaftar.`,
    };
  }

  const kegiatan = await prisma.$transaction(async (tx) => {
  const kegiatan = await tx.kegiatan.create({
    data: {
      kode: data.kode,
      nama: data.nama,
      jenis: data.jenis,
      programCategoryId: data.programCategoryId,
      pagu: BigInt(data.pagu),
      uraian: data.uraian || null,
      pjId: data.pjId || null,
      statusAnggaran: data.statusAnggaran,
      wajib: true,
    },
    include: {
      pj: { select: { id: true, name: true, email: true } },

    },
  });

  await recordAdminAudit({ action: "CREATE_KEGIATAN", adminName: session.user.name, adminEmail: session.user.email, kodeKegiatan: kegiatan.kode, namaKegiatan: kegiatan.nama }, tx);
  return kegiatan;
  });
  revalidatePath("/admin/master");

  return {
    success: true,
    kegiatan: {
      id: kegiatan.id,
      kode: kegiatan.kode,
      nama: kegiatan.nama,
      jenis: kegiatan.jenis || "APBN",
      programCategory: category?.name ?? null,
      pagu: Number(kegiatan.pagu),
      realisasi: Number(kegiatan.realisasi),
      pj: kegiatan.pj,
    },
  };
  } catch (error) {
    console.error("Gagal membuat kegiatan:", error);
    return { success: false, error: 'Gagal membuat kegiatan. Periksa data dan coba lagi.' };
  }
}

const updateKegiatanSchema = z.object({
  id: z.string().min(1),
  kode: z.string().min(1, "Kode kegiatan wajib diisi"),
  nama: z.string().min(1, "Nama kegiatan wajib diisi"),
  jenis: z.enum(["APBN", "NON_APBN"]),
  programCategoryId: z.string().min(1, "Kategori program wajib dipilih"),
  pagu: z.coerce.number().int().positive("Pagu harus lebih dari 0"),
  pjId: z.string().optional(),
  uraian: z.string().optional(),
  statusAnggaran: z.enum(["DIBUKA", "DIBLOKIR"]).default("DIBUKA"),
});

export type UpdateKegiatanInput = z.infer<typeof updateKegiatanSchema>;

type MutateKegiatanResult =
  | {
      success: true;
      kegiatan: {
        id: string;
        kode: string;
        nama: string;
        jenis: string;
        programCategory: string | null;
        pagu: number;
        realisasi: number;
        pj: { id: string; name: string; email: string } | null;
      };
    }
  | { success: false; error: string };

export async function updateKegiatan(
  input: UpdateKegiatanInput,
): Promise<MutateKegiatanResult> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session) {
    return { success: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya admin yang bisa mengubah kegiatan.",
    };
  }

  const parsed = updateKegiatanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const data = parsed.data;

  try {
  const category = await prisma.programCategory.findUnique({ where: { id: data.programCategoryId } });
  if (!category || !category.isActive) {
    const current = await prisma.kegiatan.findUnique({ where: { id: data.id }, select: { programCategoryId: true } });
    if (!current || current.programCategoryId !== data.programCategoryId) return { success: false, error: "Kategori program tidak aktif atau tidak ditemukan." };
  }

  const existingWithSameKode = await prisma.kegiatan.findFirst({
    where: { kode: data.kode, NOT: { id: data.id } },
  });
  if (existingWithSameKode) {
    return {
      success: false,
      error: `Kode kegiatan "${data.kode}" sudah dipakai kegiatan lain.`,
    };
  }

  const target = await prisma.kegiatan.findUnique({ where: { id: data.id } });
  if (!target) {
    return {
      success: false as const,
      error: "Kegiatan tidak ditemukan (mungkin sudah dihapus).",
    };
  }

  const kegiatan = await prisma.$transaction(async (tx) => {
  const kegiatan = await tx.kegiatan.update({
    where: { id: data.id },
    data: {
      kode: data.kode,
      nama: data.nama,
      jenis: data.jenis,
      programCategoryId: data.programCategoryId,
      pagu: BigInt(data.pagu),
      uraian: data.uraian || null,
      pjId: data.pjId || null,
       statusAnggaran: data.statusAnggaran,
    },
    include: {
      pj: { select: { id: true, name: true, email: true } },

    },
  });

  if (data.statusAnggaran === "DIBLOKIR") {
    await cabutAksesSaatDiblokir(tx, kegiatan, {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    });
  }

  await recordAdminAudit({ action: "UPDATE_KEGIATAN", adminName: session.user.name, adminEmail: session.user.email, kodeKegiatan: kegiatan.kode, namaKegiatan: kegiatan.nama }, tx);
  return kegiatan;
  });
  revalidatePath("/admin/master");
  revalidatePath("/admin/arsip-sp2d");
  revalidatePath("/input");

  return {
    success: true,
    kegiatan: {
      id: kegiatan.id,
      kode: kegiatan.kode,
      nama: kegiatan.nama,
      jenis: kegiatan.jenis || "APBN",
      programCategory: category?.name ?? null,
      pagu: Number(kegiatan.pagu),
      realisasi: Number(kegiatan.realisasi),
      pj: kegiatan.pj,
    },
  };
  } catch (error) {
    console.error('Gagal mengubah kegiatan:', error);
    return { success: false, error: 'Gagal mengubah kegiatan. Periksa data dan coba lagi.' };
  }
}

type DeleteKegiatanResult =
  { success: true; deletedId: string } | { success: false; error: string };

export async function deleteKegiatan(
  id: string,
): Promise<DeleteKegiatanResult> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session) {
    return { success: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya admin yang bisa menghapus kegiatan.",
    };
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
  const target = await tx.kegiatan.findUnique({ where: { id } });
  if (!target) {
    return {
      success: false as const,
      error: "Kegiatan tidak ditemukan (mungkin sudah dihapus).",
    };
  }

  await tx.kegiatan.delete({ where: { id } });

  revalidatePath("/admin/master");

  await recordAdminAudit({ action: "DELETE_KEGIATAN", adminName: session.user.name, adminEmail: session.user.email, alasan: `Kegiatan ID: ${id}` }, tx);
  return { success: true as const, deletedId: id };
  });
  revalidatePath("/admin/master");
  return result;
  } catch (error) {
    console.error("Gagal mengubah kegiatan:", error);
    return { success: false, error: "Gagal mengubah data kegiatan." };
  }
}

type ToggleWajibResult =
  | { success: true; id: string; wajib: boolean }
  | { success: false; error: string };

export async function toggleWajibLapor(
  id: string,
  wajib: boolean,
): Promise<ToggleWajibResult> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session) {
    return { success: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya admin yang bisa mengubah status wajib lapor.",
    };
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
  const target = await tx.kegiatan.findUnique({ where: { id } });
  if (!target) {
    return {
      success: false as const,
      error: "Kegiatan tidak ditemukan (mungkin sudah dihapus).",
    };
  }

  await tx.kegiatan.update({
    where: { id },
    data: { wajib },
  });

  revalidatePath("/admin/master");

  await recordAdminAudit({ action: "TOGGLE_WAJIB_LAPOR", adminName: session.user.name, adminEmail: session.user.email, alasan: `Kegiatan ID: ${id}` }, tx);
  return { success: true as const, id, wajib };
  });
  revalidatePath("/admin/master");
  return result;
  } catch (error) {
    console.error("Gagal mengubah kegiatan:", error);
    return { success: false, error: "Gagal mengubah data kegiatan." };
  }
}

type ToggleStatusResult =
  | { success: true; id: string; statusAnggaran: "DIBUKA" | "DIBLOKIR" }
  | { success: false; error: string };

export async function toggleStatusAnggaran(
  id: string,
  statusAnggaran: "DIBUKA" | "DIBLOKIR",
): Promise<ToggleStatusResult> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session) {
    return { success: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya admin yang bisa mengubah status anggaran.",
    };
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
  const target = await tx.kegiatan.findUnique({ where: { id } });
  if (!target) {
    return {
      success: false as const,
      error: "Kegiatan tidak ditemukan (mungkin sudah dihapus).",
    };
  }

  await tx.kegiatan.update({
    where: { id },
    data: { statusAnggaran },
  });

  if (statusAnggaran === "DIBLOKIR") {
    await cabutAksesSaatDiblokir(tx, target, {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    });
  }

  revalidatePath("/admin/master");
  revalidatePath("/input");
  revalidatePath("/dashboard");

  await recordAdminAudit({ action: "TOGGLE_STATUS_ANGGARAN", adminName: session.user.name, adminEmail: session.user.email, alasan: `Kegiatan ID: ${id}` }, tx);
  return { success: true as const, id, statusAnggaran };
  });
  revalidatePath("/admin/master");
  revalidatePath("/admin/arsip-sp2d");
  revalidatePath("/input");
  revalidatePath("/dashboard");
  return result;
  } catch (error) {
    console.error("Gagal mengubah kegiatan:", error);
    return { success: false, error: "Gagal mengubah data kegiatan." };
  }
}









