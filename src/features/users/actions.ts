"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireActiveSession } from "@/lib/active-session";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { recordAdminAudit } from "@/lib/audit";
import { generateSecureTemporaryPassword } from "@/lib/password";

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi"),
  email: z.string().trim().toLowerCase().email("Format email tidak valid"),
  nip: z.string().trim().min(1, "NIP wajib diisi"),
});

export async function createAdminUser(input: { name: string; email: string; nip: string }) {
  const admin = await requireAdminSession();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const existing = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: "insensitive" } } });
  if (existing) return { success: false as const, error: "Email sudah digunakan, termasuk oleh akun nonaktif." };

  const context = await auth.$context;
  const password = generateSecureTemporaryPassword(16);
  let user;
  try {
    user = await context.internalAdapter.createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      nip: parsed.data.nip,
      emailVerified: false,
      role: "USER",
      isActive: true,
      mustChangePassword: true,
    }, { method: "admin" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false as const, error: "NIP sudah terdaftar, gunakan NIP lain." };
    }
    throw error;
  }
  const passwordHash = await context.password.hash(password);
  try {
    await context.internalAdapter.createAccount({
      accountId: user.id,
      providerId: "credential",
      issuer: createLocalAccountIssuer("credential"),
      userId: user.id,
      password: passwordHash,
    });
  } catch (error) {
    await context.internalAdapter.deleteUser(user.id);
    throw error;
  }
  await recordAdminAudit({ action: "CREATE_USER", adminName: admin.user.name, adminEmail: admin.user.email, alasan: `User: ${user.email}` });
  revalidatePath("/admin/users");
  return { success: true as const, user: { id: user.id, name: user.name, email: user.email }, temporaryPassword: password, adminSessionId: admin.session.id };
}

export async function markPasswordChanged() {
  const session = await requireActiveSession({ allowMustChangePassword: true });
  await prisma.user.update({ where: { id: session.user.id }, data: { mustChangePassword: false } });
  return { success: true as const };
}

const updateProfileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Nama wajib diisi"),
  nip: z.string().trim().min(1, "NIP wajib diisi"),
});

export async function updateUserProfile(input: { userId: string; name: string; nip: string }) {
  const admin = await requireAdminSession();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  try {
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, name: true, nip: true, email: true } });
    if (!target) return { success: false as const, error: "User tidak ditemukan." };

    const updated = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { name: parsed.data.name, nip: parsed.data.nip },
      select: { id: true, name: true, nip: true },
    });
    await recordAdminAudit({
      action: "UPDATE_USER_PROFILE",
      adminName: admin.user.name,
      adminEmail: admin.user.email,
      alasan: `User ${target.email}: nama/NIP diperbarui`,
    });
    revalidatePath("/admin/users");
    return { success: true as const, user: updated };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false as const, error: "NIP sudah terdaftar, gunakan NIP lain." };
    }
    console.error("Gagal memperbarui profil user:", error);
    return { success: false as const, error: "Profil user gagal diperbarui." };
  }
}

export async function setUserActive(userId: string, isActive: boolean) {
  const admin = await requireAdminSession();
  if (userId === admin.user.id) return { success: false as const, error: "Admin tidak boleh menonaktifkan dirinya sendiri." };
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target) return { success: false as const, error: "User tidak ditemukan." };
    if (!isActive && target.role === "ADMIN") {
      const activeAdmins = await tx.user.count({ where: { role: "ADMIN", isActive: true } });
      if (activeAdmins <= 1) return { success: false as const, error: "Admin aktif terakhir tidak boleh dinonaktifkan." };
    }
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) await tx.session.deleteMany({ where: { userId } });
    return { success: true as const };
  });
  if (result.success) {
    await recordAdminAudit({ action: isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER", adminName: admin.user.name, adminEmail: admin.user.email, alasan: `User ID: ${userId}` });
  }
  revalidatePath("/admin/users");
  return result;
}
