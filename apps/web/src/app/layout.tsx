import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://velum.chitechnologies.name.ng"),
  title: "Velum — meet through conversation",
  description: "An invite-only space for thoughtful conversation, mutual choice and intentional connection.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Velum — meet the mind before the image",
    description: "Private, intentional conversations before appearance.",
    url: "https://velum.chitechnologies.name.ng",
    siteName: "Velum",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

