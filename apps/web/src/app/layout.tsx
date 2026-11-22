import type { Metadata } from 'next';
import './globals.css';

function resolveMetadataBase(): URL {
  const raw = (process.env.PUBLIC_SITE_URL || 'http://localhost:3000').trim();
  try {
    return new URL(raw);
  } catch {
    return new URL('http://localhost:3000');
  }
}

export function generateMetadata(): Metadata {
  return {
    metadataBase: resolveMetadataBase(),
    title: {
      default: 'Sharm Pharaoh Travel | Egypt Excursions & Red Sea Tours',
      template: '%s | Sharm Pharaoh Travel',
    },
    description:
      'From the wonders of the Red Sea to the timeless beauty of the Pharaohs. Curated Egypt excursions across Cairo, Sharm El Sheikh, Marsa Alam, Hurghada, and Luxor & Aswan.',
    icons: {
      icon: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
