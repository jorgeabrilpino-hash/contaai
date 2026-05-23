'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface PeriodoSelectorProps {
  defaultValue: string
}

export function PeriodoSelector({ defaultValue }: PeriodoSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', e.target.value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <input
      type="month"
      defaultValue={defaultValue}
      onChange={handleChange}
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  )
}
