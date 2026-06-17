"use client";
import { useState } from "react";

export function FollowButton({ userId, initialFollowing }: { userId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/users/${userId}/follow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: following ? "unfollow" : "follow" }),
    });
    setBusy(false);
    if (res.ok) setFollowing((v) => !v);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-xs transition-colors ${
        following
          ? "border-border bg-surfaceAlt text-muted hover:border-danger/40 hover:text-danger"
          : "border-accent bg-accent text-black font-medium"
      }`}
    >
      {following ? "✓ Seguindo" : "Seguir"}
    </button>
  );
}
