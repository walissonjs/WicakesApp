'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/src/lib/supabase/client'
import type { Product } from '@/src/lib/types'

export default function EstoquePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todos' | 'insumo' | 'revenda'>('todos')
  const [search, setSearch] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error(error)
      setError('Erro ao carregar produtos. Verifique se as tabelas foram criadas e as chaves do Supabase estão corretas.')
    } else {
      setProducts(data || [])
    }
    setLoading(false)
  }

  // Filtros
  const filtered = products.filter((p) => {
    const matchType = filter === 'todos' || p.type === filter
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  // Contadores
  const lowStockCount = products.filter((p) => p.current_stock <= p.min_stock && p.active).length
  const totalProducts = products.length

  function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function formatNumber(value: number) {
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Controle de Estoque</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalProducts} produtos cadastrados
            {lowStockCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                • {lowStockCount} em nível crítico
              </span>
            )}
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium rounded-lg transition"
        >
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        />

        <div className="flex gap-2">
          {(['todos', 'insumo', 'revenda'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                filter === f
                  ? 'bg-amber-700 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'insumo' ? 'Insumos' : 'Revenda'}
            </button>
          ))}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando estoque...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Nenhum produto encontrado.
          <br />
          <span className="text-sm">Cadastre produtos na próxima etapa.</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Produto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Tipo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Estoque</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Mínimo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Custo Médio</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((product) => {
                  const isLow = product.current_stock <= product.min_stock
                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-gray-50 transition ${isLow ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            product.type === 'insumo'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {product.type === 'insumo' ? 'Insumo' : 'Revenda'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNumber(product.current_stock)} {product.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono">
                        {formatNumber(product.min_stock)} {product.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(product.average_cost)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ⚠️ Crítico
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
