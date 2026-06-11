'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { LogOut, Menu, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { EmpresaSwitcher } from '@/components/empresa-switcher'
import { SidebarNav } from './sidebar-nav'
import { useEmpresaActiva } from '@/hooks/use-empresa-activa'

interface DashboardHeaderProps {
  email: string
  empresas: Array<{ id: string; nombre: string; ruc: string | null }>
}

export function DashboardHeader({ email, empresas }: DashboardHeaderProps) {
  const router = useRouter()
  const { empresaId } = useEmpresaActiva(empresas)
  const [menuOpen, setMenuOpen] = useState(false)
  const empresaActiva = empresas.find((e) => e.id === empresaId) ?? empresas[0]
  const periodo = format(new Date(), "MMMM yyyy", { locale: es })
  const iniciales = email.slice(0, 2).toUpperCase()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b px-3 md:px-6 py-3 flex items-center justify-between gap-2 bg-background shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Menú móvil */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menú</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="md:hidden">
            <SheetHeader className="border-b">
              <SheetTitle>ContaAI</SheetTitle>
              <SheetDescription>Powered by Gemma 4</SheetDescription>
            </SheetHeader>
            <div className="px-4 py-3 border-b">
              <EmpresaSwitcher empresas={empresas} />
            </div>
            {/* Cerrar el sheet al navegar */}
            <div className="flex-1 px-3 py-3 overflow-y-auto" onClick={() => setMenuOpen(false)}>
              <SidebarNav />
            </div>
            <div className="px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </SheetContent>
        </Sheet>

        {empresaActiva && (
          <Badge variant="secondary" className="font-medium max-w-[40vw] md:max-w-none">
            <span className="truncate">{empresaActiva.nombre}</span>
          </Badge>
        )}
        <span className="hidden sm:inline text-sm text-muted-foreground capitalize whitespace-nowrap">
          {periodo}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 shrink-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {iniciales}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5">
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/config" className="flex items-center gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              Perfil
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
