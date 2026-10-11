import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Merveille · La Boîte à Merveilles",
  description:
    "Un chapitre, une découverte. Votre espace de lecture et de quiz.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
