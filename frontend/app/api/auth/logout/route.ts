import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";
import logger from "@/app/lib/logger";

export async function POST(req: NextRequest) {
  logger.info({ method: "POST", route: "/api/auth/logout" }, "request");

  const cookieStore = await cookies();
  const token = req.cookies.get("access_token")?.value;

  if (!token) {
    cookieStore.delete("access_token");
    cookieStore.delete("id_token");
    cookieStore.delete("refresh_token");
    logger.info({ status: 200 }, "response");
    return NextResponse.json({ ok: true });
  }

  try {
    await cognitoService.logout(token);
    cookieStore.delete("access_token");
    cookieStore.delete("id_token");
    cookieStore.delete("refresh_token");
    logger.info({ status: 200 }, "response");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const { message, status } = handleCognitoError(err);
    logger.error({ err, status }, "cognito error");
    return NextResponse.json({ message }, { status });
  }
}
