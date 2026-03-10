import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env.server";
import logger from "@/app/lib/logger";
import { getValidToken } from "@/app/lib/auth/token";

export async function GET(req: NextRequest) {
  logger.info({ method: "GET", route: "/api/photos" }, "request");

  const accessToken = await getValidToken("access_token");
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limit = req.nextUrl.searchParams.get("limit");
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", limit);
    const response = await fetch(`${env.BACKEND_API_URL}/photos?${params}`, {
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

export async function PATCH(req: NextRequest) {
  logger.info({ method: "PATCH", route: "/api/photos" }, "request");

  const accessToken = await getValidToken("access_token");
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ message: "key is required" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const response = await fetch(
      `${env.BACKEND_API_URL}/photos/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

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

export async function DELETE(req: NextRequest) {
  logger.info({ method: "DELETE", route: "/api/photos" }, "request");

  const accessToken = await getValidToken("access_token");
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ message: "key is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/photos/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
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
