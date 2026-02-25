import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get("access_token")?.value;
  return Response.json({ isAuthenticated });
}
