import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";

export function isTokenExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
    );
    return Date.now() + 30_000 > payload.exp * 1000;
  } catch {
    return true; // treat malformed tokens as expired
  }
}

export async function getValidToken(
  cookieName: "access_token" | "id_token",
): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  if (accessToken && !isTokenExpired(accessToken)) {
    return cookieStore.get(cookieName)?.value ?? null;
  }

  const refreshToken = cookieStore.get("refresh_token")?.value;
  if (!refreshToken) return null;

  try {
    const result = await cognitoService.refreshTokens(refreshToken);
    const { AccessToken, IdToken } = result.AuthenticationResult ?? {};
    if (!AccessToken || !IdToken) return null;

    const isProduction = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict" as const,
      maxAge: 60 * 60, // 1 hour
    };
    cookieStore.set("access_token", AccessToken, cookieOpts);
    cookieStore.set("id_token", IdToken, cookieOpts);

    return cookieName === "id_token" ? IdToken : AccessToken;
  } catch {
    return null;
  }
}
