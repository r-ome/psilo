import { NextResponse, NextRequest } from "next/server";
import { cognitoService } from "@/app/lib/services/cognito.service";
import { handleCognitoError } from "@/app/lib/cognito";
import { confirmSignUpSchema } from "@/app/lib/schemas/auth";
import logger from "@/app/lib/logger";

export async function POST(req: NextRequest) {
  logger.info({ method: "POST", route: "/api/auth/signup/confirm" }, "request");

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

  const { data, success, error } = confirmSignUpSchema.safeParse(body);
  if (!success) {
    logger.info({ status: 422 }, "response");
    return NextResponse.json(
      { message: error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    await cognitoService.confirmSignUp(data);
    logger.info({ status: 200 }, "response");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { message, status } = handleCognitoError(err);
    logger.error({ err, status }, "cognito error");
    return NextResponse.json({ message }, { status });
  }
}
