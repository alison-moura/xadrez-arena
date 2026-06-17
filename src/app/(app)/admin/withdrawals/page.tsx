import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { AdminWithdrawalsClient } from "./AdminWithdrawalsClient";

export const dynamic = "force-dynamic";

export default async function AdminWithdrawalsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { data: me } = await supabase
    .from("chess_users")
    .select("is_admin")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!me?.is_admin) notFound();

  return <AdminWithdrawalsClient />;
}
