import { NextResponse, NextRequest } from "next/server";
import { handleCognitoError } from "@/app/lib/cognito";
import { confirmForgotPasswordSchema } from "@/app/lib/schemas/auth";
import { cognitoService } from "@/app/lib/services/cognito.service";

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
  const { data, success, error } = confirmForgotPasswordSchema.safeParse(body);
  if (!success) {
    return NextResponse.json(
      { message: error.issues[0].message },
      { status: 422 },
    );
  }
  try {
    await cognitoService.confirmForgotPassword(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = handleCognitoError(error);
    return NextResponse.json({ message }, { status });
  }
}
