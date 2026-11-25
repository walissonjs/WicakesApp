export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Wicakes Delícias</h1>
        <p className="text-gray-500 mt-1">Sistema de gestão interno</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <a
          href="/estoque"
          className="bg-white border border-gray-200 rounded-xl p-5 hover:border-amber-500 hover:shadow-md transition group"
        >
          <div className="text-2xl mb-2">📦</div>
          <h2 className="font-semibold text-gray-900 group-hover:text-amber-700">Estoque</h2>
          <p className="text-sm text-gray-500 mt-1">Controle de insumos e produtos de revenda</p>
        </a>

        <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60">
          <div className="text-2xl mb-2">🛒</div>
          <h2 className="font-semibold text-gray-900">Pedidos</h2>
          <p className="text-sm text-gray-500 mt-1">Em breve</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60">
          <div className="text-2xl mb-2">🍕</div>
          <h2 className="font-semibold text-gray-900">Cardápio</h2>
          <p className="text-sm text-gray-500 mt-1">Em breve</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60">
          <div className="text-2xl mb-2">📊</div>
          <h2 className="font-semibold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Em breve</p>
        </div>
      </div>
    </div>
  )
}
