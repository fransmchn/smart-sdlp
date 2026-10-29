export const REPORT_TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export type ReportDeadlineSettings = {
  day: number;
  time: string;
};

export function getReportDeadline(
  periodeTahun: number,
  periodeBulan: number,
  settings: ReportDeadlineSettings,
): Date {
  const [hour = 23, minute = 59] = settings.time.split(":").map(Number);
  const lastDay = new Date(Date.UTC(periodeTahun, periodeBulan, 0)).getUTCDate();
  const day = Math.min(Math.max(settings.day, 1), lastDay);
  return new Date(
    Date.UTC(periodeTahun, periodeBulan - 1, day, hour, minute) - JAKARTA_OFFSET_MS,
  );
}

export function isReportDeadlinePassed(
  periodeTahun: number,
  periodeBulan: number,
  settings: ReportDeadlineSettings,
  now = new Date(),
): boolean {
  return now.getTime() >= getReportDeadline(periodeTahun, periodeBulan, settings).getTime();
}

export function formatReportDeadline(deadline: Date): string {
  return `${deadline.toLocaleString("id-ID", {
    timeZone: REPORT_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} WIB`;
}
