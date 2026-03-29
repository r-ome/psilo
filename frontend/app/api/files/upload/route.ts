import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env.server";
import logger from "@/app/lib/logger";
import { getValidToken } from "@/app/lib/auth/token";

export async function POST(req: NextRequest) {
  logger.info({ method: "POST", route: "/api/files/upload" }, "request");

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

  const { filename, contentType, imageData, contentLength } = body as {
    filename: string;
    contentType: string;
    imageData?: string;
    contentLength?: number;
  };

  if (!filename || !contentType) {
    logger.info({ status: 400 }, "response");
    return NextResponse.json(
      { message: "filename and contentType are required" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/files/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        filename,
        contentType,
        ...(imageData ? { imageData } : {}),
        ...(contentLength != null ? { contentLength } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.info({ status: response.status }, "response");
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    logger.info({ status: 200 }, "response");
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err, status: 500 }, "unhandled error");
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
