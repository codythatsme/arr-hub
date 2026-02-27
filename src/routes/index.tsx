import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="relative max-w-5xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-black text-white [letter-spacing:-0.08em]">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              arr-hub
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mt-4">
            Media management dashboard
          </p>
        </div>
      </section>
    </div>
  )
}
