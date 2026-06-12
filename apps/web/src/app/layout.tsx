import { ThemeProvider } from '@/components/home/theme-provider';
import { siteMetadata } from '@/lib/site-metadata';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { ReactQueryProvider } from './react-query-provider';
import { Toaster } from '@/components/ui/sonner';
import '@/lib/polyfills';
import { roobert } from './fonts/roobert';
import { roobertMono } from './fonts/roobert-mono';
import { Suspense, lazy } from 'react';
import { I18nProvider } from '@/components/i18n-provider';
import { getServerPublicEnv } from '@/lib/public-env-server';
import { featureFlags } from '@/lib/feature-flags';
import { connection } from 'next/server';
import { BrowserNoiseGuard } from '@/components/browser-noise-guard';
import { DesktopChrome } from '@/components/desktop/desktop-chrome';
import { DESKTOP_INIT_SCRIPT } from '@/lib/desktop';

// Lazy load non-critical global components.
// GTM / PostHog / Vercel Analytics+SpeedInsights were removed: self-hosted
// internal deployment — no product analytics, and the Vercel collectors only
// work on Vercel infrastructure anyway. Sentry (errors) stays, wired in
// instrumentation-client.ts.
const AnnouncementDialog = lazy(() => import('@/components/announcements/announcement-dialog').then(mod => ({ default: mod.AnnouncementDialog })));
const AuthParamsCleanup = lazy(() => import('@/components/analytics/auth-params-cleanup').then(mod => ({ default: mod.AuthParamsCleanup })));
const LocalhostLinkInterceptor = lazy(() => import('@/components/localhost-link-interceptor').then(mod => ({ default: mod.LocalhostLinkInterceptor })));
// Not lazy — wraps {children} so it must be available for SSR to avoid hydration mismatch
import { IntegrationConnectProvider } from '@/components/integrations/integration-connect-provider';


export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' }
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteMetadata.url),
  title: {
    default: siteMetadata.title,
    template: `%s | ${siteMetadata.name}`,
  },
  description: siteMetadata.description,
  keywords: siteMetadata.keywords,
  authors: [{ name: 'Ymagine', url: 'https://ymagine.app' }],
  creator: 'Ymagine',
  publisher: 'Ymagine',
  applicationName: siteMetadata.name,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    title: siteMetadata.title,
    description: siteMetadata.description,
    url: siteMetadata.url,
    siteName: siteMetadata.name,
    locale: 'en_US',
    images: [
      {
        url: '/banner.png',
        width: 1200,
        height: 630,
        alt: `${siteMetadata.title} – ${siteMetadata.description}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteMetadata.title,
    description: siteMetadata.description,
    creator: '@ymagineapp',
    site: '@ymagineapp',
    images: ['/banner.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32' },
      { url: '/favicon-light.png', sizes: '32x32', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: '/favicon.png',
    apple: [{ url: '/logo_black.png', sizes: '180x180' }],
  },
  manifest: '/manifest.json',
  alternates: {
    canonical: siteMetadata.url,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Opt into dynamic rendering so process.env is evaluated at request time,
  // not baked at build time. Critical for Docker images with runtime env vars.
  await connection();
  const runtimeEnv = getServerPublicEnv();

  // Preconnect to the cross-origin services the app hits during boot
  // (Supabase auth, backend API). Starting DNS+TCP+TLS while the JS bundles
  // are still downloading shaves a round-trip off the first authenticated
  // request. Same-origin entries are filtered out (preconnect would be a
  // no-op) and parse failures are ignored.
  const toOrigin = (value?: string | null): string | null => {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  };
  const appOrigin = toOrigin(runtimeEnv.APP_URL);
  const preconnectOrigins = Array.from(
    new Set(
      [runtimeEnv.SUPABASE_URL, runtimeEnv.BACKEND_URL]
        .map((value) => toOrigin(value))
        .filter((origin): origin is string => !!origin && origin !== appOrigin),
    ),
  );

  return (
    <html lang="en" translate="no" suppressHydrationWarning className={`notranslate ${roobert.variable} ${roobertMono.variable}`}>
      <head>
        {/* Runtime config — evaluated at request time via connection() above.
            Docker images get correct env vars regardless of build-time defaults. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__YMAGINE_RUNTIME_CONFIG=${JSON.stringify(runtimeEnv)};window.__KORTIX_RUNTIME_CONFIG=window.__YMAGINE_RUNTIME_CONFIG;window.__RUNTIME_ENV=window.__YMAGINE_RUNTIME_CONFIG;`,
          }}
        />

        {/* Desktop runtime detection — runs before hydration so CSS reacts on first paint. */}
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_INIT_SCRIPT }} />

        {/* Font preloading is handled automatically by next/font/local in fonts/roobert.ts */}

        {/* Prevent browser auto-translate (Google Translate, Chrome, etc.) from
            mutating the DOM. When translators modify text nodes, React's reconciler
            crashes with "Failed to execute 'insertBefore' on 'Node'".
            The app ships its own i18n via next-intl (en, de, it, zh, ja, pt, fr, es)
            so browser translation is unnecessary and actively harmful. */}
        <meta name="google" content="notranslate" />

        {/* Preconnect to Supabase/backend so the first auth + API requests
            skip DNS+TCP+TLS setup (browser fetches are CORS-anonymous). */}
        {preconnectOrigins.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}

        {/* Static SEO meta tags - rendered in initial HTML */}
        <title>Ymagine – AI Agent Platform</title>
        <meta name="description" content="A cloud computer where AI agents run your business. Connect thousands of tools, configure autonomous agents, set triggers — and the machine operates 24/7 with persistent memory." />
        <meta name="keywords" content="Ymagine, AI agents, autonomous agents, AI automation, agent orchestration, cloud computer, persistent memory, AI operations" />
        <meta property="og:title" content="Ymagine – AI Agent Platform" />
        <meta property="og:description" content="A cloud computer where AI agents run your business. Connect thousands of tools, configure autonomous agents, set triggers — and the machine operates 24/7 with persistent memory." />
        <meta property="og:image" content="https://ymagine.app/favicon.png" />
        <meta property="og:url" content="https://ymagine.app" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Ymagine" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ymagine – AI Agent Platform" />
        <meta name="twitter:description" content="A cloud computer where AI agents run your business. Connect thousands of tools, configure autonomous agents, set triggers — and the machine operates 24/7 with persistent memory." />
        <meta name="twitter:image" content="https://ymagine.app/favicon.png" />
        <link rel="canonical" href="https://ymagine.app" />

        {/* iOS Smart App Banner removed — Ymagine does not have a separate iOS app */}



        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: siteMetadata.name,
              alternateName: ['Ymagine'],
              url: siteMetadata.url,
              logo: `${siteMetadata.url}/favicon.png`,
              description: siteMetadata.description,
              foundingDate: '2024',
              sameAs: [
                siteMetadata.url,
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'Customer Support',
                url: siteMetadata.url,
              },
            }),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: siteMetadata.title,
              alternateName: [siteMetadata.name],
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web, macOS, Windows, Linux',
              description: siteMetadata.description,
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            }),
          }}
        />
      </head>

      <body translate="no" className="notranslate antialiased font-sans bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BrowserNoiseGuard />
          <DesktopChrome />
          <AuthProvider>
            <I18nProvider>
              <ReactQueryProvider>
                <IntegrationConnectProvider>
                  {children}
                </IntegrationConnectProvider>
                <Toaster />
              </ReactQueryProvider>
            </I18nProvider>
          </AuthProvider>
          {/* Strips ?auth_event/&auth_method from the URL after OAuth
              redirects (used to also feed GTM — tracking removed, the URL
              cleanup behavior stays). */}
          <Suspense fallback={null}>
            <AuthParamsCleanup />
          </Suspense>
          <Suspense fallback={null}>
            <LocalhostLinkInterceptor />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
