import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio · Full HD 1080p @ 45 FPS",
  description: "Генерация 8–10 минутных видеоисторий из 30–35 Full HD кадров с озвучкой OpenAI TTS и синхронными субтитрами.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-[#090a0c] text-[#ededed] min-h-screen antialiased selection:bg-white selection:text-black">
        <div className="relative flex flex-col min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
