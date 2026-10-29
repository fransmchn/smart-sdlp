// Pengelompokan baris arsip (kegiatan x periode) menjadi satu baris per kegiatan
// untuk tampilan "Per kegiatan". Dipisah dari komponen agar bisa diuji tanpa UI.

export type GrupRow = {
  kegiatanId: string;
  kode: string;
  nama: string;
  jenis: string;
  pjNama: string;
  pjEmail: string;
  status: "SUDAH_UPLOAD" | "BELUM_UPLOAD";
  deadlinePassed?: boolean;
  kegiatanDiblokir?: boolean;
  periodeBulan: number;
  periodeTahun: number;
};

export type RingkasanGrup = {
  total: number;
  sudah: number;
  belum: number;
  // Belum upload, batas waktunya lewat, dan kegiatan tidak diblokir.
  terlambat: number;
};

export type GrupKegiatan<T extends GrupRow> = {
  kegiatanId: string;
  kode: string;
  nama: string;
  jenis: string;
  pjNama: string;
  pjEmail: string;
  diblokir: boolean;
  ringkasan: RingkasanGrup;
  rows: T[];
};

export function hitungRingkasan(rows: GrupRow[]): RingkasanGrup {
  let sudah = 0;
  let belum = 0;
  let terlambat = 0;
  for (const r of rows) {
    if (r.status === "SUDAH_UPLOAD") {
      sudah++;
    } else {
      belum++;
      if (r.deadlinePassed && !r.kegiatanDiblokir) terlambat++;
    }
  }
  return { total: rows.length, sudah, belum, terlambat };
}

export function urutkanPeriodeTerbaruDulu<T extends GrupRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.periodeTahun - a.periodeTahun || b.periodeBulan - a.periodeBulan,
  );
}

// `rowsTampil`: baris yang lolos pencarian dan filter status; menentukan kegiatan
// mana yang tampil dan baris apa yang terlihat saat dibuka.
// `rowsRingkasan`: seluruh baris pada cakupan tahun/bulan; dipakai untuk ringkasan
// ("8 dari 12"), supaya filter status tidak mengubah angka ringkasan.
// Hasil diurutkan menurut kode kegiatan.
export function kelompokkanPerKegiatan<T extends GrupRow>(
  rowsTampil: T[],
  rowsRingkasan: T[],
): GrupKegiatan<T>[] {
  const perKegiatan = new Map<string, T[]>();
  for (const r of rowsTampil) {
    const daftar = perKegiatan.get(r.kegiatanId);
    if (daftar) daftar.push(r);
    else perKegiatan.set(r.kegiatanId, [r]);
  }
  const ringkasanPerKegiatan = new Map<string, T[]>();
  for (const r of rowsRingkasan) {
    const daftar = ringkasanPerKegiatan.get(r.kegiatanId);
    if (daftar) daftar.push(r);
    else ringkasanPerKegiatan.set(r.kegiatanId, [r]);
  }

  return [...perKegiatan.values()]
    .map((rows) => {
      const pertama = rows[0];
      const semua = ringkasanPerKegiatan.get(pertama.kegiatanId) ?? rows;
      return {
        kegiatanId: pertama.kegiatanId,
        kode: pertama.kode,
        nama: pertama.nama,
        jenis: pertama.jenis,
        pjNama: pertama.pjNama,
        pjEmail: pertama.pjEmail,
        diblokir: semua.some((r) => r.kegiatanDiblokir),
        ringkasan: hitungRingkasan(semua),
        rows: urutkanPeriodeTerbaruDulu(rows),
      };
    })
    .sort((a, b) => a.kode.localeCompare(b.kode));
}
