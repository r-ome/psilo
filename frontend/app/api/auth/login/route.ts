import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";
import { env } from "@/app/lib/env.server";
import { loginSchema } from "@/app/lib/schemas/auth";
import logger from "@/app/lib/logger";

export async function POST(req: NextRequest) {
  logger.info({ method: "POST", route: "/api/auth/login" }, "request");

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

  const { data, success, error } = loginSchema.safeParse(body);
  if (!success) {
    logger.info({ status: 422 }, "response");
    return NextResponse.json(
      { message: error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const response = await cognitoService.login(data);
    const { AccessToken, IdToken, RefreshToken } =
      response.AuthenticationResult ?? {};

    if (!AccessToken || !IdToken || !RefreshToken) {
      logger.info({ status: 401 }, "response");
      return NextResponse.json({ message: "Login failed." }, { status: 401 });
    }

    const cookieStore = await cookies();

    cookieStore.set("access_token", AccessToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
    });

    cookieStore.set("id_token", IdToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
    });

    cookieStore.set("refresh_token", RefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    logger.info({ status: 200 }, "response");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const { message, status } = handleCognitoError(err);
    logger.error({ err, status }, "cognito error");
    return NextResponse.json({ message }, { status });
  }
}
