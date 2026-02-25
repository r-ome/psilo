import { NextRequest, NextResponse } from "next/server";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";
import { forgotPasswordSchema } from "@/app/lib/schemas/auth";

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

  const { data, success, error } = forgotPasswordSchema.safeParse(body);
  if (!success) {
    return NextResponse.json(
      { message: error.issues[0].message },
      { status: 422 },
    );
  }
  try {
    await cognitoService.forgotPassword(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = handleCognitoError(error);
    return NextResponse.json({ message }, { status });
  }
}
