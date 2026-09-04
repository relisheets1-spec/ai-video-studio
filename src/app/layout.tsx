import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio · Full HD 1080p @ 30 FPS",
  description: "Генерация видеоисторий из Full HD кадров с озвучкой ElevenLabs и синхронными субтитрами.",
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
