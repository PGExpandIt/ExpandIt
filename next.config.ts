import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'export',
    basePath: '',
    // Without this the export writes out/privacy.html, and a CDN asked for /privacy
    // has to guess that it means privacy.html. With it every route becomes its own
    // directory with an index.html, which every static host resolves the same way.
    trailingSlash: true,
    images: {
        unoptimized: true,
    }
};

export default nextConfig;
