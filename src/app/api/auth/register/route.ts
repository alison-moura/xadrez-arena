import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email.toLowerCase();

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (exists) {
      return NextResponse.json(
        { error: "Usuário ou email já cadastrado" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        wallet: { create: { balance: 1000, locked: 0 } },
      },
    });

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "DEPOSIT",
        amount: 1000,
        balanceAfter: 1000,
        note: "Bônus de boas-vindas",
      },
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
