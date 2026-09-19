import { auth } from "@/lib/auth";
import { getClientsWithDetailsAction, getAvailableDrumsAction } from "./actions";
import ClientManagerConsole from "./ClientManagerConsole";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role || "CLIENT";
  const userClientId = (session?.user as any)?.clientId ? Number((session?.user as any)?.clientId) : null;
  const isMaster = role === "MASTER";

  let clientList: any[] = [];
  let allDrums: any[] = [];

  try {
    clientList = await getClientsWithDetailsAction();
    allDrums = await getAvailableDrumsAction();
  } catch (err) {
    console.error("Failed to load clients page data:", err);
  }

  const currentClientUser = !isMaster && userClientId 
    ? clientList.find((c) => c.id === userClientId) || null 
    : null;

  return (
    <ClientManagerConsole
      isMaster={isMaster}
      initialClients={clientList}
      allDrums={allDrums}
      currentClientUser={currentClientUser}
      currentUser={{
        email: session?.user?.email || null,
        name: session?.user?.name || null,
        role: role,
        id: (session?.user as any)?.id || null,
      }}
    />
  );
}
