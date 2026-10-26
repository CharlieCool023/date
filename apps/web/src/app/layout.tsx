import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Velum — meet through conversation",
  description: "Private, intentional conversations before appearance."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

