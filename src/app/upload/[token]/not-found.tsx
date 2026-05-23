export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-2xl font-bold">ContaAI</h1>

        <div className="rounded-xl border bg-card p-8 shadow-sm space-y-3">
          <p className="text-4xl">🔗</p>
          <h2 className="text-xl font-semibold">Este enlace ya no es válido</h2>
          <p className="text-sm text-muted-foreground">
            El enlace ha expirado, ya fue utilizado, o no existe.
          </p>
          <p className="text-sm text-muted-foreground">
            Solicita un nuevo enlace al contador.
          </p>
        </div>
      </div>
    </main>
  )
}
