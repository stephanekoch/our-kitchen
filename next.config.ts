import type { NextConfig } from "next";

// Vercel caps request bodies at 4.5 MB, so the photo import route accepts ≤4 MB and the
// client downsizes images before upload.
const nextConfig: NextConfig = {};

export default nextConfig;
