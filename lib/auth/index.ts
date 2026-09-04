import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        try {
          const userList = await db
            .select()
            .from(users)
            .where(eq(users.email, credentials.email as string))
            .limit(1);
          const user = userList[0];
          
          if (!user) return null;
          
          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );
          if (!passwordMatch) return null;
          
          return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (err) {
          console.error("Auth error during authorize:", err);
          return null;
        }
      },
    }),
  ],
});
