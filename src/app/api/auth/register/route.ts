import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabase, rpcError } from "@/lib/supabase";

const schema = z.object({
  username: z
    .string()
    .min(3, "Usuário deve ter pelo menos 3 caracteres")
    .max(20, "Máximo 20 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e _"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }
  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const { data, error } = await supabase.rpc("chess_register_user", {
    p_username: username,
    p_email: email,
    p_password_hash: passwordHash,
  });
  if (error) {
    return NextResponse.json(
      { error: rpcError(error) },
      { status: error.message?.includes("duplicate_") ? 409 : 400 }
    );
  }
  return NextResponse.json({ ok: true, userId: (data as { user_id: string }).user_id });
}
