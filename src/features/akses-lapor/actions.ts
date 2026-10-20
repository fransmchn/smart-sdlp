"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActionSession,
  type ActiveSessionPayload,
} from "@/lib/active-session";
import { recordAdminAudit } from "@/lib/audit";
import { buildEmailTemplate, escapeHtml, sendMail } from "@/lib/mailer";
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

// -----------------------------------------------------------------------------
// Aturan input
// -----------------------------------------------------------------------------
const periodeFields = {
  kegiatanId: z.string().min(1, "Kegiatan tidak valid."),
  periodeBulan: z.number().int().min(1).max(12),
  periodeTahun: z.number().int().min(2020).max(2100),
};

const durasiField = z
  .number()
  .int()
  .min(ACCESS_MIN_DAYS, `Durasi minimal ${ACCESS_MIN_DAYS} hari.`)
  .max(ACCESS_MAX_DAYS, `Durasi maksimal ${ACCESS_MAX_DAYS} hari.`);

const alasanField = z
  .string()
  .trim()
  .min(5, "Alasan minimal 5 karakter.")
  .max(300, "Alasan maksimal 300 karakter.");

const bukaAksesSchema = z.object({
  ...periodeFields,
  durasiHari: durasiField,
  alasan: alasanField,
});

const mintaAksesSchema = z.object({
  ...periodeFields,
  alasan: alasanField,
});

const setujuiSchema = z.object({
  requestId: z.string().min(1, "Permintaan tidak valid."),
  durasiHari: durasiField,
});

const tolakSchema = z.object({
  requestId: z.string().min(1, "Permintaan tidak valid."),
  catatan: z
    .string()
    .trim()
    .min(3, "Catatan penolakan minimal 3 karakter.")
    .max(300, "Catatan penolakan maksimal 300 karakter."),
});

export type BukaAksesLaporInput = z.infer<typeof bukaAksesSchema>;
export type MintaAksesLaporInput = z.infer<typeof mintaAksesSchema>;
export type SetujuiPermintaanInput = z.infer<typeof setujuiSchema>;
export type TolakPermintaanInput = z.infer<typeof tolakSchema>;

export type AksesLaporResult =
  | { success: true; message: string }
  | { success: false; error: string };

// -----------------------------------------------------------------------------
// Pembantu internal (tidak diekspor)
// -----------------------------------------------------------------------------
type SessionCheck =
  | { ok: true; session: ActiveSessionPayload }
  | { ok: false; error: string };

async function requireSessionForAction(): Promise<SessionCheck> {
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
  return { ok: true, session };
}

async function requireAdminForAction(): Promise<SessionCheck> {
  const check = await requireSessionForAction();
  if (!check.ok) return check;
  if (check.session.user.role?.toLowerCase() !== "admin") {
    return { ok: false, error: "Hanya admin yang bisa mengatur akses lapor." };
  }
  return check;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";
}

// Email dan notifikasi bersifat pelengkap: kegagalannya tidak boleh
// menggagalkan tindakan utama.
async function kirimEmailAman(input: {
  to: string | string[];
  subject: string;
  title: string;
  bodyHtml: string;
  text: string;
  cta?: { label: string; url: string };
}) {
  try {
    const result = await sendMail({
      to: input.to,
      subject: input.subject,
      html: buildEmailTemplate(input.title, input.bodyHtml, input.cta),
      text: input.text,
    });
    if (!result.success) {
      console.error("Email akses lapor gagal dikirim:", result.error);
    }
  } catch (error) {
    console.error("Email akses lapor gagal dikirim:", error);
  }
}

async function notifikasiAman(input: Parameters<typeof createUserNotification>[0]) {
  try {
    await createUserNotification(input);
  } catch (error) {
    console.error("Notifikasi akses lapor gagal dibuat:", error);
  }
}

type OpenAccessParams = {
  session: ActiveSessionPayload;
  kegiatanId: string;
  periodeBulan: number;
  periodeTahun: number;
  durasiHari: number;
  alasan: string;
  auditAction: "OPEN_REPORT_ACCESS" | "APPROVE_ACCESS_REQUEST";
  fromRequest: boolean;
};

// Inti pembukaan akses, dipakai oleh "Buka Akses" langsung dan oleh
// persetujuan permintaan PJ.
async function openAccessCore(params: OpenAccessParams): Promise<AksesLaporResult> {
  const { session } = params;
  try {
    const kegiatan = await prisma.kegiatan.findUnique({
      where: { id: params.kegiatanId },
      include: { pj: { select: { id: true, name: true, email: true } } },
    });
    if (!kegiatan) {
      return { success: false, error: "Kegiatan tidak ditemukan." };
    }
    if (!kegiatan.pj) {
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
      !isReportDeadlinePassed(params.periodeTahun, params.periodeBulan, deadlineSettings)
    ) {
      return {
        success: false,
        error:
          "Batas waktu periode ini belum lewat, jadi PJ masih bisa melapor tanpa pembukaan akses.",
      };
    }

    const openedUntil = computeAccessOpenedUntil(params.durasiHari);
    const periodeLabel = formatPeriodeLabel(params.periodeBulan, params.periodeTahun);
    const sampai = formatReportDeadline(openedUntil);
    const aksiLabel = params.fromRequest ? "Setujui permintaan akses" : "Buka akses";

    await prisma.$transaction(async (tx) => {
      await tx.reportAccessOverride.upsert({
        where: {
          kegiatanId_periodeBulan_periodeTahun: {
            kegiatanId: params.kegiatanId,
            periodeBulan: params.periodeBulan,
            periodeTahun: params.periodeTahun,
          },
        },
        update: {
          openedUntil,
          reason: params.alasan,
          createdById: session.user.id,
          revokedAt: null,
        },
        create: {
          kegiatanId: params.kegiatanId,
          periodeBulan: params.periodeBulan,
          periodeTahun: params.periodeTahun,
          openedUntil,
          reason: params.alasan,
          createdById: session.user.id,
        },
      });
      // Permintaan PJ yang masih menunggu untuk kegiatan dan bulan ini
      // otomatis dianggap disetujui.
      await tx.reportAccessRequest.updateMany({
        where: {
          kegiatanId: params.kegiatanId,
          periodeBulan: params.periodeBulan,
          periodeTahun: params.periodeTahun,
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
          decidedById: session.user.id,
          decidedAt: new Date(),
          decisionNote: params.fromRequest
            ? "Disetujui admin."
            : "Akses dibuka langsung oleh admin.",
        },
      });
      await recordAdminAudit(
        {
          action: params.auditAction,
          adminName: session.user.name,
          adminEmail: session.user.email,
          kodeKegiatan: kegiatan.kode,
          namaKegiatan: kegiatan.nama,
          alasan: `${aksiLabel} ${periodeLabel}, ${params.durasiHari} hari. ${params.alasan}`,
        },
        tx,
      );
    });

    const judul = params.fromRequest ? "Permintaan akses disetujui" : "Akses lapor dibuka";
    const pesan = `Akses lapor ${kegiatan.kode} periode ${periodeLabel} dibuka sampai ${sampai}.`;
    const linkInput = `/input?kode=${encodeURIComponent(kegiatan.kode)}`;

    await notifikasiAman({
      userId: kegiatan.pj.id,
      type: params.fromRequest ? "ACCESS_REQUEST_APPROVED" : "REPORT_ACCESS_OPENED",
      title: judul,
      message: pesan,
      href: linkInput,
    });
    await kirimEmailAman({
      to: kegiatan.pj.email,
      subject: `[AKSES LAPOR DIBUKA] ${kegiatan.kode} (${periodeLabel}) — SMART BRMP SDLP`,
      title: judul,
      bodyHtml: `<p>Yth. Bapak/Ibu <strong>${escapeHtml(kegiatan.pj.name)}</strong>,</p><p>Admin membuka akses lapor untuk kegiatan <strong>${escapeHtml(kegiatan.kode)} — ${escapeHtml(kegiatan.nama)}</strong> periode <strong>${escapeHtml(periodeLabel)}</strong>.</p><p>Akses berlaku sampai <strong>${escapeHtml(sampai)}</strong>. Setelah itu form laporan terkunci kembali.</p>`,
      text: `Yth. ${kegiatan.pj.name}, ${pesan}`,
      cta: { label: "Buka halaman lapor", url: `${appUrl()}${linkInput}` },
    });

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    return {
      success: true,
      message: `Akses lapor ${kegiatan.kode} (${periodeLabel}) dibuka sampai ${sampai}.`,
    };
  } catch (error) {
    console.error("Gagal membuka akses lapor:", error);
    return { success: false, error: "Gagal membuka akses lapor." };
  }
}

// -----------------------------------------------------------------------------
// Aksi admin: buka dan cabut akses langsung (B1)
// -----------------------------------------------------------------------------
export async function bukaAksesLapor(
  input: BukaAksesLaporInput,
): Promise<AksesLaporResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = bukaAksesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  return openAccessCore({
    session: auth.session,
    ...parsed.data,
    auditAction: "OPEN_REPORT_ACCESS",
    fromRequest: false,
  });
}

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

// -----------------------------------------------------------------------------
// Aksi PJ: minta dibukakan akses (B3)
// -----------------------------------------------------------------------------
export async function mintaAksesLapor(
  input: MintaAksesLaporInput,
): Promise<AksesLaporResult> {
  const auth = await requireSessionForAction();
  if (!auth.ok) return { success: false, error: auth.error };
  const { session } = auth;

  if (session.user.role?.toLowerCase() === "admin") {
    return {
      success: false,
      error:
        "Admin tidak perlu meminta akses. Gunakan tombol Buka Akses di halaman Arsip.",
    };
  }

  const parsed = mintaAksesSchema.safeParse(input);
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
      select: { id: true, kode: true, nama: true, pjId: true, statusAnggaran: true },
    });
    if (!kegiatan) {
      return { success: false, error: "Kegiatan tidak ditemukan." };
    }
    if (kegiatan.pjId !== session.user.id) {
      return { success: false, error: "Anda bukan PJ dari kegiatan ini." };
    }
    if (kegiatan.statusAnggaran === "DIBLOKIR") {
      return {
        success: false,
        error: "Kegiatan ini sedang diblokir. Hubungi admin untuk membukanya.",
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
        error: "Batas waktu periode ini belum lewat, Anda masih bisa melapor.",
      };
    }

    const aksesAda = await prisma.reportAccessOverride.findUnique({
      where: {
        kegiatanId_periodeBulan_periodeTahun: {
          kegiatanId: data.kegiatanId,
          periodeBulan: data.periodeBulan,
          periodeTahun: data.periodeTahun,
        },
      },
    });
    if (aksesAda && !aksesAda.revokedAt && aksesAda.openedUntil.getTime() > Date.now()) {
      return {
        success: false,
        error: "Akses lapor untuk periode ini sudah dibuka. Silakan muat ulang halaman.",
      };
    }

    const periodeLabel = formatPeriodeLabel(data.periodeBulan, data.periodeTahun);

    const dibuat = await prisma.$transaction(async (tx) => {
      const menunggu = await tx.reportAccessRequest.findFirst({
        where: {
          kegiatanId: data.kegiatanId,
          periodeBulan: data.periodeBulan,
          periodeTahun: data.periodeTahun,
          status: "PENDING",
        },
        select: { id: true },
      });
      if (menunggu) return false;
      await tx.reportAccessRequest.create({
        data: {
          kegiatanId: data.kegiatanId,
          periodeBulan: data.periodeBulan,
          periodeTahun: data.periodeTahun,
          reason: data.alasan,
          requestedById: session.user.id,
        },
      });
      return true;
    });
    if (!dibuat) {
      return {
        success: false,
        error: "Permintaan sebelumnya masih menunggu persetujuan admin.",
      };
    }

    // Beri tahu semua admin aktif lewat sistem dan email.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true, email: true },
    });
    await Promise.all(
      admins.map((admin) =>
        notifikasiAman({
          userId: admin.id,
          type: "ACCESS_REQUESTED",
          title: "Permintaan akses lapor",
          message: `${session.user.name} meminta akses lapor ${kegiatan.kode} periode ${periodeLabel}.`,
          href: "/admin/arsip-sp2d",
        }),
      ),
    );
    await Promise.all(
      admins.map((admin) =>
        kirimEmailAman({
          to: admin.email,
          subject: `[PERMINTAAN AKSES] ${kegiatan.kode} (${periodeLabel}) — SMART BRMP SDLP`,
          title: "Permintaan Akses Lapor",
          bodyHtml: `<p>PJ <strong>${escapeHtml(session.user.name)}</strong> meminta akses lapor untuk kegiatan <strong>${escapeHtml(kegiatan.kode)} — ${escapeHtml(kegiatan.nama)}</strong> periode <strong>${escapeHtml(periodeLabel)}</strong> karena batas waktu sudah lewat.</p><p><strong>Alasan:</strong> ${escapeHtml(data.alasan)}</p><p>Silakan setujui atau tolak permintaan ini di halaman Arsip.</p>`,
          text: `${session.user.name} meminta akses lapor ${kegiatan.kode} periode ${periodeLabel}. Alasan: ${data.alasan}`,
          cta: { label: "Buka halaman Arsip", url: `${appUrl()}/admin/arsip-sp2d` },
        }),
      ),
    );

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    return {
      success: true,
      message: "Permintaan akses terkirim. Admin akan menanggapinya.",
    };
  } catch (error) {
    console.error("Gagal mengirim permintaan akses:", error);
    return { success: false, error: "Gagal mengirim permintaan akses." };
  }
}

// -----------------------------------------------------------------------------
// Aksi admin: setujui atau tolak permintaan (B3)
// -----------------------------------------------------------------------------
export async function setujuiPermintaanAkses(
  input: SetujuiPermintaanInput,
): Promise<AksesLaporResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = setujuiSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }

  try {
    const permintaan = await prisma.reportAccessRequest.findUnique({
      where: { id: parsed.data.requestId },
    });
    if (!permintaan) {
      return { success: false, error: "Permintaan tidak ditemukan." };
    }
    if (permintaan.status !== "PENDING") {
      return { success: false, error: "Permintaan ini sudah diproses." };
    }
    return openAccessCore({
      session: auth.session,
      kegiatanId: permintaan.kegiatanId,
      periodeBulan: permintaan.periodeBulan,
      periodeTahun: permintaan.periodeTahun,
      durasiHari: parsed.data.durasiHari,
      alasan: `Permintaan PJ: ${permintaan.reason}`,
      auditAction: "APPROVE_ACCESS_REQUEST",
      fromRequest: true,
    });
  } catch (error) {
    console.error("Gagal menyetujui permintaan akses:", error);
    return { success: false, error: "Gagal menyetujui permintaan akses." };
  }
}

export async function tolakPermintaanAkses(
  input: TolakPermintaanInput,
): Promise<AksesLaporResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { success: false, error: auth.error };
  const { session } = auth;

  const parsed = tolakSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const data = parsed.data;

  try {
    const permintaan = await prisma.reportAccessRequest.findUnique({
      where: { id: data.requestId },
      include: {
        kegiatan: { select: { kode: true, nama: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!permintaan) {
      return { success: false, error: "Permintaan tidak ditemukan." };
    }
    if (permintaan.status !== "PENDING") {
      return { success: false, error: "Permintaan ini sudah diproses." };
    }

    const periodeLabel = formatPeriodeLabel(
      permintaan.periodeBulan,
      permintaan.periodeTahun,
    );
    await prisma.$transaction(async (tx) => {
      await tx.reportAccessRequest.update({
        where: { id: permintaan.id },
        data: {
          status: "REJECTED",
          decidedById: session.user.id,
          decidedAt: new Date(),
          decisionNote: data.catatan,
        },
      });
      await recordAdminAudit(
        {
          action: "REJECT_ACCESS_REQUEST",
          adminName: session.user.name,
          adminEmail: session.user.email,
          kodeKegiatan: permintaan.kegiatan.kode,
          namaKegiatan: permintaan.kegiatan.nama,
          alasan: `Tolak permintaan akses ${periodeLabel}. Catatan: ${data.catatan}`,
        },
        tx,
      );
    });

    const pesan = `Permintaan akses lapor ${permintaan.kegiatan.kode} periode ${periodeLabel} ditolak. Catatan admin: ${data.catatan}`;
    await notifikasiAman({
      userId: permintaan.requestedBy.id,
      type: "ACCESS_REQUEST_REJECTED",
      title: "Permintaan akses ditolak",
      message: pesan,
      href: `/input?kode=${encodeURIComponent(permintaan.kegiatan.kode)}`,
    });
    await kirimEmailAman({
      to: permintaan.requestedBy.email,
      subject: `[PERMINTAAN AKSES DITOLAK] ${permintaan.kegiatan.kode} (${periodeLabel}) — SMART BRMP SDLP`,
      title: "Permintaan Akses Ditolak",
      bodyHtml: `<p>Yth. Bapak/Ibu <strong>${escapeHtml(permintaan.requestedBy.name)}</strong>,</p><p>Permintaan akses lapor untuk kegiatan <strong>${escapeHtml(permintaan.kegiatan.kode)} — ${escapeHtml(permintaan.kegiatan.nama)}</strong> periode <strong>${escapeHtml(periodeLabel)}</strong> belum dapat disetujui.</p><p><strong>Catatan admin:</strong> ${escapeHtml(data.catatan)}</p><p>Anda dapat mengajukan permintaan baru bila diperlukan.</p>`,
      text: `Yth. ${permintaan.requestedBy.name}, ${pesan}`,
      cta: { label: "Buka SMART BRMP SDLP", url: `${appUrl()}/input` },
    });

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    return {
      success: true,
      message: `Permintaan akses ${permintaan.kegiatan.kode} (${periodeLabel}) ditolak.`,
    };
  } catch (error) {
    console.error("Gagal menolak permintaan akses:", error);
    return { success: false, error: "Gagal menolak permintaan akses." };
  }
}
