"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/lobby";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError("Credenciais inválidas");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mt-1 text-sm text-muted">Acesse sua conta para jogar.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label">Usuário ou email</label>
          <input
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
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
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-muted hover:text-white">
          <span>♞</span>
          <span>Xadrez Arena</span>
        </Link>
        <Suspense fallback={<div className="card">Carregando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
