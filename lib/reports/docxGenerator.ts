import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  AlignmentType,
  Packer,
  Header,
  Footer,
  PageNumber,
  ImageRun,
} from "docx";
import { ReportPayload } from "./reportTypes";
import { DEFAULT_COLOR_SCALE, ColorScaleConfig } from "@/lib/colors/colorScales";
import { SIGMA_NDT_LOGO_BASE64 } from "./logoBase64";

function parseBase64Image(dataUrl?: string): Uint8Array | null {
  if (!dataUrl) return null;
  try {
    const base64Str = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : dataUrl;
    if (typeof window !== "undefined") {
      const binaryString = window.atob(base64Str);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.length > 50 ? bytes : null;
    } else {
      const buf = Buffer.from(base64Str, "base64");
      return buf.length > 50 ? new Uint8Array(buf) : null;
    }
  } catch (err) {
    console.error("Failed parsing base64 image for DOCX:", err);
    return null;
  }
}

function stripHash(hex: string): string {
  return (hex || "").replace(/^#/, "");
}

function createMasterColorCodeTable(
  colorScale: ColorScaleConfig = DEFAULT_COLOR_SCALE,
  nominalWall: number = 32.0,
  cladMm: number = 3.0
): Table {
  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
  };

  const rows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "0f172a" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "COLOR CODE", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: "0f172a" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "DEPTH / BOUNDARY", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "0f172a" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "SEVERITY TIER", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: "0f172a" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "ENGINEERING SIGNIFICANCE", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
      ],
    }),
  ];

  // 1. Sound Base Metal
  const soundHex = stripHash(colorScale.soundWallColor || "#7CFC00");
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: soundHex },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "SOUND WALL", bold: true, color: "0f172a", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "0.0 mm (No Crack)", bold: true, size: 16, color: "0f172a" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "ACCEPTABLE", bold: true, size: 16, color: "16a34a" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Full nominal ligament intact (100% sound shell steel).", size: 16, color: "334155" })],
            }),
          ],
        }),
      ],
    })
  );

  // 2. Replaced / Repaired Steel
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "4E9A06" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "REPLACED", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Replaced Shell Plate", bold: true, size: 16, color: "0f172a" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "REPAIRED ZONE", bold: true, size: 16, color: "15803d" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Prior turnaround weld repair/steel plate replacement.", size: 16, color: "334155" })],
            }),
          ],
        }),
      ],
    })
  );

  // 3. Cladding Layer
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "0284c7" },
          borders: thinBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "CLAD LAYER", bold: true, color: "ffffff", size: 16 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: `~${cladMm.toFixed(1)} mm ID Boundary`, bold: true, size: 16, color: "0f172a" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "INTERNAL CLAD", bold: true, size: 16, color: "0369a1" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Internal corrosion-resistant 410S stainless clad interface.", size: 16, color: "334155" })],
            }),
          ],
        }),
      ],
    })
  );

  // 4. Defect Depth Tiers
  for (const t of colorScale.tiers) {
    const tHex = stripHash(t.color);
    const depthRange = t.maxDepthMm === null
      ? `> ${t.minDepthMm.toFixed(1)} mm`
      : `${t.minDepthMm.toFixed(1)} – ${t.maxDepthMm.toFixed(1)} mm`;

    const pctRange = t.maxDepthMm === null
      ? `> ${Math.round((t.minDepthMm / nominalWall) * 100)}% wall`
      : `${Math.round((t.minDepthMm / nominalWall) * 100)}% – ${Math.round((t.maxDepthMm / nominalWall) * 100)}% wall`;

    const isCritical = t.maxDepthMm === null || t.minDepthMm >= 8.0;
    const isHigh = !isCritical && t.minDepthMm >= 6.0;
    const isMod = !isCritical && !isHigh && t.minDepthMm >= 3.0;

    const tierName = isCritical ? "CRITICAL RISK" : isHigh ? "HIGH RISK" : isMod ? "MODERATE RISK" : "MONITORED";
    const tierTextColor = isCritical ? "dc2626" : isHigh ? "ea580c" : isMod ? "d97706" : "16a34a";
    const tierAction = isCritical
      ? "Turnaround repair scoop required; structural review."
      : isHigh
      ? "Turnaround window maintenance planning & verification."
      : isMod
      ? "Scheduled PAUT monitoring; track growth delta."
      : "Acceptable crack depth; periodic re-inspection.";

    const isLightBg = tHex.toLowerCase() === "eab308" || tHex.toLowerCase() === "fef9c3" || tHex.toLowerCase() === "7cfc00";

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { fill: tHex },
            borders: thinBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: t.label, bold: true, color: isLightBg ? "0f172a" : "ffffff", size: 16 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${depthRange} (${pctRange})`, bold: true, size: 16, color: "0f172a" })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [new TextRun({ text: tierName, bold: true, size: 16, color: tierTextColor })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [new TextRun({ text: tierAction, size: 16, color: "334155" })],
              }),
            ],
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function createWeldFigureLegendTable(
  colorScale: ColorScaleConfig = DEFAULT_COLOR_SCALE,
  cladMm: number = 3.0
): Table {
  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
  };

  const cells: TableCell[] = [];

  // Sound Wall
  cells.push(
    new TableCell({
      width: { size: 14, type: WidthType.PERCENTAGE },
      shading: { fill: stripHash(colorScale.soundWallColor || "#7CFC00") },
      borders: thinBorder,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Sound Wall", bold: true, color: "0f172a", size: 14 })],
        }),
      ],
    })
  );

  // Replaced Steel
  cells.push(
    new TableCell({
      width: { size: 14, type: WidthType.PERCENTAGE },
      shading: { fill: "4E9A06" },
      borders: thinBorder,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Replaced", bold: true, color: "ffffff", size: 14 })],
        }),
      ],
    })
  );

  // Clad Layer
  cells.push(
    new TableCell({
      width: { size: 14, type: WidthType.PERCENTAGE },
      shading: { fill: "0284c7" },
      borders: thinBorder,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Clad (~${cladMm.toFixed(1)}mm)`, bold: true, color: "ffffff", size: 14 })],
        }),
      ],
    })
  );

  // Color Scale Tiers
  const tierWidth = Math.floor(58 / (colorScale.tiers.length || 1));
  colorScale.tiers.forEach((t) => {
    const tHex = stripHash(t.color);
    const isLightBg = tHex.toLowerCase() === "eab308" || tHex.toLowerCase() === "fef9c3" || tHex.toLowerCase() === "7cfc00";

    cells.push(
      new TableCell({
        width: { size: tierWidth, type: WidthType.PERCENTAGE },
        shading: { fill: tHex },
        borders: thinBorder,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: t.label, bold: true, color: isLightBg ? "0f172a" : "ffffff", size: 14 })],
          }),
        ],
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: cells })],
  });
}

export function createDocxDocument(payload: ReportPayload): Document {
  const { vesselInfo, executiveSummary, indications, allCampaignNames } = payload;
  const activeColorScale = payload.colorScale || DEFAULT_COLOR_SCALE;
  const nominalWall = vesselInfo.nominalThickness || 32.0;
  const effClad = 3.0;
  const circumferenceM = Number(((vesselInfo.diameter * Math.PI)).toFixed(2));
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" },
  };

  const headerCell = (text: string, widthPercent: number) =>
    new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: "0284c7" },
      borders: thinBorder,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text,
              bold: true,
              color: "ffffff",
              size: 18,
            }),
          ],
        }),
      ],
    });

  const dataCell = (
    text: string, 
    widthPercent: number, 
    bold = false, 
    color = "1e293b", 
    align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
  ) =>
    new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      borders: thinBorder,
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({
              text,
              bold,
              color,
              size: 18,
            }),
          ],
        }),
      ],
    });

  // Table 1: Document Control Block
  const docControlTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("METADATA FIELD", 35),
          headerCell("INSPECTION RECORD VALUE", 65),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Client / Facility", 35, true),
          dataCell(vesselInfo.clientName, 65),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Equipment Tag", 35, true),
          dataCell(`${vesselInfo.name} (Delayed Coking Unit)`, 65, true, "0369a1"),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Inspection Method", 35, true),
          dataCell("Phased Array Ultrasonic Testing (PAUT / DRM)", 65),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Engineering Standard", 35, true),
          dataCell("API 579-1 / ASME FFS-1 Fitness-For-Service Part 4 & 5", 65),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Assessment Date", 35, true),
          dataCell(dateStr, 65),
        ],
      }),
    ],
  });

  // Table 2: Vessel Geometry & Specifications
  const specsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("VESSEL SPECIFICATION", 40),
          headerCell("DESIGN / FABRICATION VALUE", 60),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Nominal Wall Thickness", 40, true),
          dataCell(`${vesselInfo.nominalThickness.toFixed(1)} mm`, 60),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Shell Outer Diameter (OD)", 40, true),
          dataCell(`${vesselInfo.diameter.toFixed(2)} m (Circumference: ~${circumferenceM} m)`, 60),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Shell Inner Diameter (ID)", 40, true),
          dataCell(`${(vesselInfo.diameter - (2 * vesselInfo.nominalThickness) / 1000).toFixed(3)} m (${Math.round((vesselInfo.diameter - (2 * vesselInfo.nominalThickness) / 1000) * 1000)} mm)`, 60),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Base Material", 40, true),
          dataCell(vesselInfo.material, 60),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Internal Cladding", 40, true),
          dataCell("Type 410S Stainless Steel (approx. 3.0 mm)", 60),
        ],
      }),
    ],
  });

  // Table 3: Executive Summary Risk Table
  const execSummaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("METRIC", 50),
          headerCell("STATUS / FINDINGS", 50),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Total Tracked Indications", 50, true),
          dataCell(`${executiveSummary.monitoredFlawsCount} Active Flaws`, 50, true),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Critical Risk Tier (>90% Wall Loss)", 50, true),
          dataCell(`${executiveSummary.criticalCount} Indications`, 50, true, executiveSummary.criticalCount > 0 ? "dc2626" : "16a34a"),
        ],
      }),
      new TableRow({
        children: [
          dataCell("High Risk Tier (80%–90% Wall Loss)", 50, true),
          dataCell(`${executiveSummary.highRiskCount} Indications`, 50, true, executiveSummary.highRiskCount > 0 ? "ea580c" : "16a34a"),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Earliest 80% Wall Warning Breach", 50, true),
          dataCell(
            executiveSummary.earliestWarningDate
              ? `${executiveSummary.earliestWarningDate} (${executiveSummary.earliestWarningDays} days remaining)`
              : "No breach projected within inspection window",
            50
          ),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Earliest Through-Wall Penetration Date", 50, true),
          dataCell(
            executiveSummary.earliestThroughWallDate
              ? `${executiveSummary.earliestThroughWallDate} (${executiveSummary.earliestThroughWallDays} days remaining)`
              : "Safe operating margin maintained",
            50
          ),
        ],
      }),
      new TableRow({
        children: [
          dataCell("Recommended Turnaround Window", 50, true),
          dataCell(
            executiveSummary.recommendedTurnaroundDate
              ? `${executiveSummary.recommendedTurnaroundDate} (Scheduled 6 months prior to warning threshold)`
              : "Normal Turnaround Cycle",
            50,
            true,
            "0284c7"
          ),
        ],
      }),
    ],
  });

  // Table 4: Defect Progression Table (All indications)
  const flawTableRows: TableRow[] = [
    new TableRow({
      children: [
        headerCell("FLAW ID", 15),
        headerCell("WELD", 10),
        headerCell("CIRC POS", 12),
        headerCell("LENGTH", 12),
        headerCell("DEPTH", 12),
        headerCell("% WALL", 10),
        headerCell("RATE", 12),
        headerCell("TIER", 17),
      ],
    }),
  ];

  for (const f of indications) {
    const tierColor =
      f.riskTier === "CRITICAL"
        ? "dc2626"
        : f.riskTier === "HIGH"
        ? "ea580c"
        : f.riskTier === "MODERATE"
        ? "d97706"
        : "16a34a";

    flawTableRows.push(
      new TableRow({
        children: [
          dataCell(f.code, 15, true),
          dataCell(f.weldName, 10),
          dataCell(`${f.circumferentialPosition} mm`, 12),
          dataCell(`${f.currentLength} mm`, 12),
          dataCell(`${f.currentDepth} mm`, 12, true),
          dataCell(`${f.depthPercentOfWall}%`, 10),
          dataCell(`+${f.growthRateYear} mm/yr`, 12),
          dataCell(f.riskTier, 17, true, tierColor, AlignmentType.CENTER),
        ],
      })
    );
  }

  const flawTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: flawTableRows,
  });

  // Load official SIGMA NDT logo image for DOCX header & title block (guaranteed in both Browser and Node.js)
  const logoBytes = parseBase64Image(SIGMA_NDT_LOGO_BASE64);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: "0284c7" },
                  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                },
                rows: [
                  new TableRow({
                    children: [
                      // Left Column: Official SIGMA NDT Logo
                      new TableCell({
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        borders: {
                          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                        },
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.LEFT,
                            children: logoBytes
                              ? [
                                  new ImageRun({
                                    data: logoBytes,
                                    transformation: { width: 140, height: 38 },
                                    type: "png",
                                  }),
                                ]
                              : [],
                          }),
                        ],
                      }),
                      // Right Column: Report Running Header Titles
                      new TableCell({
                        width: { size: 70, type: WidthType.PERCENTAGE },
                        borders: {
                          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                        },
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            spacing: { after: 30 },
                            children: [
                              new TextRun({
                                text: `Coke Drum HAT — ${vesselInfo.name} Engineering Assessment Report`,
                                bold: true,
                                size: 16,
                                color: "0f172a",
                              }),
                            ],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                              new TextRun({
                                text: "SIGMA NDT Services Inc. • Phased Array Ultrasonic Testing Report",
                                size: 14,
                                color: "64748b",
                                bold: true,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Page ",
                    size: 16,
                    color: "64748b",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "64748b",
                  }),
                  new TextRun({
                    text: " of ",
                    size: 16,
                    color: "64748b",
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "64748b",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Official SIGMA NDT Logo Header on Document Cover
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 150 },
            children: logoBytes
              ? [
                  new ImageRun({
                    data: logoBytes,
                    transformation: { width: 210, height: 58 },
                    type: "png",
                  }),
                ]
              : [],
          }),

          // Document Main Title
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: "PAUT INSPECTION & REMAINING OPERATING LIFE REPORT",
                bold: true,
                size: 28,
                color: "0f172a",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 },
            children: [
              new TextRun({
                text: `Refinery Coke Drum: ${vesselInfo.name} | Unit Turnaround Assessment`,
                size: 18,
                color: "0284c7",
                bold: true,
              }),
              new TextRun({
                text: " • SIGMA NDT Services Inc.",
                size: 18,
                color: "475569",
                bold: true,
              }),
            ],
          }),

          // Section 1: Document Control Block
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: "1. Document Control & Inspection Overview",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),
          docControlTable,

          // Section 2: Vessel Geometry Specifications
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "2. Vessel Geometry & Material Specifications",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),
          specsTable,

          // Section 3: Executive Summary
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "3. Executive Summary & Turnaround Risk Rating",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),
          execSummaryTable,

          // Section 4: Visual Inspection Suite Overview with Embedded Graphic Images
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "4. PAUT Engineering Visualizations & High-Resolution Maps",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),

          // Subsection 4.0: Inspection Color Coding Standards & Defect Severity Tiers
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 120, after: 80 },
            children: [
              new TextRun({
                text: "4.0 PAUT Inspection Color Codes & Severity Grading Standards",
                bold: true,
                size: 20,
                color: "0369a1",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: "The following standardized color scale governs all 360° circumferential weld maps, C-scan plan views, and crack depth evaluations across each inspected weld seam. Flaw colors are calibrated to nominal wall thickness and remaining ligament margins.",
                size: 16,
                color: "334155",
              }),
            ],
          }),
          createMasterColorCodeTable(activeColorScale, nominalWall, effClad),

          ...(() => {
            const uniqueWelds = Array.from(new Set(indications.map((i) => i.weldName))).filter(Boolean);
            const weldList = uniqueWelds.length > 0 ? uniqueWelds : ["C4"];
            const paras: any[] = [];

            weldList.forEach((wName, wIdx) => {
              const wImages = payload.images?.weldImages?.[wName];
              const polarImg = wImages?.polarRingImage || (wIdx === 0 ? payload.images?.polarRingImage : undefined);
              const planImg = wImages?.weldPlanImage || (wIdx === 0 ? payload.images?.weldPlanImage : undefined);
              const histImg = wImages?.historicalGraphImage;
              const forecastImg = wImages?.forecastCurveImage || (wIdx === 0 ? payload.images?.forecastCurveImage : undefined);

              paras.push(
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 240, after: 100 },
                  children: [
                    new TextRun({
                      text: `4.${wIdx + 1} Weld Joint ${wName} Inspection Visualizations & Lifing Assessment`,
                      bold: true,
                      size: 20,
                      color: "0369a1",
                    }),
                  ],
                })
              );

              // 1. Polar Ring Map
              if (polarImg && parseBase64Image(polarImg)) {
                paras.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 80, after: 60 },
                    children: [
                      new ImageRun({
                        data: parseBase64Image(polarImg)!,
                        transformation: { width: 500, height: 350 },
                        type: "png",
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 60 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.1: 360° Circumferential Map — Seam ${wName} (~${circumferenceM} m Perimeter, Slots L1–L28)`,
                        italics: true,
                        bold: true,
                        size: 16,
                        color: "334155",
                      }),
                    ],
                  }),
                  // Color Code Key Table under Figure 4.X.1
                  createWeldFigureLegendTable(activeColorScale, effClad),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 40, after: 160 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.1 Color Key: Sound Base Wall (Lime Green) | Replaced Steel (Dark Green) | Clad Layer ID (Blue Dotted) | Depth Tiers: Yellow (0.5–3mm) | Orange (3.1–6mm) | Red (6.1–10mm) | Maroon (>10mm)`,
                        size: 13,
                        color: "64748b",
                        italics: true,
                      }),
                    ],
                  })
                );
              }

              // 2. Weld Width Plan View
              if (planImg && parseBase64Image(planImg)) {
                paras.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 60 },
                    children: [
                      new ImageRun({
                        data: parseBase64Image(planImg)!,
                        transformation: { width: 550, height: 230 },
                        type: "png",
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 60 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.2: Weld Width with Indications Plan View (C-Scan) — Seam ${wName}`,
                        italics: true,
                        bold: true,
                        size: 16,
                        color: "334155",
                      }),
                    ],
                  }),
                  // Color Code Key Table under Figure 4.X.2
                  createWeldFigureLegendTable(activeColorScale, effClad),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 40, after: 160 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.2 Guidelines & Color Key: Centerline (0 mm, Green) | Weld Cap (±3 mm, Purple) | Clad Interface (±3.8 mm, Sky Blue) | HAZ (±6 mm, Slate) | Depth Tiers: Yellow / Orange / Red / Maroon`,
                        size: 13,
                        color: "64748b",
                        italics: true,
                      }),
                    ],
                  })
                );
              }

              // 3. Historical vs Current Graph
              if (histImg && parseBase64Image(histImg)) {
                paras.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 60 },
                    children: [
                      new ImageRun({
                        data: parseBase64Image(histImg)!,
                        transformation: { width: 550, height: 240 },
                        type: "png",
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 160 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.3: Multi-Campaign Historical vs. Current Inspection Comparison Graph — Seam ${wName}`,
                        italics: true,
                        bold: true,
                        size: 16,
                        color: "334155",
                      }),
                    ],
                  })
                );
              }

              // 4. Predictive Forecast Curve
              if (forecastImg && parseBase64Image(forecastImg)) {
                paras.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 60 },
                    children: [
                      new ImageRun({
                        data: parseBase64Image(forecastImg)!,
                        transformation: { width: 550, height: 250 },
                        type: "png",
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 160 },
                    children: [
                      new TextRun({
                        text: `Figure 4.${wIdx + 1}.4: Predictive Growth Extrapolation & Lifing Forecast Curve — Seam ${wName}`,
                        italics: true,
                        bold: true,
                        size: 16,
                        color: "334155",
                      }),
                    ],
                  })
                );
              }

              // 5. Per-Weld Seam Defect Progression Table
              const thisWeldFlaws = indications.filter((i) => i.weldName === wName);
              if (thisWeldFlaws.length > 0) {
                const weldTableRows: TableRow[] = [
                  new TableRow({
                    children: [
                      headerCell("FLAW ID", 14),
                      headerCell("CIRC POS", 14),
                      headerCell("WELD POS", 14),
                      headerCell("LENGTH", 12),
                      headerCell("DEPTH", 14),
                      headerCell("% WALL", 10),
                      headerCell("RATE", 10),
                      headerCell("TIER", 12),
                    ],
                  }),
                ];

                for (const f of thisWeldFlaws) {
                  const tierColor =
                    f.riskTier === "CRITICAL"
                      ? "dc2626"
                      : f.riskTier === "HIGH"
                      ? "ea580c"
                      : f.riskTier === "MODERATE"
                      ? "d97706"
                      : "16a34a";

                  const depthText = f.currentDepthOd
                    ? `${f.currentDepth} mm (OD: ${f.currentDepthOd})`
                    : `${f.currentDepth} mm`;

                  weldTableRows.push(
                    new TableRow({
                      children: [
                        dataCell(f.code, 14, true),
                        dataCell(`${f.circumferentialPosition} mm`, 14),
                        dataCell(f.weldPosition || "Center Seam", 14),
                        dataCell(`${f.currentLength} mm`, 12),
                        dataCell(depthText, 14, true),
                        dataCell(`${f.depthPercentOfWall}%`, 10, true, tierColor),
                        dataCell(`+${f.growthRateYear} mm/yr`, 10),
                        dataCell(f.riskTier, 12, true, tierColor, AlignmentType.CENTER),
                      ],
                    })
                  );
                }

                paras.push(
                  new Paragraph({
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 140, after: 60 },
                    children: [
                      new TextRun({
                        text: `Table 4.${wIdx + 1}: Detailed Defect Indications Registry — Seam ${wName} (${thisWeldFlaws.length} Indications)`,
                        bold: true,
                        size: 18,
                        color: "0f172a",
                      }),
                    ],
                  }),
                  new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: weldTableRows,
                  }),
                  new Paragraph({ spacing: { after: 220 } })
                );
              }
            });

            if (paras.length === 0) {
              paras.push(
                new Paragraph({
                  bullet: { level: 0 },
                  children: [
                    new TextRun({ text: "PAUT Engineering Visualizations: ", bold: true }),
                    new TextRun({ text: "Includes 360° Polar Ring Maps, Weld Plan Views, Multi-Campaign Graphs, and Predictive Lifing curves for all monitored seams." }),
                  ],
                })
              );
            }

            return paras;
          })(),

          // Section 5: Historical Defect Progression Table
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "5. Historical Defect Progression & Remaining Life Table",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),
          flawTable,

          // Section 6: Actionable Engineering Recommendations
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: "6. Engineering Recommendations & Turnaround Action Plan",
                bold: true,
                size: 24,
                color: "0f172a",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `Based on multi-campaign PAUT inspection tracking across campaigns (${allCampaignNames.join(", ")}), the following actions are recommended:`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: `Schedule Outage Inspection Window: `,
                bold: true,
              }),
              new TextRun({
                text: executiveSummary.recommendedTurnaroundDate 
                  ? `Perform targeted weld inspection and remedial gouging/re-welding prior to ${executiveSummary.recommendedTurnaroundDate}.`
                  : "Maintain current turnaround schedule with routine PAUT monitoring.",
              }),
            ],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: `High-Risk Indication Monitoring: `,
                bold: true,
              }),
              new TextRun({
                text: `Conduct focused Angle Beam / TOFD verification on critical seams exhibiting accelerated growth exceeding 1.0 mm/year.`,
              }),
            ],
          }),
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: `Operating Cycle Optimization: `,
                bold: true,
              }),
              new TextRun({
                text: "Review steam-quench heating and cooling cycle rates to minimize thermal fatigue stresses at circumferential weld toes.",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return doc;
}

export async function generateDocxReport(payload: ReportPayload): Promise<Buffer> {
  const doc = createDocxDocument(payload);
  return await Packer.toBuffer(doc);
}

export async function generateDocxReportBlob(payload: ReportPayload): Promise<Blob> {
  const doc = createDocxDocument(payload);
  return await Packer.toBlob(doc);
}
