// Aturan "akses lapor": admin dapat membuka kembali akses lapor untuk satu
// kegiatan pada satu bulan yang batas waktunya sudah lewat. Berkas ini hanya
// berisi aturan murni (tanpa database) supaya bisa dipakai oleh server dan
// tampilan, dan mudah diuji.

export const ACCESS_MIN_DAYS = 1;
export const ACCESS_MAX_DAYS = 30;

type TimeValue = Date | number | string;

export type ReportAccessWindow = {
  openedUntil: TimeValue;
  revokedAt?: TimeValue | null;
};

function toMs(value: TimeValue): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

// Akses dianggap aktif bila belum dicabut dan batas waktunya belum lewat.
export function isReportAccessActive(
  access: ReportAccessWindow | null | undefined,
  now: TimeValue = new Date(),
): boolean {
  if (!access) return false;
  if (access.revokedAt !== null && access.revokedAt !== undefined) return false;
  const until = toMs(access.openedUntil);
  if (Number.isNaN(until)) return false;
  return until > toMs(now);
}

// PJ boleh mengirim atau merevisi laporan bila batas waktu belum lewat,
// atau bila admin sudah membuka akses yang masih aktif.
export function canSubmitReport(input: {
  deadlinePassed: boolean;
  access?: ReportAccessWindow | null;
  now?: TimeValue;
}): boolean {
  if (!input.deadlinePassed) return true;
  return isReportAccessActive(input.access, input.now);
}

export function isValidAccessDays(days: number): boolean {
  return Number.isInteger(days) && days >= ACCESS_MIN_DAYS && days <= ACCESS_MAX_DAYS;
}

// Akses dibuka selama sejumlah hari penuh dihitung dari saat admin menekan tombol.
export function computeAccessOpenedUntil(
  days: number,
  now: Date = new Date(),
): Date {
  if (!isValidAccessDays(days)) {
    throw new Error(`Durasi akses harus ${ACCESS_MIN_DAYS}-${ACCESS_MAX_DAYS} hari.`);
  }
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatPeriodeLabel(bulan: number, tahun: number): string {
  return `${NAMA_BULAN[bulan - 1] ?? bulan} ${tahun}`;
}
