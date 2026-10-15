"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActionSession } from "@/lib/active-session";
import {
  isGoogleDriveConfigured,
  isValidGoogleDriveUrl,
  uploadFileToGoogleDrive,
} from "@/lib/gdrive";

export async function createDokumenWithFormData(formData: FormData) {
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
      error: "Hanya Admin yang berhak mengunggah dokumen repositori.",
    };
  }

  const nama = formData.get("nama") as string;
  const kategori = formData.get("kategori") as string;
  const tanggal = formData.get("tanggal") as string;
  const kegiatanId = (formData.get("kegiatanId") as string) || null;
  const uploadMode = (formData.get("uploadMode") as string) || "file"; // "file" | "link"
  const customLink = (formData.get("customLink") as string) || "";
  const file = formData.get("file") as File | null;

  if (!nama?.trim()) {
    return { success: false, error: "Judul dokumen wajib diisi." };
  }
  if (!tanggal) {
    return { success: false, error: "Tanggal dokumen wajib diisi." };
  }

  let finalFileUrl: string | null = null;
  let finalUkuran = "1.2 MB";
  let finalFileType = "pdf";

  const parsedDate = new Date(tanggal);
  const tahun = isNaN(parsedDate.getFullYear())
    ? String(new Date().getFullYear())
    : String(parsedDate.getFullYear());

  // Mode 1: Tempel Link GDrive Manual
  if (uploadMode === "link") {
    const trimmedLink = customLink.trim();
    if (!trimmedLink) {
      return { success: false, error: "Tautan Google Drive wajib diisi." };
    }
    if (!isValidGoogleDriveUrl(trimmedLink)) {
      return {
        success: false,
        error:
          "Format tautan tidak valid! Pastikan tautan berasal dari Google Drive (drive.google.com/file/d/... atau docs.google.com).",
      };
    }
    finalFileUrl = trimmedLink;
    finalUkuran = "Tautan GDrive";
    finalFileType = "link";
  }
  // Mode 2: Upload File Berkas ke Google Drive API
  else if (file && file.size > 0) {
    if (!isGoogleDriveConfigured()) {
      return {
        success: false,
        error:
          "Kredensial Google Drive API belum dikonfigurasi di .env. Gunakan opsi 'Tautan GDrive' atau atur GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY.",
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const uploadResult = await uploadFileToGoogleDrive({
        fileName: file.name,
        mimeType: file.type,
        buffer,
        kategori,
        tahun,
      });
      finalFileUrl = uploadResult.webViewLink;
    } catch (error) {
      console.error("Gagal upload dokumen ke Google Drive:", error);
      return {
        success: false,
        error: "Gagal upload dokumen ke Google Drive. Periksa konfigurasi dan coba lagi.",
      };
    }

    const sizeInMB = file.size / (1024 * 1024);
    finalUkuran =
      sizeInMB >= 1
        ? `${sizeInMB.toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    finalFileType = ext;
  }

  try {
    const doc = await prisma.dokumen.create({
      data: {
        nama: nama.trim(),
        kategori: kategori as "SK" | "DIPA" | "KONTRAK" | "LAPORAN" | "ESURAT" | "LAINNYA",
        tanggal: parsedDate,
        kegiatanId: kegiatanId && kegiatanId !== "NONE" ? kegiatanId : null,
        fileUrl: finalFileUrl,
        fileType: finalFileType,
        ukuran: finalUkuran,
        uploaderId: session.user.id,
      },
    });

    revalidatePath("/admin/repositori");
    return { success: true, id: doc.id };
  } catch (error) {
    console.error("Gagal menyimpan dokumen:", error);
    return {
      success: false,
      error: "Gagal menyimpan dokumen. Periksa data dan coba lagi.",
    };
  }
}

export async function deleteDokumen(id: string) {
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
      error: "Hanya Admin yang berhak menghapus dokumen.",
    };
  }

  try {
    await prisma.dokumen.delete({ where: { id } });
    revalidatePath("/admin/repositori");
    return { success: true };
  } catch (error) {
    console.error("Gagal menghapus dokumen:", error);
    return {
      success: false,
      error: "Gagal menghapus dokumen. Dokumen mungkin sudah dihapus atau tidak ditemukan.",
    };
  }
}
