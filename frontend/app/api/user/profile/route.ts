import { NextResponse } from "next/server";
import { env } from "@/app/lib/env.server";
import logger from "@/app/lib/logger";
import { getValidToken } from "@/app/lib/auth/token";

export async function GET() {
  logger.info({ method: "GET", route: "/api/user/profile" }, "request");

  const accessToken = await getValidToken("access_token");
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    logger.error({ err }, "unhandled error");
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
