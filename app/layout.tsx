import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GodSim",
  description:
    "A web-based Grand Strategy & God-Sim hybrid: supply/demand economy, nation ruling, and sandbox god mode.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
