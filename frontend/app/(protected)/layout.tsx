import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NavBar } from "./components/NavBar";

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

  return (
    <div>
      <NavBar />
      <div className="mx-4 mt-10">{children}</div>
    </div>
  );
}
