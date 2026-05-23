'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'empresa_activa_id'

interface Empresa {
  id: string
}

export function useEmpresaActiva(empresas: Empresa[] = []) {
  const [empresaId, setEmpresaIdState] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const valid = empresas.find((e) => e.id === stored)
    const initial = valid ? stored : (empresas[0]?.id ?? null)
    setEmpresaIdState(initial)
    if (initial && (!stored || !valid)) {
      localStorage.setItem(STORAGE_KEY, initial)
    }
  }, [empresas])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        setEmpresaIdState(e.newValue)
      }
    }
    function onEmpresaChanged(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      setEmpresaIdState(detail)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('empresaChanged', onEmpresaChanged)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('empresaChanged', onEmpresaChanged)
    }
  }, [])

  function setEmpresaId(id: string) {
    localStorage.setItem(STORAGE_KEY, id)
    setEmpresaIdState(id)
    window.dispatchEvent(new CustomEvent('empresaChanged', { detail: id }))
  }

  return { empresaId, setEmpresaId }
}
