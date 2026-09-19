import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const origin = req.headers.get("origin") || "none";
    const host = req.headers.get("host") || "none";
    const xForwardedHost = req.headers.get("x-forwarded-host") || "none";
    const xForwardedFor = req.headers.get("x-forwarded-for") || "none";
    const userAgent = req.headers.get("user-agent") || "none";

    let dbStatus = "unknown";
    let dbTime = null;
    let dbError = null;

    try {
      const result = await db.execute(sql`SELECT NOW() as current_time`);
      dbStatus = "connected";
      dbTime = (result as any)?.[0]?.current_time || new Date().toISOString();
    } catch (err: any) {
      dbStatus = "error";
      dbError = err.message || "Database connection failed";
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      network: {
        origin,
        host,
        xForwardedHost,
        clientIp: xForwardedFor.split(",")[0].trim(),
        userAgent: userAgent.substring(0, 100),
      },
      session: session ? {
        authenticated: true,
        user: {
          id: (session.user as any)?.id || null,
          email: session.user?.email || null,
          name: session.user?.name || null,
          role: (session.user as any)?.role || "CLIENT",
          clientId: (session.user as any)?.clientId || null,
        },
      } : {
        authenticated: false,
        user: null,
      },
      database: {
        status: dbStatus,
        currentTime: dbTime,
        error: dbError,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal diagnostic error" },
      { status: 500 }
    );
  }
}
