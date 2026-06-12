# BDD — Behavior Driven Development
## ContaAI — Escenarios de comportamiento (Gherkin)

**Versión:** 2.0 · **Última actualización:** 10 junio 2026

Estos escenarios definen el comportamiento esperado del sistema. Sirven como
contrato funcional y como guía para QA manual o automatizado (Playwright).
Leyenda de estado: ✅ implementado y verificado · ⚠️ implementado sin verificar · ❌ pendiente

---

## Feature: Autenticación

```gherkin
Escenario: Login exitoso                                              ✅
  Dado que existe un usuario registrado
  Cuando ingresa email y contraseña correctos en /login
  Entonces es redirigido a /dashboard

Escenario: Login con credenciales incorrectas                         ✅
  Cuando ingresa credenciales inválidas
  Entonces ve "Credenciales incorrectas. Verifica tu email y contraseña."
  Y permanece en /login

Escenario: Ruta protegida sin sesión                                  ✅
  Cuando un visitante anónimo navega a /documentos
  Entonces es redirigido a /login

Escenario: Sesión expirada por inactividad                            ✅
  Dado un usuario autenticado inactivo por más de 30 minutos
  Cuando hace cualquier request de página
  Entonces su sesión se cierra y ve el aviso "sesión cerrada por inactividad"

Escenario: Usuario autenticado visita /login                          ✅
  Entonces es redirigido a /dashboard
```

## Feature: Gestión de empresas

```gherkin
Escenario: Crear empresa válida                                       ✅
  Cuando completa nombre, rubro y RUC de 11 dígitos
  Entonces la empresa se guarda, aparece en la lista
  Y ve un toast "Empresa creada correctamente"
  Y el switcher del sidebar se actualiza sin recargar (router.refresh)

Escenario: RUC inválido                                               ✅
  Cuando ingresa un RUC con menos de 11 dígitos
  Entonces ve "El RUC debe tener exactamente 11 dígitos numéricos."
  Y el formulario no se envía

Escenario: Eliminar empresa con confirmación accesible                ✅
  Cuando hace clic en eliminar
  Entonces se abre un AlertDialog (no window.confirm)
  Y al confirmar, la empresa se elimina con toast de éxito

Escenario: Eliminar empresa con documentos                            ✅
  Dado que la empresa tiene documentos registrados
  Cuando intenta eliminarla
  Entonces ve "No se puede eliminar: tiene N documentos"

Escenario: Aislamiento multi-usuario                                  ✅
  Dado dos contadores con empresas distintas
  Cuando el contador B lista sus empresas
  Entonces NUNCA ve empresas ni documentos del contador A
```

## Feature: Subida de documentos con OCR en tiempo real

```gherkin
Escenario: Subida con análisis de Gemma 4                             ⚠️
  Dado un usuario autenticado con empresa activa
  Cuando sube una imagen JPG/PNG de una factura
  Entonces ve "Gemma 4 analizando tu comprobante..."
  Y al terminar ve: tipo, emisor, RUC, fecha, montos, deducible,
    cuenta PCGE sugerida con % de confianza
  Y puede cambiar la cuenta PCGE desde un selector
  Y al confirmar, el documento queda en estado "confirmado"

Escenario: Degradación elegante si la IA falla                        ⚠️
  Dado que todos los modelos de OpenRouter están rate-limited
  Cuando sube una imagen
  Entonces el documento se guarda igual en estado "pendiente"
  Y ve "La IA no pudo procesarlo en este momento; los datos se
    extraerán al exportar a Excel."
  (el archivo del usuario NUNCA se pierde)

Escenario: Subida de PDF                                              ⚠️
  Cuando sube un PDF
  Entonces se guarda sin OCR (diferido al exportar)

Escenario: Archivo inválido                                           ✅
  Cuando sube un archivo > 5MB o de tipo no permitido
  Entonces ve el mensaje de error correspondiente y nada se guarda

Escenario: Notificación al contador                                   ⚠️
  Dado un contador con Telegram vinculado
  Cuando se procesa un documento con éxito (OCR completo)
  Entonces recibe en Telegram el resumen: tipo, total, cuenta, confianza
  Y el mensaje NUNCA contiene RUC ni razón social del proveedor
```

## Feature: Enlace público de subida (/upload/[token])

```gherkin
Escenario: Enlace válido                                              ✅
  Dado un token no usado que expira en 15 minutos
  Cuando el cliente externo abre /upload/[token]
  Entonces ve el nombre de la empresa y un countdown en vivo
  Y puede subir un comprobante sin iniciar sesión

Escenario: Token usado o expirado                                     ✅
  Cuando abre un enlace ya usado o vencido
  Entonces ve 404 / "Este enlace ha expirado"

Escenario: Un token = una subida                                      ✅
  Cuando sube un documento con éxito
  Entonces el token queda marcado como usado y no puede reutilizarse

Escenario: La API de subida no redirige a login                       ✅
  Cuando el cliente externo (sin sesión) hace POST a /api/documents/process
    con token válido
  Entonces la API responde JSON 200 (nunca 307 a /login)
```

## Feature: Bot de Telegram — chat inteligente

```gherkin
Escenario: Vinculación con deep link                                  ⚠️
  Dado un código generado en /config
  Cuando el usuario toca "Abrir Telegram y conectar" y pulsa Start
  Entonces el bot vincula su telegram_id y responde con la ayuda
  Y la página /config pasa sola a "Conectado" (polling 4s)

Escenario: Chat inteligente con datos reales                          ⚠️
  Dado un contador vinculado con documentos en el período
  Cuando pregunta "¿cómo voy este mes?" (lenguaje natural, no comando)
  Entonces Gemma 4 responde con el IGV, base imponible y documentos reales
  Y la respuesta NUNCA contiene RUCs ni montos individuales de proveedores

Escenario: Pregunta contable general                                  ⚠️
  Cuando pregunta "¿qué cuenta PCGE uso para compras de gasolina?"
  Entonces responde como experto contador peruano, breve y en español

Escenario: Enlace de subida desde el bot                              ⚠️
  Cuando escribe "subir factura" (o "quiero mandar una foto")
  Entonces recibe un enlace https://<app>/upload/<token> que expira en 15 min

Escenario: Rechazo de archivos                                        ✅
  Cuando envía una foto o documento directamente al bot
  Entonces el bot lo rechaza con mensaje educativo y ofrece el enlace seguro

Escenario: Fallback sin IA                                            ⚠️
  Dado que OpenRouter está caído
  Cuando el contador hace una pregunta
  Entonces recibe el resumen de plantilla con los datos reales del período

Escenario: Usuario no vinculado                                       ✅
  Cuando alguien sin vincular escribe al bot
  Entonces recibe instrucciones de vinculación (nunca datos)

Escenario: Validar cuenta vinculada (/cuenta)                          ✅
  Dado un contador vinculado
  Cuando envía /cuenta
  Entonces ve su nombre y su email ENMASCARADO (jo*****@gmail.com)
  Y nunca el email completo

Escenario: Cerrar sesión desde el chat (/cerrar)                       ⚠️
  Dado un contador vinculado
  Cuando envía /cerrar
  Entonces su telegram_id se elimina del perfil
  Y el chat pierde todo acceso a datos contables
  Y recibe instrucciones para volver a vincular

Escenario: Cambio de cuenta en el mismo Telegram                       ⚠️
  Dado un Telegram vinculado a la cuenta A
  Cuando envía /start con el código de la cuenta B
  Entonces la cuenta A queda desvinculada automáticamente
  Y el bot informa "esa sesión se cerró automáticamente"
  Y las consultas siguientes responden con datos de B (nunca de A)

Escenario: Dos personas distintas, dos cuentas                         ✅
  Dado los contadores A y B con sus propios Telegram vinculados
  Cuando cada uno consulta al bot
  Entonces cada chat_id resuelve a SU perfil y SUS empresas
  Y los datos jamás se cruzan (telegram_id es UNIQUE)
```

## Feature: Configuración — vinculación Telegram

```gherkin
Escenario: Estado conectado visible                                   ✅
  Dado un usuario con telegram_id en su perfil
  Cuando abre /config
  Entonces ve el badge verde "Conectado" y el botón "Desvincular"
  Y NO ve botones de generar código

Escenario: Un solo código reutilizable                                ✅
  Dado un usuario con un código pendiente sin usar
  Cuando vuelve a /config y pulsa "Conectar Telegram"
  Entonces recibe EL MISMO código (no se generan códigos infinitos)

Escenario: Detección automática de conexión                           ⚠️
  Dado que la página muestra "Esperando conexión..."
  Cuando completa la vinculación en Telegram
  Entonces en ≤ 4 segundos la página muestra "Conectado" sin recargar
```

## Feature: Reportes y exportación

```gherkin
Escenario: Reporte agrupado por cuenta PCGE                           ✅
  Dado documentos confirmados en el período
  Cuando abre /reportes
  Entonces ve KPIs (IGV, base) y la tabla agrupada con fila TOTAL

Escenario: Export Excel 3 hojas                                       ✅
  Cuando descarga el Excel del período
  Entonces obtiene: Registro de Compras, Resumen por Cuenta, Información
  Y los documentos sin datos de IA se procesan con Gemma 4 antes de exportar

Escenario: Botón de export sin parpadeo                               ✅
  Cuando la página /exportar está cargando
  Entonces el contador de docs nunca muestra "null"
```

## Feature: Responsive

```gherkin
Escenario: Navegación móvil                                           ⚠️
  Dado un viewport < 768px
  Cuando abre cualquier página del dashboard
  Entonces el sidebar está oculto y hay un botón hamburguesa
  Y el menú lateral se abre como Sheet con switcher + navegación

Escenario: Tablas en móvil                                            ⚠️
  Cuando ve documentos/empresas/reportes en móvil
  Entonces las tablas tienen scroll horizontal sin romper el layout

Escenario: Headers apilados                                           ⚠️
  Cuando ve los headers de página en móvil
  Entonces título y acciones se apilan verticalmente sin desbordar
```
