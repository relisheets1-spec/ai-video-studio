import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio · Full HD 1080p @ 30 FPS",
  description:
    "Генерация видеоисторий из Full HD кадров с озвучкой ElevenLabs и синхронными субтитрами.",
};

// Ставит тему до первой отрисовки, иначе на перезагрузке мигает светлым.
const themeScript = `(function(){try{var t=localStorage.getItem('ai_video_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

// Шрифты подключены ссылкой, а не через next/font, потому что путь проекта
// содержит символ «#» (…/Nurtaskot#08). Загрузчик next/font строит внутренний
// URL с query-строкой, и «#» обрывает его как якорь — сборка падает с
// «Module not found: next/font/google/target.css?…».
//
// Google отдаёт кириллицу и cyrillic-ext через unicode-range, поэтому
// казахские «ә ғ қ ң ө ұ ү һ і» приезжают сами. IBM Plex Mono взят вместо
// JetBrains Mono: последний объявляет cyrillic-ext, но казахских букв не имеет,
// а font-mono здесь стоит и на русских строках, не только на цифрах.
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body className="font-sans min-h-screen antialiased">
        <ThemeProvider>
          <ToastProvider>
            <div className="relative flex flex-col min-h-screen">{children}</div>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
