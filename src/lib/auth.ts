import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "next-auth";
import type { ChessUser } from "@/lib/types";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: { label: "Usuário ou email", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials.password) return null;
        const id = credentials.identifier.trim().toLowerCase();
        const { data, error } = await supabase
          .from("chess_users")
          .select("id, username, email, password_hash")
          .or(`email.eq.${id},username.eq.${id}`)
          .limit(1)
          .maybeSingle<ChessUser>();
        if (error || !data) return null;
        const ok = await bcrypt.compare(credentials.password, data.password_hash);
        if (!ok) return null;
        return { id: data.id, name: data.username, email: data.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.username = user.name ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = token.uid as string;
        session.user.name = (token.username as string) ?? session.user.name;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function auth() {
  return getServerSession(authOptions);
}
