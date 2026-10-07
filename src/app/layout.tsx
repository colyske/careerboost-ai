import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CareerBoost | Careers Beyond Borders", template: "%s | CareerBoost" },
  description: "Practical career tools for professionals exploring global opportunities.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
