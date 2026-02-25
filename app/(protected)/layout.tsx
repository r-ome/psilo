import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NavBar } from "./components/NavBar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) {
    redirect("/login");
  }

  return (
    <div>
      <NavBar />
      <div className="mx-4 mt-10">{children}</div>
    </div>
  );
}
