import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env.server";
import logger from "@/app/lib/logger";
import { getValidToken } from "@/app/lib/auth/token";

export async function POST(req: NextRequest) {
  logger.info({ method: "POST", route: "/api/files/preflight" }, "request");

  const idToken = await getValidToken("id_token");
  if (!idToken) {
    logger.info({ status: 401 }, "response");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.info({ status: 400 }, "response");
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("items" in body) ||
    !Array.isArray((body as { items: unknown }).items)
  ) {
    logger.info({ status: 400 }, "response");
    return NextResponse.json(
      { message: "items must be an array" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/files/preflight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    logger.info({ status: response.status }, "response");
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    logger.error({ err, status: 500 }, "unhandled error");
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
