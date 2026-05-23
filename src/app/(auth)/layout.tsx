import Link from 'next/link'

interface AuthLayoutProps {
  children: React.ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-block">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">
            ContaAI
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Asistente Contable Inteligente
          </p>
        </Link>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
