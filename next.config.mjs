/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracing: false,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
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
  // subst работает на уровне DOS-устройств, и Node его не разворачивает.
  // Постоянное решение — убрать «#» из имени папки.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
