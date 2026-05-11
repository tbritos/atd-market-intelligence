import type { Metadata } from 'next';
import { Poppins, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/sidebar';

const poppins = Poppins({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '600'],
});
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ATD Workspace Monitor',
  description: 'Monitoramento de performance, SEO e uptime de concessionárias',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${poppins.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background">
              <div className="p-6 md:p-8">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
