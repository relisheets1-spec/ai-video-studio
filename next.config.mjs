/** @type {import('next').NextConfig} */
const nextConfig = {
  // Сборка идёт в GitHub Actions, на сервер уезжает .next/standalone —
  // самодостаточный server.js со своими node_modules, без npm install на VPS.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // nodemailer грузится только при SMTP — пусть остаётся обычным require.
    serverComponentsExternalPackages: ["nodemailer"],
  },
  // ВНИМАНИЕ: путь проекта содержит «#» (…/Nurtaskot#08).
  // Next формирует ключи в React Client Manifest как «путь#экспорт»,
  // поэтому лишний «#» ломает разбор и ЛЮБАЯ страница падает с
  // «Could not find the module … .js#» — и в dev, и в build.
  //
  // Симлинк и junction не помогают: и webpack, и Node разворачивают их
  // в реальный путь. Рабочий обход — подменить путь буквой диска:
  //
  //     subst X: "C:\Users\oatmeal\Desktop\Nurtaskot#08"
  //     cd /d X:\  &&  npm run dev
  //
  // На сервере такой проблемы нет: код лежит в /var/www/studio.
};

export default nextConfig;
