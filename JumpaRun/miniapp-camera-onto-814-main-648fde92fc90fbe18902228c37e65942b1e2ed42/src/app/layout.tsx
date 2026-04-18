import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Jumparun | Endless Runner on Base',
  description:
    'Sleek endless runner with power-ups, coin collecting and on-chain swaps. Powered by the $JUMP token on Base.',
  applicationName: 'Jumparun',
  authors: [{ name: 'Jumparun' }],
  keywords: ['jumparun', 'base', 'game', 'jump', 'token', 'onchain', 'runner'],
  openGraph: {
    title: 'Jumparun',
    description: 'Endless runner on Base. Jump, dash, collect — and swap $JUMP.',
    type: 'website',
  },
  other: {
    'base:app_id': '6943dd0cd77c069a945bdffd',
  },
};

export const viewport: Viewport = {
  themeColor: '#05070F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} bg-background`}>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: 'hsl(222 40% 8%)',
              border: '1px solid hsl(190 95% 50% / 0.25)',
              color: 'hsl(210 20% 96%)',
            },
          }}
        />
      </body>
    </html>
  );
}
