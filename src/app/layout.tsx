import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'devpilot',
  description: 'Local-first observability for AI-assisted development',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="h-full bg-gray-950">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
