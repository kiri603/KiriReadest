import * as React from 'react';
import { EnvProvider } from '@/context/EnvContext';
import Providers from '@/components/Providers';

import '../styles/globals.css';

const title = 'KiriReadest';
const description = 'KiriReadest ebook reader';

// Tauri's Android development proxy handles HTTP but does not upgrade WebSockets.
const androidDevHmrScript = `
  window.WebSocket = class extends window.WebSocket {
    constructor(url, protocols) {
      const endpoint = new URL(url, location.href);
      if (endpoint.origin === 'ws://tauri.localhost' && endpoint.pathname === '/_next/webpack-hmr') {
        url = 'ws://127.0.0.1:3000' + endpoint.pathname + endpoint.search;
      }
      super(url, protocols);
    }
  };
`;

export const metadata = {
  title,
  description,
  generator: 'Next.js',
  manifest: '/manifest.json',
  keywords: ['epub', 'pdf', 'ebook', 'reader', 'kirireadest', 'pwa'],
  authors: [],
  icons: [
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
    { rel: 'icon', url: '/icon.png' },
  ],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang='und'
      className={process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'tauri' ? 'edge-to-edge' : ''}
    >
      <head>
        {process.env.NODE_ENV === 'development' && process.env['KIRI_ANDROID_USB_DEV'] === '1' && (
          <script dangerouslySetInnerHTML={{ __html: androidDevHmrScript }} />
        )}
        <title>{title}</title>
        <meta
          name='viewport'
          content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
        />
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='KiriReadest' />
        <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />
        <link rel='icon' href='/favicon.ico' />
        <link rel='manifest' href='/manifest.json' />
        <meta name='description' content={description} />
      </head>
      <body>
        <EnvProvider>
          <Providers>{children}</Providers>
        </EnvProvider>
      </body>
    </html>
  );
}
