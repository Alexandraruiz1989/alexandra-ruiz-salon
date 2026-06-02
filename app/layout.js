import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "./PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Alexandra Ruiz Salón",
  description: "Calculadora y sitio web de Alexandra Ruiz Salón Spa",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "AR Salón",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#bd7b83" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AR Salón" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/logo-alexandra-ruiz.png" />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}