import type { NextConfig } from 'next';
import path from 'path';
import { createMDX } from 'fumadocs-mdx/next';
import { withSentryConfig } from '@sentry/nextjs';
import { withBetterStack } from '@logtail/next';

const nextConfig = (): NextConfig => ({
  output: 'standalone',
  // Hide Next.js's persistent dev badge in the corner. It only ever
  // really matters when there's a build error / route compile issue —
  // the error overlay still shows in those cases.
  devIndicators: false,

  // Pin tracing root to monorepo root so standalone preserves
  // the correct `apps/web/server.js` path structure.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Skip type checking during build (done in CI via `pnpm typecheck`)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Webpack configuration to make Konva work with Next.js
  webpack: (config) => {
    config.externals = [...config.externals, { canvas: 'canvas' }]; // required to make Konva & react-konva work
    return config;
  },

  // Turbopack configuration
  turbopack: {
    // Handle Node.js modules that shouldn't be bundled for browser builds
    // Canvas is a Node.js native module that needs to be externalized (required for Konva & react-konva)
    resolveAlias: {
      canvas: {
        browser: './src/lib/empty-module.ts', // Exclude canvas from browser builds
      },
    },
  },

  // Performance optimizations
  experimental: {
    // Optimize package imports for faster builds and smaller bundles
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
      'recharts',
      'date-fns',
      '@tanstack/react-query',
      'react-icons',
    ],
  },

  // Enable compression
  compress: true,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75, 100],
  },

  async rewrites() {
    return [
      // Proxy API calls to backend to avoid CORS in local dev
      {
        source: '/v1/:path*',
        destination: 'http://localhost:8008/v1/:path*',
      },
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/flags',
        destination: 'https://eu.i.posthog.com/flags',
      },
    ];
  },

  // HTTP headers for security, caching and performance
  async headers() {
    // Connect-src: browser makes direct calls to the Supabase Kong gateway and
    // the Hono backend. PostHog/Sentry/BetterStack are proxied through Next.js
    // rewrites so they only need 'self'. Supabase Realtime uses wss://.
    const CSP_CONNECT_SRC = [
      "'self'",
      'https://supabase.ymagine.app',
      'wss://supabase.ymagine.app',
      'https://api.ymagine.app',
      // Tunnel infrastructure — sandbox port-forwarding opens browser connections
      // to *.kortix.cloud subdomains (cf. config.ts KORTIX_TUNNEL_AGENT_HOST).
      'https://*.kortix.cloud',
      'wss://*.kortix.cloud',
    ].join(' ');

    // script-src: Next.js 15 requires 'unsafe-inline' for hydration scripts and
    // dangerouslySetInnerHTML JSON-LD blocks; 'unsafe-eval' for some dynamic
    // imports. Both are unavoidable without per-request nonces (future work).
    // The meaningful gains here are object-src none, base-uri self, and
    // connect-src restricting data exfiltration to known origins.
    const CSP = [
      "default-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src ${CSP_CONNECT_SRC}`,
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: CSP,
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.woff2',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  skipTrailingSlashRedirect: true,
});

const withMDX = createMDX();

// Compose config wrappers: MDX → Better Stack (structured logs) → Sentry (error tracking)
export default withSentryConfig(withBetterStack(withMDX(nextConfig())), {
  // Suppresses source map uploading logs during build
  silent: true,

  // Don't upload source maps during build (we can enable this later)
  sourcemaps: {
    disable: true,
  },

  // Disable Sentry CLI telemetry
  telemetry: false,

  // Tree-shake Sentry debug logger statements to reduce bundle size
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },

  // Route Sentry envelopes through our server to bypass ad-blockers.
  // Creates an auto-generated route at /monitoring that forwards to the DSN host.
  tunnelRoute: '/monitoring',
});
