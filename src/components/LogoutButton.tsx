"use client";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-white"
    >
      Sair
    </button>
  );
}
