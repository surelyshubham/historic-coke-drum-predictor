import { AppShell } from "@/components/layout/AppShell";

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
