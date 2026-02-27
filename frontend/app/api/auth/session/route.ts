import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import logger from "@/app/lib/logger";

export async function GET() {
  logger.info({ method: "GET", route: "/api/auth/session" }, "request");

  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get("access_token")?.value;

  logger.info({ status: 200 }, "response");
  return NextResponse.json({ isAuthenticated });
}
