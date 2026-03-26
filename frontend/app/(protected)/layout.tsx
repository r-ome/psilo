import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedShell } from "./components/ProtectedShell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  if (!accessToken) {
    redirect("/login");
  }

  return <ProtectedShell>{children}</ProtectedShell>;
}
