import * as XLSX from "xlsx";

export interface SmartReportItem {
  no: number;
  kode: string;
  nama: string;
  jenis: "APBN" | "NON-APBN";
  pj?: string;
  uraian: string;
  fisik: number;
  pagu: number;
  statusAnggaran: "Dibuka" | "Diblokir";
  realLalu: number;
  realIni: number;
  realSd?: number;
  pct?: number;
  sisa?: number;
}

export function generateSmartReportExcel(
  items: SmartReportItem[],
  periode = "Agustus 2026",
  fileName = "laporan_realisasi_smart.xlsx"
) {
  // ── Multi-Row Header Data ──
  const wsData: any[][] = [
    ["KEMENTERIAN PERTANIAN REPUBLIK INDONESIA"],
    ["BADAN STANDARDISASI INSTRUMEN PERTANIAN"],
    ["BALAI BESAR PERAKITAN DAN MODERNISASI SUMBER DAYA LAHAN PERTANIAN"],
    ["LAPORAN REALISASI CAPAIAN DAN ANGGARAN KEGIATAN (SMART)"],
    [`Periode: ${periode} | Tahun Anggaran: 2026 | Format Resmi Kementerian Pertanian`],
    [], // Row 5 empty
    // Multi-row Header Row 1 (Row index 6)
    [
      "No",
      "Kode",
      "Kegiatan",
      "Jenis Kegiatan",
      "Penanggung Jawab (PJ)", // Kolom 5 (Baru)
      "Realisasi Capaian Kegiatan", // Kolom 6 (Merge 6-7)
      "", // Merged with col 6
      "Pagu Anggaran", // Kolom 8
      "Status Anggaran", // Kolom 9
      "Realisasi Anggaran", // Kolom 10 (Merge 10-13)
      "", // Merged
      "", // Merged
      "", // Merged
      "Sisa Anggaran", // Kolom 14
    ],
    // Multi-row Header Row 2 / Sub-Header (Row index 7)
    [
      "", // No
      "", // Kode
      "", // Kegiatan
      "", // Jenis
      "", // PJ
      "Uraian Kegiatan Periode Ini", // Under Realisasi Capaian (Col 6)
      "Realisasi Fisik (%)", // Under Realisasi Capaian (Col 7)
      "", // Pagu
      "", // Status
      "Periode Lalu", // Col 10
      "Periode Ini", // Col 11
      "s.d. Periode", // Col 12
      "%", // Col 13
      "", // Sisa
    ],
  ];

  let totalPagu = 0;
  let totalRealLalu = 0;
  let totalRealIni = 0;
  let totalRealSd = 0;
  let totalSisa = 0;

  items.forEach((item, index) => {
    const realSd =
      item.realSd !== undefined
        ? item.realSd
        : item.realLalu + item.realIni;
    const pct =
      item.pct !== undefined
        ? item.pct
        : item.pagu > 0
        ? (realSd / item.pagu) * 100
        : 0;
    const sisa = item.sisa !== undefined ? item.sisa : item.pagu - realSd;
    const pjName = item.pj || "Budi Santoso";

    totalPagu += item.pagu;
    totalRealLalu += item.realLalu;
    totalRealIni += item.realIni;
    totalRealSd += realSd;
    totalSisa += sisa;

    wsData.push([
      index + 1, // 1. No
      item.kode, // 2. Kode
      item.nama, // 3. Kegiatan
      item.jenis, // 4. Jenis
      pjName, // 5. Penanggung Jawab (PJ) [Baru]
      item.uraian, // 6. Uraian
      Number(item.fisik) / 100, // 7. Fisik (0.xx for Excel %)
      item.pagu, // 8. Pagu
      item.statusAnggaran, // 9. Status
      item.realLalu, // 10. Real Lalu
      item.realIni, // 11. Real Ini
      realSd, // 12. Real s.d.
      pct / 100, // 13. % Serapan (0.xx for Excel %)
      sisa, // 14. Sisa
    ]);
  });

  const avgPct = totalPagu > 0 ? (totalRealSd / totalPagu) * 100 : 0;

  // Summary Row (Row index: 8 + items.length)
  wsData.push([
    "",
    "",
    "TOTAL REKAPITULASI",
    "",
    `${items.length} PJ Terdaftar`,
    "",
    "",
    totalPagu,
    "",
    totalRealLalu,
    totalRealIni,
    totalRealSd,
    avgPct / 100,
    totalSisa,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // ── Gridlines Aktif (Wajib) ──
  ws["!views"] = [{ showGridLines: true }];

  // ── Merges ──
  ws["!merges"] = [
    // Header title rows (Col 0 s.d. 13)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 13 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 13 } },
    // Table Headers
    { s: { r: 6, c: 0 }, e: { r: 7, c: 0 } }, // 1. No
    { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } }, // 2. Kode
    { s: { r: 6, c: 2 }, e: { r: 7, c: 2 } }, // 3. Kegiatan
    { s: { r: 6, c: 3 }, e: { r: 7, c: 3 } }, // 4. Jenis
    { s: { r: 6, c: 4 }, e: { r: 7, c: 4 } }, // 5. Penanggung Jawab (PJ)
    { s: { r: 6, c: 5 }, e: { r: 6, c: 6 } }, // 6-7. Realisasi Capaian Kegiatan (Merge col 5-6)
    { s: { r: 6, c: 7 }, e: { r: 7, c: 7 } }, // 8. Pagu
    { s: { r: 6, c: 8 }, e: { r: 7, c: 8 } }, // 9. Status Anggaran
    { s: { r: 6, c: 9 }, e: { r: 6, c: 12 } }, // 10-13. Realisasi Anggaran (Merge col 9-12)
    { s: { r: 6, c: 13 }, e: { r: 7, c: 13 } }, // 14. Sisa Anggaran
  ];

  // ── Column Widths ──
  ws["!cols"] = [
    { wch: 6 }, // 1. No
    { wch: 22 }, // 2. Kode
    { wch: 36 }, // 3. Kegiatan
    { wch: 14 }, // 4. Jenis
    { wch: 22 }, // 5. Penanggung Jawab (PJ)
    { wch: 42 }, // 6. Uraian
    { wch: 14 }, // 7. Fisik (%)
    { wch: 20 }, // 8. Pagu
    { wch: 15 }, // 9. Status
    { wch: 18 }, // 10. Real Lalu
    { wch: 18 }, // 11. Real Ini
    { wch: 18 }, // 12. s.d. Periode
    { wch: 10 }, // 13. %
    { wch: 20 }, // 14. Sisa
  ];

  // ── Formatting Number & Currency & Percentage pada Tiap Cell ──
  const startDataRow = 8;
  const endDataRow = startDataRow + items.length; // includes summary row

  for (let R = startDataRow; R <= endDataRow; ++R) {
    // Col 6: Fisik % (Index 6)
    const fisikCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })];
    if (fisikCell && typeof fisikCell.v === "number") {
      fisikCell.z = "0.0%";
    }

    // Col 7: Pagu (Index 7)
    const paguCell = ws[XLSX.utils.encode_cell({ r: R, c: 7 })];
    if (paguCell && typeof paguCell.v === "number") {
      paguCell.z = '"Rp "#,##0';
    }

    // Col 9: Real Lalu (Index 9)
    const laluCell = ws[XLSX.utils.encode_cell({ r: R, c: 9 })];
    if (laluCell && typeof laluCell.v === "number") {
      laluCell.z = '"Rp "#,##0';
    }

    // Col 10: Real Ini (Index 10)
    const iniCell = ws[XLSX.utils.encode_cell({ r: R, c: 10 })];
    if (iniCell && typeof iniCell.v === "number") {
      iniCell.z = '"Rp "#,##0';
    }

    // Col 11: s.d. Periode (Index 11)
    const sdCell = ws[XLSX.utils.encode_cell({ r: R, c: 11 })];
    if (sdCell && typeof sdCell.v === "number") {
      sdCell.z = '"Rp "#,##0';
    }

    // Col 12: % Serapan (Index 12)
    const pctCell = ws[XLSX.utils.encode_cell({ r: R, c: 12 })];
    if (pctCell && typeof pctCell.v === "number") {
      pctCell.z = "0.0%";
    }

    // Col 13: Sisa (Index 13)
    const sisaCell = ws[XLSX.utils.encode_cell({ r: R, c: 13 })];
    if (sisaCell && typeof sisaCell.v === "number") {
      sisaCell.z = '"Rp "#,##0';
    }
  }

  // ── Cell Styles for Header (Copper Orange #E28B59, Bold, Borders) ──
  const copperHeaderStyle = {
    fill: { fgColor: { rgb: "E28B59" } },
    font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "888888" } },
      bottom: { style: "thin", color: { rgb: "888888" } },
      left: { style: "thin", color: { rgb: "888888" } },
      right: { style: "thin", color: { rgb: "888888" } },
    },
  };

  const subHeaderStyle = {
    fill: { fgColor: { rgb: "D97D4B" } },
    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "888888" } },
      bottom: { style: "thin", color: { rgb: "888888" } },
      left: { style: "thin", color: { rgb: "888888" } },
      right: { style: "thin", color: { rgb: "888888" } },
    },
  };

  // Apply styling to header rows
  for (let c = 0; c < 14; c++) {
    const h1 = ws[XLSX.utils.encode_cell({ r: 6, c })];
    if (h1) h1.s = copperHeaderStyle;
    const h2 = ws[XLSX.utils.encode_cell({ r: 7, c })];
    if (h2) h2.s = subHeaderStyle;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan SMART");

  XLSX.writeFile(wb, fileName);
}
