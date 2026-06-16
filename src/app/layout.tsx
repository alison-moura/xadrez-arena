import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Xadrez Arena — jogue, aposte e ganhe",
  description:
    "Plataforma de xadrez online multiplayer com sistema de apostas em coins. Crie partidas, desafie oponentes e leve o pote.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
