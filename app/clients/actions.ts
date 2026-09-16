"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { clients, cokeDrums, users, inspections } from "@/db/schema";
import { eq, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";

export async function getClientsWithDetailsAction() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const allClients = await db.select().from(clients);
  const allDrums = await db.select().from(cokeDrums);
  const allUsers = await db.select().from(users);
  const allInspections = await db.select().from(inspections);

  const clientDetails = allClients.map((client) => {
    const assignedDrums = allDrums.filter((d) => d.clientId === client.id);
    const assignedUsers = allUsers.filter((u) => u.clientId === client.id).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }));
    const drumIds = assignedDrums.map(d => d.id);
    const clientInspectionsCount = allInspections.filter(i => drumIds.includes(i.drumId)).length;

    return {
      ...client,
      assignedDrums,
      assignedUsers,
      inspectionsCount: clientInspectionsCount,
    };
  });

  return JSON.parse(JSON.stringify(clientDetails));
}

export async function getAvailableDrumsAction() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const drumsList = await db.select().from(cokeDrums);
  return JSON.parse(JSON.stringify(drumsList));
}

export async function createClientAction(data: {
  name: string;
  description?: string;
  email: string;
  password: string;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can create clients.");
  }

  if (!data.name || !data.name.trim()) {
    throw new Error("Client organization name is required.");
  }

  if (!data.email || !data.email.trim()) {
    throw new Error("Client login email address is required.");
  }

  if (!data.password || !data.password.trim()) {
    throw new Error("Initial password is required.");
  }

  const cleanEmail = data.email.trim().toLowerCase();

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanEmail))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("A user account with this email address already exists.");
  }

  const [newClient] = await db
    .insert(clients)
    .values({
      name: data.name.trim(),
      description: data.description?.trim() || null,
    })
    .returning();

  const passwordHash = await bcrypt.hash(data.password, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email: cleanEmail,
      name: `${data.name.trim()} Admin`,
      passwordHash,
      role: "CLIENT",
      clientId: newClient.id,
    })
    .returning();

  revalidatePath("/clients");
  return JSON.parse(
    JSON.stringify({
      ...newClient,
      assignedUsers: [
        {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt,
        },
      ],
    })
  );
}

export async function deleteClientAction(clientId: number) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can delete clients.");
  }

  // 1. Unassign Coke Drums belonging to this client
  await db
    .update(cokeDrums)
    .set({ clientId: null })
    .where(eq(cokeDrums.clientId, clientId));

  // 2. Delete Client User Accounts
  await db
    .delete(users)
    .where(eq(users.clientId, clientId));

  // 3. Delete Client
  await db
    .delete(clients)
    .where(eq(clients.id, clientId));

  revalidatePath("/clients");
  return { success: true };
}

export async function assignDrumsToClientAction(clientId: number, drumIds: number[]) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can assign drums.");
  }

  // 1. Unassign any drum currently assigned to this client that is NOT in drumIds
  const currentAssigned = await db
    .select()
    .from(cokeDrums)
    .where(eq(cokeDrums.clientId, clientId));

  for (const drum of currentAssigned) {
    if (!drumIds.includes(drum.id)) {
      await db
        .update(cokeDrums)
        .set({ clientId: null })
        .where(eq(cokeDrums.id, drum.id));
    }
  }

  // 2. Assign selected drumIds to this client
  if (drumIds.length > 0) {
    await db
      .update(cokeDrums)
      .set({ clientId })
      .where(inArray(cokeDrums.id, drumIds));
  }

  revalidatePath("/clients");
  revalidatePath("/drums");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createClientUserAction(data: {
  clientId: number;
  email: string;
  name: string;
  password: string;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can create client users.");
  }

  if (!data.email || !data.email.trim() || !data.password || !data.password.trim()) {
    throw new Error("Email and password are required.");
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email.trim().toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("User with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email: data.email.trim().toLowerCase(),
      name: data.name?.trim() || "Client User",
      passwordHash,
      role: "CLIENT",
      clientId: data.clientId,
    })
    .returning();

  revalidatePath("/clients");
  return JSON.parse(JSON.stringify(newUser));
}

export async function deleteClientUserAction(userId: number) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can delete client users.");
  }

  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/clients");
  return { success: true };
}
