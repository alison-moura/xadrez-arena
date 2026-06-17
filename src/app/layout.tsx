import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Xadrez Arena — jogue, aposte e ganhe",
  description:
    "Plataforma de xadrez online multiplayer com sistema de apostas em coins. Crie partidas, desafie oponentes e leve o pote.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Xadrez Arena",
  },
  openGraph: {
    title: "Xadrez Arena",
    description: "Jogue xadrez online com torneios, apostas, análise por Stockfish e skins.",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xadrez Arena",
    description: "Jogue xadrez online com torneios, apostas, análise por Stockfish e skins.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5b301",
  width: "device-width",
  initialScale: 1,
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
