import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Interview Coach | Technical practice", description: "Practice coding, explain your thinking, and reflect on your interview." };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
