/**
 * Plan Contable General Empresarial (PCGE) — Perú
 * Cuentas más frecuentes en compras de MYPEs
 */
export const PCGE_CUENTAS = [
  // Existencias (compras de mercadería e insumos)
  { codigo: '60.1', nombre: 'Mercaderías' },
  { codigo: '60.2', nombre: 'Materias primas' },
  { codigo: '60.3', nombre: 'Materiales auxiliares, suministros y repuestos' },
  { codigo: '60.5', nombre: 'Materiales auxiliares' },

  // Servicios prestados por terceros
  { codigo: '63.1', nombre: 'Transporte y almacenamiento' },
  { codigo: '63.2', nombre: 'Asesoría y consultoría' },
  { codigo: '63.3', nombre: 'Producción encargada a terceros' },
  { codigo: '63.4', nombre: 'Mantenimiento y reparaciones' },
  { codigo: '63.5', nombre: 'Servicios públicos (agua, luz, gas)' },
  { codigo: '63.6', nombre: 'Servicios de comunicaciones' },
  { codigo: '63.7', nombre: 'Publicidad, publicaciones y relaciones públicas' },
  { codigo: '63.8', nombre: 'Servicios de seguridad y vigilancia' },
  { codigo: '63.9', nombre: 'Otros servicios prestados por terceros' },

  // Gastos por tributos, seguros y alquileres
  { codigo: '64.1', nombre: 'Gobierno central (tributos)' },
  { codigo: '64.2', nombre: 'Gobierno local (arbitrios, licencias)' },
  { codigo: '65.1', nombre: 'Seguros' },
  { codigo: '65.2', nombre: 'Regalías' },
  { codigo: '65.3', nombre: 'Alquileres' },

  // Activos fijos (maquinaria y equipo)
  { codigo: '33.1', nombre: 'Maquinarias y equipos de explotación' },
  { codigo: '33.2', nombre: 'Equipos de transporte' },
  { codigo: '33.3', nombre: 'Equipos de cómputo' },
  { codigo: '33.4', nombre: 'Unidades de reemplazo' },
  { codigo: '33.6', nombre: 'Equipos diversos' },
  { codigo: '33.7', nombre: 'Herramientas y unidades de reemplazo' },
  { codigo: '33.9', nombre: 'Otros activos' },

  // Activos intangibles
  { codigo: '34.1', nombre: 'Concesiones, licencias y otros derechos' },
  { codigo: '34.4', nombre: 'Programas de cómputo (software)' },

  // Arrendamiento financiero
  { codigo: '32.1', nombre: 'Activos adquiridos en arrendamiento financiero' },

  // Inventarios
  { codigo: '20.1', nombre: 'Mercaderías manufacturadas' },
  { codigo: '21.1', nombre: 'Productos terminados' },
  { codigo: '23.1', nombre: 'Productos en proceso' },
  { codigo: '25.1', nombre: 'Materiales auxiliares' },
  { codigo: '26.1', nombre: 'Envases y embalajes' },

  // Gastos de personal
  { codigo: '62.1', nombre: 'Remuneraciones' },
  { codigo: '62.2', nombre: 'Otras remuneraciones' },
  { codigo: '62.7', nombre: 'Seguridad y previsión social' },

  // Gastos financieros
  { codigo: '67.1', nombre: 'Intereses de deudas' },
  { codigo: '67.2', nombre: 'Comisiones y gastos bancarios' },

  // Depreciación y amortización
  { codigo: '68.1', nombre: 'Depreciación de activos fijos' },
  { codigo: '68.2', nombre: 'Amortización de intangibles' },

  // Cuentas de costo
  { codigo: '90.1', nombre: 'Costos de producción' },
  { codigo: '91.1', nombre: 'Costo de ventas' },
  { codigo: '94.1', nombre: 'Gastos administrativos' },
  { codigo: '95.1', nombre: 'Gastos de ventas' },
  { codigo: '79.1', nombre: 'Cargas imputables a cuentas de costos y gastos' },

  // Cuentas por pagar
  { codigo: '40.1', nombre: 'IGV - Crédito fiscal' },
  { codigo: '42.1', nombre: 'Proveedores - Facturas por pagar' },
  { codigo: '46.1', nombre: 'Cuentas por pagar diversas' },
] as const

export type PCGECuenta = (typeof PCGE_CUENTAS)[number]
export type PCGECodigo = PCGECuenta['codigo']

/**
 * Busca una cuenta PCGE por su código
 */
export function findPCGE(codigo: string): PCGECuenta | undefined {
  return PCGE_CUENTAS.find((c) => c.codigo === codigo)
}

/**
 * Busca cuentas PCGE por texto (código o nombre)
 */
export function searchPCGE(query: string): PCGECuenta[] {
  const q = query.toLowerCase()
  return PCGE_CUENTAS.filter(
    (c) => c.codigo.includes(q) || c.nombre.toLowerCase().includes(q)
  )
}