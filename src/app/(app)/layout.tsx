import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [{ data: wallet }, { data: me }] = await Promise.all([
    supabase
      .from("chess_wallets")
      .select("balance, locked")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .from("chess_users")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle(),
  ]);

  // Heartbeat de presença (atualiza last_seen_at). Não bloqueante.
  void supabase
    .from("chess_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.user.id);

  return (
    <AppShell
      username={session.user.name ?? "?"}
      balance={wallet?.balance ?? 0}
      locked={wallet?.locked ?? 0}
      isAdmin={!!me?.is_admin}
    >
      {children}
    </AppShell>
  );
}
