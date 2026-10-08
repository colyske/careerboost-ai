import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CareerBoost | Make your next career move", template: "%s | CareerBoost" },
  description: "Practical career planning, ATS resume drafts, LinkedIn writing, interview practice, and short courses for professionals exploring global opportunities.",
  applicationName: "CareerBoost",
  openGraph: {
    type: "website",
    siteName: "CareerBoost",
    title: "CareerBoost | Make your next career move",
    description: "Practical career tools for professionals exploring global opportunities.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
