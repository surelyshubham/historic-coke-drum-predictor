import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }

  const userRole = (session.user as { role?: string }).role || "CLIENT";
  const userName = session.user.name || "User";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar role={userRole} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header userName={userName} role={userRole} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
