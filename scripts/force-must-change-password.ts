/**
 * Skrip Operasional (TIDAK dijalankan otomatis)
 * Digunakan oleh administrator/developer untuk memaksa akun tertentu atau semua akun
 * mengganti kata sandi (mengubah mustChangePassword menjadi true).
 *
 * Cara penggunaan:
 * 1. Menampilkan petunjuk bantuan:
 *    bun run scripts/force-must-change-password.ts
 *
 * 2. Memaksa satu akun tertentu berdasarkan email:
 *    bun run scripts/force-must-change-password.ts --email user@example.com
 *
 * 3. Memaksa semua akun aktif:
 *    bun run scripts/force-must-change-password.ts --all
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Petunjuk Penggunaan force-must-change-password:
---------------------------------------------
Skrip ini TIDAK dijalankan otomatis. Gunakan hanya jika Anda ingin memaksa
pengguna mengubah password pada sesi berikutnya.

Opsi:
  --email <alamat_email>   Set mustChangePassword = true untuk akun spesifik
  --all                    Set mustChangePassword = true untuk seluruh akun aktif

Contoh:
  bun run scripts/force-must-change-password.ts --email admin@pertanian.go.id
  bun run scripts/force-must-change-password.ts --all
`);
    return;
  }

  const emailIndex = args.indexOf("--email");
  if (emailIndex !== -1) {
    const targetEmail = args[emailIndex + 1]?.trim().toLowerCase();
    if (!targetEmail) {
      console.error("Error: Alamat email harus disertakan setelah --email");
      process.exit(1);
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: targetEmail, mode: "insensitive" } },
    });

    if (!user) {
      console.error(`Error: Pengguna dengan email "${targetEmail}" tidak ditemukan.`);
      process.exit(1);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    console.log(`[SUKSES] Akun ${user.email} (${user.name}) sekarang diwajibkan ganti password.`);
    return;
  }

  if (args.includes("--all")) {
    const updated = await prisma.user.updateMany({
      where: { isActive: true },
      data: { mustChangePassword: true },
    });

    console.log(`[SUKSES] ${updated.count} akun aktif berhasil diset mustChangePassword = true.`);
    return;
  }

  console.error("Argumen tidak dikenali. Jalankan tanpa argumen untuk melihat bantuan.");
  process.exit(1);
}

main()
  .catch((err) => {
    console.error("Terjadi kesalahan:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
