"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActionSession } from "@/lib/active-session";
import { createUserNotification } from "@/lib/notifications";
import { recordAdminAudit } from "@/lib/audit";
import { buildLaporanSnapshot } from "@/utils/laporanSnapshot";
import {
  computeAccessOpenedUntil,
  formatPeriodeLabel,
  getReminderMode,
  isReportAccessActive,
} from "@/utils/reportAccess";
import {
  formatReportDeadline,
  getReportDeadline,
  isReportDeadlinePassed,
} from "@/utils/reportDeadline";

// Lama akses lapor yang dibuka otomatis saat admin mengizinkan PJ mengisi ulang.
const REFILL_ACCESS_DAYS = 7;

// Menghapus laporan. Sebelum dihapus, isi laporan disalin ke Log Audit.
// Bila izinkanIsiUlang aktif dan batas waktu periode sudah lewat, akses lapor
// untuk kegiatan dan bulan itu dibuka selama 7 hari supaya PJ bisa mengisi ulang.
export async function deleteLaporan(
  laporanId: string,
  alasan: string,
  izinkanIsiUlang = false,
) {
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

    // Akses isi ulang hanya berguna bila batas waktu sudah lewat dan kegiatan punya PJ.
    const settings = await prisma.appSettings.findFirst();
    const deadlinePassed = isReportDeadlinePassed(
      target.periodeTahun,
      target.periodeBulan,
      {
        day: settings?.reportDeadlineDay ?? 25,
        time: settings?.reportDeadlineTime ?? "23:59",
      },
    );
    const bukaAksesIsiUlang =
      izinkanIsiUlang &&
      deadlinePassed &&
      Boolean(target.kegiatan.pjId);
    const aksesSampai = bukaAksesIsiUlang
      ? computeAccessOpenedUntil(REFILL_ACCESS_DAYS)
      : null;
    const aksesSampaiLabel = aksesSampai ? formatReportDeadline(aksesSampai) : null;

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
          html: buildEmailTemplate("Laporan Dihapus/Ditolak", `<p>Yth. ${safePjName},</p><p>Laporan realisasi kegiatan <strong>${safeKode} ? ${safeNama}</strong> periode <strong>${safePeriode}</strong> telah dihapus/ditolak oleh admin.</p><p><strong>Alasan:</strong> ${safeAlasan}</p>${aksesSampaiLabel ? `<p>Anda dapat mengisi ulang laporan periode ini sampai <strong>${escapeHtml(aksesSampaiLabel)}</strong>.</p>` : ""}<p>Silakan hubungi admin atau masuk ke aplikasi SMART BRMP SDLP untuk informasi lebih lanjut.</p>`),
          text: `Yth. ${safePjName}, laporan realisasi ${safeKode} — ${safeNama} periode ${safePeriode} telah dihapus/ditolak oleh admin. Alasan: ${safeAlasan}.${aksesSampaiLabel ? ` Anda dapat mengisi ulang laporan periode ini sampai ${aksesSampaiLabel}.` : ""} Silakan hubungi admin atau masuk ke aplikasi SMART BRMP SDLP untuk informasi lebih lanjut.`,
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
          // Salinan isi laporan, supaya angka yang dihapus tetap bisa dilihat.
          dataSnapshot: buildLaporanSnapshot(target, target.kegiatan),
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

      // 4. Tanpa izin isi ulang: tutup akses lapor yang masih terbuka untuk kegiatan dan bulan ini
      //    (misalnya dari penghapusan sebelumnya), supaya PJ tidak bisa mengisi ulang.
      if (!izinkanIsiUlang) {
        const aksesLama = await tx.reportAccessOverride.findUnique({
          where: {
            kegiatanId_periodeBulan_periodeTahun: {
              kegiatanId: target.kegiatanId,
              periodeBulan: target.periodeBulan,
              periodeTahun: target.periodeTahun,
            },
          },
        });
        if (aksesLama && isReportAccessActive(aksesLama)) {
          await tx.reportAccessOverride.update({
            where: { id: aksesLama.id },
            data: { revokedAt: new Date() },
          });
          await recordAdminAudit(
            {
              action: "REVOKE_REPORT_ACCESS",
              adminName: session.user.name,
              adminEmail: session.user.email,
              kodeKegiatan: target.kegiatan.kode,
              namaKegiatan: target.kegiatan.nama,
              alasan: `Cabut akses ${namaPeriode} (otomatis: laporan dihapus tanpa izin isi ulang). Alasan hapus: ${alasan.trim()}`,
            },
            tx,
          );
        }
      }

      // 5. Bila diizinkan, buka akses lapor supaya PJ bisa mengisi ulang laporan ini.
      if (aksesSampai) {
        await tx.reportAccessOverride.upsert({
          where: {
            kegiatanId_periodeBulan_periodeTahun: {
              kegiatanId: target.kegiatanId,
              periodeBulan: target.periodeBulan,
              periodeTahun: target.periodeTahun,
            },
          },
          update: {
            openedUntil: aksesSampai,
            reason: `Laporan dihapus admin: ${alasan.trim()}`,
            createdById: session.user.id,
            revokedAt: null,
          },
          create: {
            kegiatanId: target.kegiatanId,
            periodeBulan: target.periodeBulan,
            periodeTahun: target.periodeTahun,
            openedUntil: aksesSampai,
            reason: `Laporan dihapus admin: ${alasan.trim()}`,
            createdById: session.user.id,
          },
        });
        await recordAdminAudit(
          {
            action: "OPEN_REPORT_ACCESS",
            adminName: session.user.name,
            adminEmail: session.user.email,
            kodeKegiatan: target.kegiatan.kode,
            namaKegiatan: target.kegiatan.nama,
            alasan: `Buka akses ${namaPeriode}, ${REFILL_ACCESS_DAYS} hari (otomatis setelah laporan dihapus). Alasan hapus: ${alasan.trim()}`,
          },
          tx,
        );
      }
    });

    revalidatePath("/admin/arsip-sp2d");
    revalidatePath("/input");
    revalidatePath("/admin/log-audit");
    revalidatePath("/admin/master");
    revalidatePath("/admin/dashboard");
    revalidatePath("/dashboard");

    return { success: true, aksesDibukaSampai: aksesSampaiLabel };
  } catch (error) {
    console.error("Gagal menghapus laporan:", error);
    return {
      success: false,
      error: "Gagal menghapus laporan. Periksa data dan coba lagi.",
    };
  }
}

// Mengirim pengingat ke PJ, hanya bila PJ memang masih bisa melapor:
// - batas waktu belum lewat, atau akses lapor sedang dibuka: dikirim
// - batas waktu lewat tanpa akses: ditolak (admin perlu membuka akses dulu)
// - sudah ada laporan: ditolak
export async function ingatkanPJ(
  kegiatanId: string,
  periodeBulan: number,
  periodeTahun: number,
) {
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
  if (
    !Number.isInteger(periodeBulan) ||
    periodeBulan < 1 ||
    periodeBulan > 12 ||
    !Number.isInteger(periodeTahun) ||
    periodeTahun < 2020 ||
    periodeTahun > 2100
  ) {
    return { success: false, error: "Periode tidak valid." };
  }

  try {
    const kegiatan = await prisma.kegiatan.findUnique({
      where: { id: kegiatanId },
      include: { pj: true },
    });

    if (!kegiatan) {
      return { success: false, error: "Kegiatan tidak ditemukan." };
    }
    if (kegiatan.statusAnggaran === "DIBLOKIR") {
      return {
        success: false,
        error:
          "Kegiatan ini sedang diblokir, PJ tidak dapat mengisi laporan sehingga tidak perlu diingatkan.",
      };
    }

    const pjEmail = kegiatan.pj?.email;
    const pjName = kegiatan.pj?.name || "Penanggung Jawab Kegiatan";

    if (!pjEmail) {
      return {
        success: false,
        error: "PJ Kegiatan ini belum memiliki alamat email yang terdaftar.",
      };
    }

    const periode = formatPeriodeLabel(periodeBulan, periodeTahun);
    const periodeKey = {
      kegiatanId,
      periodeBulan,
      periodeTahun,
    };
    const [laporan, akses, settings] = await Promise.all([
      prisma.laporan.findUnique({
        where: { kegiatanId_periodeBulan_periodeTahun: periodeKey },
        select: { id: true },
      }),
      prisma.reportAccessOverride.findUnique({
        where: { kegiatanId_periodeBulan_periodeTahun: periodeKey },
      }),
      prisma.appSettings.findFirst(),
    ]);
    const deadlineSettings = {
      day: settings?.reportDeadlineDay ?? 25,
      time: settings?.reportDeadlineTime ?? "23:59",
    };
    const deadlinePassed = isReportDeadlinePassed(periodeTahun, periodeBulan, deadlineSettings);
    const accessActive = isReportAccessActive(akses);
    const mode = getReminderMode({
      hasReport: Boolean(laporan),
      deadlinePassed,
      accessActive,
    });
    if (mode === "none") {
      return {
        success: false,
        error: laporan
          ? "Laporan periode ini sudah ada, PJ tidak perlu diingatkan."
          : "Batas waktu periode ini sudah lewat. Buka akses lapor terlebih dahulu agar PJ bisa melapor, lalu kirim pengingat.",
      };
    }

    const batasWaktu = formatReportDeadline(
      getReportDeadline(periodeTahun, periodeBulan, deadlineSettings),
    );
    const { buildEmailTemplate, escapeHtml, sendMail } = await import("@/lib/mailer");

    const safePjName = escapeHtml(pjName);
    const safeKode = escapeHtml(kegiatan.kode);
    const safeNama = escapeHtml(kegiatan.nama);
    const safePeriode = escapeHtml(periode);
    const linkInput = `/input?kode=${encodeURIComponent(kegiatan.kode)}`;
    const inputUrl = `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000"}${linkInput}`;

    const tabel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="padding:8px 0;color:#64748b;width:140px;">Kode Kegiatan</td><td style="padding:8px 0;font-weight:bold;color:#143D32;">${safeKode}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Nama Kegiatan</td><td style="padding:8px 0;font-weight:600;">${safeNama}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Periode</td><td style="padding:8px 0;font-weight:600;">${safePeriode}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Batas waktu</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(batasWaktu)}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Status</td><td style="padding:8px 0;font-weight:bold;color:#e11d48;">BELUM DIUNGGAH</td></tr></table>`;
    const aksesInfo =
      accessActive && akses
        ? `<p>Admin telah membuka akses lapor untuk periode ini sampai <strong>${escapeHtml(formatReportDeadline(akses.openedUntil))}</strong>.</p>`
        : "";

    const mailResult = await sendMail({
      to: pjEmail,
      subject: `[PENGINGAT] Unggah Laporan - ${safeKode} (${safePeriode})`,
      html: buildEmailTemplate(
        "Pelaporan Capaian Kegiatan",
        `<p>Yth. Bapak/Ibu <strong>${safePjName}</strong>,</p><p>Berkas <strong>Laporan</strong> untuk kegiatan Anda belum terunggah.</p>${tabel}${aksesInfo}`,
        { label: "Buka SMART BRMP SDLP", url: inputUrl },
      ),
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
          href: linkInput,
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
