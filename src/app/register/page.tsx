"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Erro ao cadastrar");
      setLoading(false);
      return;
    }
    const login = await signIn("credentials", {
      identifier: email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push("/lobby");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-muted hover:text-white">
          <span>♞</span>
          <span>Xadrez Arena</span>
        </Link>
        <div className="card">
          <h1 className="text-2xl font-semibold">Criar conta</h1>
          <p className="mt-1 text-sm text-muted">
            Ganhe <span className="text-accent font-semibold">1000 coins</span> de boas-vindas.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">Nome de usuário</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Criando…" : "Criar conta"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            Já tem conta?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
