import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = req.cookies.get("access_token")?.value;

  if (!token) {
    cookieStore.delete("access_token");
    cookieStore.delete("id_token");
    cookieStore.delete("refresh_token");
    return NextResponse.json({ ok: true });
  }

  try {
    await cognitoService.logout(token);
    cookieStore.delete("access_token");
    cookieStore.delete("id_token");
    cookieStore.delete("refresh_token");
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const { message, status } = handleCognitoError(error);
    return NextResponse.json({ message }, { status });
  }
}
