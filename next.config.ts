import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'export',
    basePath: '/ExpandIt',
    images: {
        unoptimized: true,
    }
};

export default nextConfig;
