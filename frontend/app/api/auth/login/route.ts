import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";
import { env } from "@/app/lib/env.server";
import { loginSchema } from "@/app/lib/schemas/auth";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 },
    );
  }

  const { data, success, error } = loginSchema.safeParse(body);
  if (!success) {
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
      return NextResponse.json({ error: "Login failed" }, { status: 401 });
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

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.log({ error });
    const { message, status } = handleCognitoError(error);
    return NextResponse.json({ message }, { status });
  }
}
