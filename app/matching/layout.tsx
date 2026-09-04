import { AppShell } from "@/components/layout/AppShell";

export default function MatchingLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
