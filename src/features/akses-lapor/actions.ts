"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActionSession,
  type ActiveSessionPayload,
} from "@/lib/active-session";
import { recordAdminAudit } from "@/lib/audit";
import { createUserNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  ACCESS_MAX_DAYS,
  ACCESS_MIN_DAYS,
  computeAccessOpenedUntil,
  formatPeriodeLabel,
} from "@/utils/reportAccess";
import {
  formatReportDeadline,
  isReportDeadlinePassed,
} from "@/utils/reportDeadline";

const bukaAksesSchema = z.object({
  kegiatanId: z.string().min(1, "Kegiatan tidak valid."),
  periodeBulan: z.number().int().min(1).max(12),
  periodeTahun: z.number().int().min(2020).max(2100),
  durasiHari: z
    .number()
    .int()
    .min(ACCESS_MIN_DAYS, `Durasi minimal ${ACCESS_MIN_DAYS} hari.`)
    .max(ACCESS_MAX_DAYS, `Durasi maksimal ${ACCESS_MAX_DAYS} hari.`),
  alasan: z
    .string()
    .trim()
    .min(5, "Alasan minimal 5 karakter.")
    .max(300, "Alasan maksimal 300 karakter."),
});

export type BukaAksesLaporInput = z.infer<typeof bukaAksesSchema>;

export type AksesLaporResult =
  | { success: true; message: string }
  | { success: false; error: string };

type AdminCheck =
  | { ok: true; session: ActiveSessionPayload }
  | { ok: false; error: string };

async function requireAdminForAction(): Promise<AdminCheck> {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }
  if (!session) {
    return { ok: false, error: "Sesi tidak valid, silakan login ulang." };
  }
  if (session.user.role?.toLowerCase() !== "admin") {
    return { ok: false, error: "Hanya admin yang bisa mengatur akses lapor." };
  }
  return { ok: true, session };
}

// Admin membuka akses lapor untuk satu kegiatan pada satu bulan yang batas
// waktunya sudah lewat. Pembukaan berlaku selama beberapa hari lalu menutup
// sendiri. Semua pembukaan tercatat di Log Audit.
export async function bukaAksesLapor(
  input: BukaAksesLaporInput,
): Promise<AksesLaporResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { success: false, error: auth.error };
  const { session } = auth;

  const parsed = bukaAksesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const data = parsed.data;

  try {
    const kegiatan = await prisma.kegiatan.findUnique({
      where: { id: data.kegiatanId },
      include: { pj: { select: { id: true, name: true } } },
    });
    if (!kegiatan) {
      return { success: false, error: "Kegiatan tidak ditemukan." };
    }
    if (!kegiatan.pjId) {
      return {
        success: false,
        error: "Kegiatan ini belum punya Penanggung Jawab (PJ).",
      };
    }
    if (kegiatan.statusAnggaran === "DIBLOKIR") {
      return {
        success: false,
        error:
          "Kegiatan ini sedang diblokir, sehingga laporan tetap tidak bisa dikirim. Ubah status anggarannya terlebih dahulu.",
      };
    }

    const settings = await prisma.appSettings.findFirst();
    const deadlineSettings = {
      day: settings?.reportDeadlineDay ?? 25,
      time: settings?.reportDeadlineTime ?? "23:59",
    };
    if (
      !isReportDeadlinePassed(data.periodeTahun, data.periodeBulan, deadlineSettings)
    ) {
      return {
        success: false,
        error:
          "Batas waktu periode ini belum lewat, jadi PJ masih bisa melapor tanpa pembukaan akses.",
      };
    }

    const openedUntil = computeAccessOpenedUntil(data.durasiHari);
    const periodeLabel = formatPeriodeLabel(data.periodeBulan, data.periodeTahun);

    await prisma.$transaction(async (tx) => {
      await tx.reportAccessOverride.upsert({
        where: {
          kegiatanId_periodeBulan_periodeTahun: {
            kegiatanId: data.kegiatanId,
            periodeBulan: data.periodeBulan,
            periodeTahun: data.periodeTahun,
          },
        },
        update: {
          openedUntil,
          reason: data.alasan,
          createdById: session.user.id,
          revokedAt: null,
        },
        create: {
          kegiatanId: data.kegiatanId,
          periodeBulan: data.periodeBulan,
          periodeTahun: data.periodeTahun,
          openedUntil,
          reason: data.alasan,
          createdById: session.user.id,
        },
      });
      await recordAdminAudit(
        {
          action: "OPEN_REPORT_ACCESS",
          adminName: session.user.name,
          adminEmail: session.user.email,
          kodeKegiatan: kegiatan.kode,
          namaKegiatan: kegiatan.nama,
          alasan: `Buka akses ${periodeLabel}, ${data.durasiHari} hari. Alasan: ${data.alasan}`,
        },
        tx,
      );
    });

    // Pemberitahuan ke PJ tidak boleh menggagalkan pembukaan akses.
    try {
      await createUserNotification({
        userId: kegiatan.pjId,
        type: "REPORT_ACCESS_OPENED",
        title: "Akses lapor dibuka",
        message: `Admin membuka akses lapor ${kegiatan.kode} periode ${periodeLabel} sampai ${formatReportDeadline(openedUntil)}.`,
        href: `/input?kode=${encodeURIComponent(kegiatan.kode)}`,
      });
    } catch (error) {
      console.error("Gagal mengirim notifikasi akses lapor:", error);
    }

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    return {
      success: true,
      message: `Akses lapor ${kegiatan.kode} (${periodeLabel}) dibuka sampai ${formatReportDeadline(openedUntil)}.`,
    };
  } catch (error) {
    console.error("Gagal membuka akses lapor:", error);
    return { success: false, error: "Gagal membuka akses lapor." };
  }
}

// Admin menutup kembali akses yang sebelumnya dibuka.
export async function cabutAksesLapor(
  accessId: string,
): Promise<AksesLaporResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { success: false, error: auth.error };
  const { session } = auth;

  if (!accessId) return { success: false, error: "Akses tidak valid." };

  try {
    const access = await prisma.reportAccessOverride.findUnique({
      where: { id: accessId },
      include: { kegiatan: { select: { kode: true, nama: true } } },
    });
    if (!access) {
      return { success: false, error: "Akses lapor tidak ditemukan." };
    }
    if (access.revokedAt) {
      return { success: false, error: "Akses ini sudah dicabut sebelumnya." };
    }

    const periodeLabel = formatPeriodeLabel(access.periodeBulan, access.periodeTahun);
    await prisma.$transaction(async (tx) => {
      await tx.reportAccessOverride.update({
        where: { id: accessId },
        data: { revokedAt: new Date() },
      });
      await recordAdminAudit(
        {
          action: "REVOKE_REPORT_ACCESS",
          adminName: session.user.name,
          adminEmail: session.user.email,
          kodeKegiatan: access.kegiatan.kode,
          namaKegiatan: access.kegiatan.nama,
          alasan: `Cabut akses ${periodeLabel}`,
        },
        tx,
      );
    });

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    return {
      success: true,
      message: `Akses lapor ${access.kegiatan.kode} (${periodeLabel}) dicabut.`,
    };
  } catch (error) {
    console.error("Gagal mencabut akses lapor:", error);
    return { success: false, error: "Gagal mencabut akses lapor." };
  }
}
