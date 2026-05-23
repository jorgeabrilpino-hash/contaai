'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { LogOut, User } from 'lucide-react'
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
import { useEmpresaActiva } from '@/hooks/use-empresa-activa'

interface DashboardHeaderProps {
  email: string
  empresas: Array<{ id: string; nombre: string; ruc: string | null }>
}

export function DashboardHeader({ email, empresas }: DashboardHeaderProps) {
  const router = useRouter()
  const { empresaId } = useEmpresaActiva(empresas)
  const empresaActiva = empresas.find((e) => e.id === empresaId) ?? empresas[0]
  const periodo = format(new Date(), "MMMM yyyy", { locale: es })
  const iniciales = email.slice(0, 2).toUpperCase()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b px-6 py-3 flex items-center justify-between bg-background shrink-0">
      <div className="flex items-center gap-3">
        {empresaActiva && (
          <Badge variant="secondary" className="font-medium">
            {empresaActiva.nombre}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground capitalize">
          {periodo}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
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
