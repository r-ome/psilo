import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const result = await cognitoService.refreshTokens(refreshToken);
    const { AccessToken, IdToken } = result.AuthenticationResult ?? {};

    if (!AccessToken || !IdToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const isProduction = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict" as const,
      maxAge: 60 * 60,
    };

    cookieStore.set("access_token", AccessToken, cookieOpts);
    cookieStore.set("id_token", IdToken, cookieOpts);

    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
