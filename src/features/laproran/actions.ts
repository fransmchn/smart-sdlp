"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionSession } from "@/lib/active-session";
import { createUserNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { canSubmitReport } from "@/utils/reportAccess";
import {
  formatReportDeadline,
  getReportDeadline,
} from "@/utils/reportDeadline";

const submitLaporanSchema = z.object({
  kegiatanId: z.string().min(1),
  periodeBulan: z.number().int().min(1).max(12),
  periodeTahun: z.number().int().min(2020).max(2100),
  uraian: z.string().min(1, "Uraian kegiatan wajib diisi"),
  realIni: z.coerce.number().int().min(0),
});

export type SubmitLaporanInput = z.infer<typeof submitLaporanSchema>;

type SubmitLaporanResult =
  | {
      success: true;
      laporan: {
        id: string;
        kegiatanId: string;
        periodeBulan: number;
        periodeTahun: number;
        realisasi: number;
      };
    }
  | { success: false; error: string };

type TransactionResult = SubmitLaporanResult;

export async function submitLaporan(
  input: SubmitLaporanInput,
): Promise<SubmitLaporanResult> {
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

  const parsed = submitLaporanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }

  const data = parsed.data;
  const isAdmin = session.user.role?.toLowerCase() === "admin";

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<TransactionResult> => {
        const kegiatan = await tx.kegiatan.findUnique({
          where: { id: data.kegiatanId },
        });
        if (!kegiatan) {
          return { success: false, error: "Kegiatan tidak ditemukan." };
        }
        if (kegiatan.pjId !== session.user.id && !isAdmin) {
          return {
            success: false,
            error: "Anda bukan Penanggung Jawab kegiatan ini.",
          };
        }

        const settings = await tx.appSettings.findFirst();
        const deadlineSettings = {
          day: settings?.reportDeadlineDay ?? 25,
          time: settings?.reportDeadlineTime ?? "23:59",
        };
        const deadline = getReportDeadline(
          data.periodeTahun,
          data.periodeBulan,
          deadlineSettings,
        );
        // Setelah batas waktu, laporan hanya bisa dikirim bila admin sudah
        // membuka akses lapor untuk kegiatan dan bulan ini.
        const aksesDibuka = await tx.reportAccessOverride.findUnique({
          where: {
            kegiatanId_periodeBulan_periodeTahun: {
              kegiatanId: data.kegiatanId,
              periodeBulan: data.periodeBulan,
              periodeTahun: data.periodeTahun,
            },
          },
        });
        if (
          !canSubmitReport({
            deadlinePassed: Date.now() >= deadline.getTime(),
            access: aksesDibuka,
          })
        ) {
          return {
            success: false,
            error: `Batas waktu pelaporan periode ini sudah lewat pada ${formatReportDeadline(deadline)}. Hubungi admin untuk meminta akses lapor.`,
          };
        }

        const allOtherLaporan = await tx.laporan.findMany({
          where: {
            kegiatanId: data.kegiatanId,
            NOT: {
              periodeBulan: data.periodeBulan,
              periodeTahun: data.periodeTahun,
            },
          },
          orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
        });
        const isBefore = (bulan: number, tahun: number) =>
          tahun < data.periodeTahun ||
          (tahun === data.periodeTahun && bulan < data.periodeBulan);
        const priorLaporan = allOtherLaporan.filter((laporan) =>
          isBefore(laporan.periodeBulan, laporan.periodeTahun),
        );
        const realLaluServer = priorLaporan.reduce(
          (sum, laporan) => sum + laporan.realIni,
          BigInt(0),
        );
        const totalUsedByOtherPeriods = allOtherLaporan.reduce(
          (sum, laporan) => sum + laporan.realIni,
          BigInt(0),
        );

        if (kegiatan.statusAnggaran === "DIBLOKIR") {
          return {
            success: false,
            error:
              "Kegiatan ini sedang diblokir oleh admin. Pelaporan tidak dapat dilakukan sampai status anggaran dibuka kembali. Silakan hubungi admin.",
          };
        }

        const currentRealisasi = BigInt(data.realIni);
        const totalIfSubmitted =
          totalUsedByOtherPeriods + currentRealisasi;
        if (totalIfSubmitted > kegiatan.pagu) {
          const sisa = kegiatan.pagu - totalUsedByOtherPeriods;
          const sisaFormatted = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
          }).format(sisa > BigInt(0) ? sisa : BigInt(0));
          return {
            success: false,
            error: `Total realisasi seluruh periode melebihi pagu. Sisa jatah yang tersedia (di luar periode ini): ${sisaFormatted}.`,
          };
        }

        const upserted = await tx.laporan.upsert({
          where: {
            kegiatanId_periodeBulan_periodeTahun: {
              kegiatanId: data.kegiatanId,
              periodeBulan: data.periodeBulan,
              periodeTahun: data.periodeTahun,
            },
          },
          create: {
            kegiatanId: data.kegiatanId,
            periodeBulan: data.periodeBulan,
            periodeTahun: data.periodeTahun,
            uraian: data.uraian,
            fisik: 0,
            statusAnggaran: kegiatan.statusAnggaran,
            realLalu: realLaluServer,
            realIni: currentRealisasi,
            realisasi: realLaluServer + currentRealisasi,
            submittedById: session.user.id,
          },
          update: {
            uraian: data.uraian,
            fisik: 0,
            statusAnggaran: kegiatan.statusAnggaran,
            realLalu: realLaluServer,
            realIni: currentRealisasi,
            realisasi: realLaluServer + currentRealisasi,
            submittedById: session.user.id,
          },
        });

        const allLaporanForKegiatan = await tx.laporan.findMany({
          where: { kegiatanId: data.kegiatanId },
          orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
        });
        const totalRealisasi = allLaporanForKegiatan.reduce(
          (sum, laporan) => sum + laporan.realIni,
          BigInt(0),
        );
        const latestChronological = allLaporanForKegiatan[0];
        if (latestChronological) {
          await tx.kegiatan.update({
            where: { id: data.kegiatanId },
            data: {
              uraian: latestChronological.uraian,
              fisik: latestChronological.fisik,
              realLalu: totalRealisasi - latestChronological.realIni,
              realIni: latestChronological.realIni,
              realisasi: totalRealisasi,
              sudahLapor: true,
            },
          });
        }

        return {
          success: true,
          laporan: {
            id: upserted.id,
            kegiatanId: upserted.kegiatanId,
            periodeBulan: upserted.periodeBulan,
            periodeTahun: upserted.periodeTahun,
            realisasi: Number(upserted.realisasi),
          },
        };
      },
      { isolationLevel: "Serializable" },
    );

    if (!result.success) return result;
    revalidatePath("/dashboard");
    revalidatePath("/input");
    revalidatePath("/admin/master");
    const kegiatan = await prisma.kegiatan.findUnique({
      where: { id: result.laporan.kegiatanId },
      select: { kode: true },
    });
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (kegiatan && admins.length > 0) {
      try {
        await Promise.all(
          admins.map((admin) =>
            createUserNotification({
              userId: admin.id,
              type: "LAPORAN_SUBMITTED",
              title: "Laporan baru masuk",
              message: `Laporan ${kegiatan.kode} periode ${result.laporan.periodeBulan}/${result.laporan.periodeTahun} berhasil dikirim.`,
              href: "/admin/arsip-sp2d",
            }),
          ),
        );
      } catch (notificationError) {
        console.error("Gagal membuat notifikasi laporan:", notificationError);
      }
    }
    return result;
  } catch (error) {
    console.error("Gagal menyimpan laporan:", error);
    return {
      success: false,
      error: "Gagal menyimpan laporan. Periksa data dan coba lagi.",
    };
  }
}

