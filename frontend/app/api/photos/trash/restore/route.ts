import { cookies } from "next/headers";
import { env } from "@/app/lib/env.server";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${env.BACKEND_API_URL}/photos/trash/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(data, { status: response.status });
    }

    return Response.json(data);
  } catch (error) {
    console.error("Restore error:", error);
    return Response.json(
      { error: "Failed to restore photos" },
      { status: 500 }
    );
  }
}
