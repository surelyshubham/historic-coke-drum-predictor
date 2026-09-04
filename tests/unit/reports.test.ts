import { describe, it, expect } from "vitest";
import { generateDocxReport } from "../../lib/reports/docxGenerator";
import { ReportPayload } from "../../lib/reports/reportTypes";

describe("Reporting Module", () => {
  const mockPayload: ReportPayload = {
    vesselInfo: {
      id: 1,
      name: "R01",
      nominalThickness: 32.0,
      diameter: 8.97,
      material: "SA-387 Gr. 11 Cl. 2",
      clientName: "Refinery West Coast",
      status: "active",
    },
    executiveSummary: {
      monitoredFlawsCount: 3,
      criticalCount: 1,
      highRiskCount: 1,
      moderateCount: 1,
      lowRiskCount: 0,
      earliestWarningDate: "2027-04-15",
      earliestWarningDays: 405,
      earliestThroughWallDate: "2029-01-10",
      earliestThroughWallDays: 1040,
      recommendedTurnaroundDate: "2026-10-15",
    },
    availableDrums: [{ id: 1, name: "R01" }],
    availableWelds: [
      { id: 10, name: "C4", drumId: 1 },
      { id: 11, name: "C6", drumId: 1 },
    ],
    indications: [
      {
        id: 101,
        code: "PI-R01-C4-1200",
        weldId: 10,
        weldName: "C4",
        circumferentialPosition: 1200,
        segment: "1.2",
        weldPosition: "Bottom Toe",
        currentLength: 450,
        currentDepth: 29.5,
        depthPercentOfWall: 92.2,
        growthRateYear: 1.8,
        warningDate: "2027-04-15",
        warningDaysRemaining: 405,
        criticalDate: "2028-06-20",
        criticalDaysRemaining: 836,
        riskTier: "CRITICAL",
        campaignHistory: [
          { campaignName: "OCT-23", inspectionDate: "2023-10-15", length: 420, depth: 26.0 },
          { campaignName: "APR-24", inspectionDate: "2024-04-15", length: 435, depth: 27.5 },
          { campaignName: "SEP-24", inspectionDate: "2024-09-15", length: 450, depth: 29.5 },
        ],
      },
      {
        id: 102,
        code: "PI-R01-C6-7400",
        weldId: 11,
        weldName: "C6",
        circumferentialPosition: 7400,
        segment: "7.4",
        weldPosition: "Centerline",
        currentLength: 300,
        currentDepth: 26.0,
        depthPercentOfWall: 81.3,
        growthRateYear: 1.2,
        warningDate: "2027-11-30",
        warningDaysRemaining: 634,
        criticalDate: "2029-01-10",
        criticalDaysRemaining: 1040,
        riskTier: "HIGH",
        campaignHistory: [
          { campaignName: "OCT-23", inspectionDate: "2023-10-15", length: 280, depth: 24.0 },
          { campaignName: "SEP-24", inspectionDate: "2024-09-15", length: 300, depth: 26.0 },
        ],
      },
    ],
    selectedWeldId: null,
    selectedIndicationId: 101,
    allCampaignNames: ["OCT-23", "APR-24", "SEP-24"],
  };

  it("generates a valid binary DOCX document buffer", async () => {
    const buffer = await generateDocxReport(mockPayload);
    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000); // Valid Word document zip container

    // Check DOCX file magic header 'PK\x03\x04' (standard zip container format)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it("correctly computes executive summary risk distribution", () => {
    const criticals = mockPayload.indications.filter((i) => i.riskTier === "CRITICAL");
    const highs = mockPayload.indications.filter((i) => i.riskTier === "HIGH");

    expect(criticals.length).toBe(1);
    expect(highs.length).toBe(1);
    expect(mockPayload.executiveSummary.criticalCount).toBe(1);
    expect(mockPayload.executiveSummary.highRiskCount).toBe(1);
    expect(mockPayload.executiveSummary.earliestWarningDays).toBe(405);
  });

  it("embeds graphic visualizer images inside the DOCX document when provided", async () => {
    // 1x1 transparent PNG data URL as test image
    const samplePng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const payloadWithImages: ReportPayload = {
      ...mockPayload,
      images: {
        polarRingImage: samplePng,
        weldPlanImage: samplePng,
        bevelSScanImage: samplePng,
        forecastCurveImage: samplePng,
      },
    };

    const docxWithImages = await generateDocxReport(payloadWithImages);
    expect(docxWithImages).toBeDefined();
    expect(Buffer.isBuffer(docxWithImages)).toBe(true);
    // Document with images should be larger and valid PK zip archive
    expect(docxWithImages.length).toBeGreaterThan(1000);
    expect(docxWithImages[0]).toBe(0x50);
    expect(docxWithImages[1]).toBe(0x4b);
  });
});

