import { NextRequest, NextResponse } from "next/server";
import { getReportData } from "@/app/reports/actions";
import { generateDocxReport } from "@/lib/reports/docxGenerator";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const drumIdParam = searchParams.get("drumId");
    const weldIdParam = searchParams.get("weldId");

    const drumId = drumIdParam ? parseInt(drumIdParam, 10) : undefined;
    const weldId = weldIdParam ? parseInt(weldIdParam, 10) : undefined;

    const payload = await getReportData(drumId, weldId);
    const buffer = await generateDocxReport(payload);

    const safeDrumName = payload.vesselInfo.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Coke_Drum_${safeDrumName}_PAUT_Report.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Failed to generate DOCX report:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate report" },
      { status: 500 }
    );
  }
}
