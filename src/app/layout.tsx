import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio | Генератор 8-10 минутных видео",
  description: "Автоматическая генерация 8-10 минутных видеороликов: сценарий GPT-4o, голос OpenAI TTS, визуализация DALL-E 3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-[#08090d] text-slate-100 min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
        <div className="relative flex flex-col min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
