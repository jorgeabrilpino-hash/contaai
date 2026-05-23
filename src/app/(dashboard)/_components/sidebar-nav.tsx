'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Download,
  Building2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/exportar', label: 'Exportar', icon: Download },
  { href: '/empresas', label: 'Empresas', icon: Building2 },
  { href: '/config', label: 'Configuración', icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
