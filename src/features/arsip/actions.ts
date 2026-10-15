"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActionSession } from "@/lib/active-session";
import { createUserNotification } from "@/lib/notifications";

export async function deleteLaporan(laporanId: string, alasan: string) {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }

  if (!session || session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya Admin yang berhak menghapus laporan arsip.",
    };
  }

  if (!alasan.trim()) {
    return { success: false, error: "Alasan penghapusan wajib diisi." };
  }

  try {
    const target = await prisma.laporan.findUnique({
      where: { id: laporanId },
      include: {
        kegiatan: {
          include: { pj: true },
        },
        submittedBy: true,
      },
    });

    if (!target) {
      return { success: false, error: "Laporan tidak ditemukan." };
    }

    const NAMA_BULAN = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    const namaPeriode = `${NAMA_BULAN[target.periodeBulan - 1]} ${target.periodeTahun}`;
    let notifStatus = "GAGAL: Email PJ tidak tersedia";

    if (target.kegiatan.pj?.email) {
      try {
        const { buildEmailTemplate, sendMail, escapeHtml } = await import("@/lib/mailer");
        const safePjName = escapeHtml(target.kegiatan.pj.name);
        const safeKode = escapeHtml(target.kegiatan.kode);
        const safeNama = escapeHtml(target.kegiatan.nama);
        const safePeriode = escapeHtml(namaPeriode);
        const safeAlasan = escapeHtml(alasan.trim());
        const mailResult = await sendMail({
          to: target.kegiatan.pj.email,
          subject: `Laporan Realisasi ${safeKode} Dihapus/Ditolak — SMART BRMP SDLP`,
          html: buildEmailTemplate("Laporan Dihapus/Ditolak", `<p>Yth. ${safePjName},</p><p>Laporan realisasi kegiatan <strong>${safeKode} ? ${safeNama}</strong> periode <strong>${safePeriode}</strong> telah dihapus/ditolak oleh admin.</p><p><strong>Alasan:</strong> ${safeAlasan}</p><p>Silakan hubungi admin atau masuk ke aplikasi SMART BRMP SDLP untuk informasi lebih lanjut.</p>`),
          text: `Yth. ${safePjName}, laporan realisasi ${safeKode} — ${safeNama} periode ${safePeriode} telah dihapus/ditolak oleh admin. Alasan: ${safeAlasan}. Silakan hubungi admin atau masuk ke aplikasi SMART BRMP SDLP untuk informasi lebih lanjut.`,
        });
        notifStatus = mailResult.success ? "TERKIRIM" : "GAGAL: Pengiriman email gagal";
        if (!mailResult.success) console.error("Notifikasi penghapusan laporan gagal dikirim:", mailResult.error);
      } catch (error) {
        notifStatus = "GAGAL: Pengiriman email gagal";
        console.error("Notifikasi penghapusan laporan gagal dikirim:", error);
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Simpan rekam jejak penghapusan ke tabel AuditLog
      await tx.auditLog.create({
        data: {
          action: "DELETE_LAPORAN",
          namaFile: `Laporan ${namaPeriode} - ${target.kegiatan.kode}.xlsx`,
          kodeKegiatan: target.kegiatan.kode,
          namaKegiatan: target.kegiatan.nama,
          pemilikNama:
            target.submittedBy?.name ||
            target.kegiatan.pj?.name ||
            "PJ Kegiatan",
          pemilikEmail:
            target.submittedBy?.email || target.kegiatan.pj?.email || "-",
          adminNama: session.user.name,
          adminEmail: session.user.email,
          alasan: alasan.trim(),
          notifStatus,
        },
      });

      // 2. Hapus laporan dari database
      await tx.laporan.delete({
        where: { id: laporanId },
      });

      // 3. Ambil laporan terakhir yang masih ada untuk sinkronisasi nilai Kegiatan
      const latestLaporan = await tx.laporan.findFirst({
        where: { kegiatanId: target.kegiatanId },
        orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      });

      if (latestLaporan) {
        await tx.kegiatan.update({
          where: { id: target.kegiatanId },
          data: {
            uraian: latestLaporan.uraian,
            fisik: Math.round(latestLaporan.fisik),
            realLalu: latestLaporan.realLalu,
            realIni: latestLaporan.realIni,
            realisasi: latestLaporan.realisasi,
            sudahLapor: true,
          },
        });
      } else {
        await tx.kegiatan.update({
          where: { id: target.kegiatanId },
          data: {
            uraian: null,
            fisik: 0,
            realLalu: BigInt(0),
            realIni: BigInt(0),
            realisasi: BigInt(0),
            sudahLapor: false,
          },
        });
      }
    });

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/admin/log-audit");
    revalidatePath("/admin/master");
    revalidatePath("/admin/dashboard");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Gagal menghapus laporan:", error);
    return {
      success: false,
      error: "Gagal menghapus laporan. Periksa data dan coba lagi.",
    };
  }
}

export async function ingatkanPJ(kegiatanId: string, periode: string) {
  let session;
  try {
    session = await getActionSession();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wajib ganti kata sandi terlebih dahulu.",
    };
  }
  if (!session || session.user.role?.toLowerCase() !== "admin") {
    return {
      success: false,
      error: "Hanya Admin yang berhak mengirim email pengingat.",
    };
  }

  try {
    const kegiatan = await prisma.kegiatan.findUnique({
      where: { id: kegiatanId },
      include: { pj: true },
    });

    if (!kegiatan) {
      return { success: false, error: "Kegiatan tidak ditemukan." };
    }

    const pjEmail = kegiatan.pj?.email;
    const pjName = kegiatan.pj?.name || "Penanggung Jawab Kegiatan";

    if (!pjEmail) {
      return {
        success: false,
        error: "PJ Kegiatan ini belum memiliki alamat email yang terdaftar.",
      };
    }

    const { buildEmailTemplate, escapeHtml, sendMail } = await import("@/lib/mailer");

    const safePjName = escapeHtml(pjName);
    const safeKode = escapeHtml(kegiatan.kode);
    const safeNama = escapeHtml(kegiatan.nama);
    const safePeriode = escapeHtml(periode);
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000"}/dashboard`;
    const mailResult = await sendMail({
      to: pjEmail,
      subject: `[PENGINGAT] Unggah Laporan - ${safeKode} (${safePeriode})`,
      html: buildEmailTemplate("Pelaporan Capaian Kegiatan", `<p>Yth. Bapak/Ibu <strong>${safePjName}</strong>,</p><p>Berkas <strong>Laporan</strong> untuk kegiatan Anda belum terunggah.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="padding:8px 0;color:#64748b;width:140px;">Kode Kegiatan</td><td style="padding:8px 0;font-weight:bold;color:#143D32;">${safeKode}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Nama Kegiatan</td><td style="padding:8px 0;font-weight:600;">${safeNama}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Periode</td><td style="padding:8px 0;font-weight:600;">${safePeriode}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Status</td><td style="padding:8px 0;font-weight:bold;color:#e11d48;">BELUM DIUNGGAH</td></tr></table>`, { label: "Buka SMART BRMP SDLP", url: dashboardUrl }),
      text: `Yth. ${pjName}, mohon segera mengunggah Laporan untuk kegiatan ${kegiatan.kode} (${kegiatan.nama}) periode ${periode}.`,
    });

    if (!mailResult.success) {
      return {
        success: false,
        error: "Gagal mengirim email — periksa konfigurasi SMTP server.",
      };
    }

    if (kegiatan.pj?.id) {
      try {
        await createUserNotification({
          userId: kegiatan.pj.id,
          type: "REPORT_REMINDER",
          title: "Pengingat laporan",
          message: `Mohon isi laporan kegiatan ${kegiatan.kode} untuk periode ${periode}.`,
          href: "/input",
        });
      } catch (notificationError) {
        console.error("Gagal membuat notifikasi pengingat:", notificationError);
      }
    }

    return {
      success: true,
      message: `Email pengingat berhasil dikirim ke ${pjEmail}`,
    };
  } catch (error) {
    console.error("Gagal mengirim email pengingat:", error);
    return {
      success: false,
      error: "Gagal mengirim email pengingat. Periksa konfigurasi SMTP dan coba lagi.",
    };
  }
}

