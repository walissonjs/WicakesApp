import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wicakes Delícias',
  description: 'Sistema de gestão interno - Wicakes Delícias',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <div className="min-h-screen">
          {/* Menu lateral simples (vamos melhorar depois) */}
          <header className="bg-amber-800 text-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tracking-tight">Wicakes</span>
                <span className="text-amber-200 text-sm hidden sm:inline">Delícias</span>
              </div>
              <nav className="flex gap-4 text-sm">
                <a href="/estoque" className="hover:text-amber-200 transition">Estoque</a>
                <a href="/" className="hover:text-amber-200 transition opacity-60">Pedidos</a>
                <a href="/" className="hover:text-amber-200 transition opacity-60">Cardápio</a>
                <a href="/" className="hover:text-amber-200 transition opacity-60">Dashboard</a>
              </nav>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
