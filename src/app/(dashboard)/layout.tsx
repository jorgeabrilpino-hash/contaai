import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EmpresaSwitcher } from '@/components/empresa-switcher'
import { SidebarNav } from './_components/sidebar-nav'
import { DashboardHeader } from './_components/dashboard-header'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: empresas } = await supabase
    .from('empresas')
    .select('id, nombre, ruc')
    .eq('user_id', user.id)
    .order('created_at')

  const empresasList = empresas ?? []

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — solo desktop; en móvil se usa el menú del header */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b">
          <h1 className="text-xl font-bold tracking-tight">ContaAI</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Powered by Gemma 4
          </p>
        </div>

        {/* Empresa Switcher */}
        <div className="px-4 py-3 border-b">
          <EmpresaSwitcher empresas={empresasList} />
        </div>

        {/* Navegación */}
        <div className="flex-1 px-3 py-3 overflow-y-auto">
          <SidebarNav />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t">
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">
            Powered by Gemma 4
          </p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardHeader email={user.email ?? ''} empresas={empresasList} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
