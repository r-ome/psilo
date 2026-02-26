import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get("access_token")?.value;
  return NextResponse.json({ isAuthenticated });
}
