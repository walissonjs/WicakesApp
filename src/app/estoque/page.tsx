'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'

type FilterType = 'todos' | 'insumo' | 'revenda' | 'critico'
type InputUnit = 'g' | 'kg' | 'ml' | 'l' | 'un'
type PriceMode = 'total' | 'per_kilo_or_liter' | 'per_base_unit'

function parsePtNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s+/g, '')
  if (!cleaned) return 0
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned.replace(',', '.')) || 0
}

function getAllowedInputUnits(baseUnit: 'g' | 'ml' | 'un'): InputUnit[] {
  if (baseUnit === 'g') return ['kg', 'g']
  if (baseUnit === 'ml') return ['l', 'ml']
  return ['un']
}

function defaultInputUnit(baseUnit: 'g' | 'ml' | 'un'): InputUnit {
  if (baseUnit === 'g') return 'kg'
  if (baseUnit === 'ml') return 'l'
  return 'un'
}

function toBaseQuantity(qty: number, inputUnit: InputUnit, baseUnit: 'g' | 'ml' | 'un'): number {
  if (baseUnit === 'g') {
    return inputUnit === 'kg' ? qty * 1000 : qty
  }
  if (baseUnit === 'ml') {
    return inputUnit === 'l' ? qty * 1000 : qty
  }
  return qty
}

function calculateEntryMetrics(params: {
  baseUnit: 'g' | 'ml' | 'un'
  rawQty: number
  inputUnit: InputUnit
  priceMode: PriceMode
  rawPrice: number
  currentStock: number
  currentAvgCost: number
}) {
  const {
    baseUnit,
    rawQty,
    inputUnit,
    priceMode,
    rawPrice,
    currentStock,
    currentAvgCost,
  } = params

  const baseQty = Math.max(0, toBaseQuantity(rawQty, inputUnit, baseUnit))
  if (baseQty <= 0 || rawPrice < 0) return null

  let totalCost = 0
  if (priceMode === 'total') {
    totalCost = rawPrice
  } else if (priceMode === 'per_kilo_or_liter' && (baseUnit === 'g' || baseUnit === 'ml')) {
    const qtyInKiloOrLiter = baseQty / 1000
    totalCost = qtyInKiloOrLiter * rawPrice
  } else {
    totalCost = baseQty * rawPrice
  }

  const unitCostBase = totalCost / baseQty
  const nextStock = currentStock + baseQty
  const nextAvgCost =
    nextStock > 0
      ? (currentStock * currentAvgCost + baseQty * unitCostBase) / nextStock
      : unitCostBase

  return {
    baseQty,
    totalCost,
    unitCostBase,
    nextStock,
    nextAvgCost,
  }
}

export default function EstoquePage() {
  const supabase = useMemo(() => createClient(), [])

  const [products, setProducts] = useState<Product[]>([])
  const [hiddenProducts, setHiddenProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Seleção múltipla na tabela
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Filtros
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('todos')

  // Modal: Novo Produto
  const [showNewModal, setShowNewModal] = useState(false)
  const [savingNew, setSavingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'insumo' | 'revenda'>('insumo')
  const [newBaseUnit, setNewBaseUnit] = useState<'g' | 'ml' | 'un'>('g')
  const [newInputUnit, setNewInputUnit] = useState<InputUnit>('kg')
  const [newStockInput, setNewStockInput] = useState('')
  const [newMinStockInput, setNewMinStockInput] = useState('')
  const [newPriceMode, setNewPriceMode] = useState<PriceMode>('total')
  const [newPriceInput, setNewPriceInput] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // Modal: Remover Produto (1 ou vários)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([])
  const [deleteMode, setDeleteMode] = useState<'inativar' | 'excluir'>('inativar')
  const [deletingProduct, setDeletingProduct] = useState(false)

  // Modal: Resgatar Produtos Ocultos
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [restoreSelectedIds, setRestoreSelectedIds] = useState<string[]>([])
  const [restoringProducts, setRestoringProducts] = useState(false)

  // Modal: Registrar Compra (Entrada)
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [purchaseInputUnit, setPurchaseInputUnit] = useState<InputUnit>('kg')
  const [purchaseQtyInput, setPurchaseQtyInput] = useState('')
  const [purchasePriceMode, setPurchasePriceMode] = useState<PriceMode>('total')
  const [purchasePriceInput, setPurchasePriceInput] = useState('')
  const [purchaseNotes, setPurchaseNotes] = useState('')

  // Modal: Ajuste / Perda
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [savingAdjust, setSavingAdjust] = useState(false)
  const [adjustType, setAdjustType] = useState<'ajuste' | 'perda'>('perda')
  const [adjustInputUnit, setAdjustInputUnit] = useState<InputUnit>('kg')
  const [adjustQtyInput, setAdjustQtyInput] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')

  async function loadProducts() {
    setLoading(true)
    setError(null)

    const { data: activeData, error: activeError } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: inactiveData, error: inactiveError } = await supabase
      .from('products')
      .select('*')
      .eq('active', false)
      .order('name', { ascending: true })

    if (activeError || inactiveError) {
      const msg = activeError?.message || inactiveError?.message || 'Erro desconhecido'
      console.error(activeError || inactiveError)
      setError(`Erro ao carregar produtos: ${msg}`)
    } else {
      const list = (activeData as Product[]) || []
      const hiddenList = (inactiveData as Product[]) || []
      setProducts(list)
      setHiddenProducts(hiddenList)
      setSelectedIds((prev) => prev.filter((id) => list.some((p) => p.id === id)))
      setRestoreSelectedIds((prev) => prev.filter((id) => hiddenList.some((p) => p.id === id)))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
  }, [])

  function notifySuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const formatBRL = (value: number, decimals = 2) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value || 0)

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(value || 0)

  function formatFriendlyStock(qty: number, unit: string) {
    const base = `${formatNumber(qty)} ${unit}`
    if (unit === 'g' && qty >= 1000) {
      return `${base} (${formatNumber(qty / 1000)} kg)`
    }
    if (unit === 'ml' && qty >= 1000) {
      return `${base} (${formatNumber(qty / 1000)} L)`
    }
    return base
  }

  function formatFriendlyCost(cost: number, unit: string) {
    if (unit === 'g') {
      return `${formatBRL(cost * 1000, 2)}/kg (${formatBRL(cost, 4)}/g)`
    }
    if (unit === 'ml') {
      return `${formatBRL(cost * 1000, 2)}/L (${formatBRL(cost, 4)}/ml)`
    }
    return `${formatBRL(cost, 2)}/un`
  }

  const summary = useMemo(() => {
    const totalItems = products.length
    const criticalItems = products.filter(
      (p) => Number(p.current_stock) <= Number(p.min_stock)
    ).length
    const totalValue = products.reduce(
      (acc, p) => acc + Number(p.current_stock) * Number(p.average_cost),
      0
    )
    return { totalItems, criticalItems, totalValue }
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase().trim())
      if (!matchesSearch) return false

      if (filterType === 'insumo') return p.type === 'insumo'
      if (filterType === 'revenda') return p.type === 'revenda'
      if (filterType === 'critico') {
        return Number(p.current_stock) <= Number(p.min_stock)
      }
      return true
    })
  }, [products, search, filterType])

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedIds.includes(p.id))

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredProducts.map((p) => p.id))
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)))
    } else {
      const merged = new Set([...selectedIds, ...filteredProducts.map((p) => p.id)])
      setSelectedIds(Array.from(merged))
    }
  }

  function toggleSelectProduct(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function toggleSelectRestore(id: string) {
    setRestoreSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  // Prévia do Novo Produto
  const newProductPreview = useMemo(() => {
    const rawStock = parsePtNumber(newStockInput)
    const rawMin = parsePtNumber(newMinStockInput)
    const rawPrice = parsePtNumber(newPriceInput)

    const minStockBase = toBaseQuantity(Math.max(0, rawMin), newInputUnit, newBaseUnit)
    const calc = calculateEntryMetrics({
      baseUnit: newBaseUnit,
      rawQty: rawStock,
      inputUnit: newInputUnit,
      priceMode: newPriceMode,
      rawPrice,
      currentStock: 0,
      currentAvgCost: 0,
    })

    return {
      minStockBase,
      initialStockBase: calc?.baseQty || 0,
      totalCost: calc?.totalCost || 0,
      unitCostBase: calc?.unitCostBase || 0,
    }
  }, [newStockInput, newMinStockInput, newInputUnit, newBaseUnit, newPriceMode, newPriceInput])

  // Salvar novo produto
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    setSavingNew(true)
    setError(null)

    const { initialStockBase, minStockBase, totalCost, unitCostBase } = newProductPreview

    const { data: created, error: insertError } = await supabase
      .from('products')
      .insert({
        name: newName.trim(),
        type: newType,
        unit: newBaseUnit,
        current_stock: Number(initialStockBase.toFixed(3)),
        min_stock: Number(minStockBase.toFixed(3)),
        average_cost: Number(unitCostBase.toFixed(6)),
        last_purchase_cost: Number(unitCostBase.toFixed(6)),
        notes: newNotes.trim() || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error(insertError)
      setError(`Erro ao cadastrar produto: ${insertError.message}`)
      setSavingNew(false)
      return
    }

    if (created && initialStockBase > 0) {
      const { error: movError } = await supabase.from('stock_movements').insert({
        product_id: created.id,
        type: 'compra',
        quantity: Number(initialStockBase.toFixed(3)),
        unit_cost: Number(unitCostBase.toFixed(4)),
        total_cost: Number(totalCost.toFixed(4)),
        reference_type: 'manual',
        notes: 'Estoque inicial cadastrado',
      })
      if (movError) {
        console.error(movError)
      }
    }

    setSavingNew(false)
    setShowNewModal(false)
    setNewName('')
    setNewStockInput('')
    setNewMinStockInput('')
    setNewPriceInput('')
    setNewPriceMode('total')
    setNewNotes('')
    notifySuccess('Produto cadastrado com sucesso!')
    loadProducts()
  }

  // Abrir modal de remoção com itens selecionados (ou o primeiro se nenhum estiver marcado)
  function openDeleteModal() {
    if (selectedIds.length > 0) {
      setDeleteTargetIds(selectedIds)
    } else if (products.length > 0) {
      setDeleteTargetIds([products[0].id])
    } else {
      setDeleteTargetIds([])
    }
    setDeleteMode('inativar')
    setShowDeleteModal(true)
  }

  // Remover 1 ou vários produtos
  async function handleRemoveProducts(e: React.FormEvent) {
    e.preventDefault()
    if (deleteTargetIds.length === 0) return

    setDeletingProduct(true)
    setError(null)

    if (deleteMode === 'inativar') {
      const { error: updateError } = await supabase
        .from('products')
        .update({ active: false })
        .in('id', deleteTargetIds)

      if (updateError) {
        console.error(updateError)
        setError(`Erro ao ocultar produto(s): ${updateError.message}`)
        setDeletingProduct(false)
        return
      }
      notifySuccess(
        deleteTargetIds.length === 1
          ? 'Produto ocultado (histórico preservado)!'
          : `${deleteTargetIds.length} produtos ocultados (histórico preservado)!`
      )
    } else {
      await supabase.from('stock_movements').delete().in('product_id', deleteTargetIds)
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .in('id', deleteTargetIds)

      if (deleteError) {
        console.error(deleteError)
        setError(
          `Não foi possível excluir permanentemente (${deleteError.message}). Tente "Ocultar / Preservar histórico".`
        )
        setDeletingProduct(false)
        return
      }
      notifySuccess(
        deleteTargetIds.length === 1
          ? 'Produto excluído permanentemente!'
          : `${deleteTargetIds.length} produtos excluídos permanentemente!`
      )
    }

    setDeletingProduct(false)
    setShowDeleteModal(false)
    setSelectedIds((prev) => prev.filter((id) => !deleteTargetIds.includes(id)))
    setDeleteTargetIds([])
    loadProducts()
  }

  // Resgatar produtos ocultos (active = true)
  async function handleRestoreProducts(e: React.FormEvent) {
    e.preventDefault()
    if (restoreSelectedIds.length === 0) return

    setRestoringProducts(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('products')
      .update({ active: true })
      .in('id', restoreSelectedIds)

    if (updateError) {
      console.error(updateError)
      setError(`Erro ao resgatar produto(s): ${updateError.message}`)
      setRestoringProducts(false)
      return
    }

    setRestoringProducts(false)
    setShowRestoreModal(false)
    setRestoreSelectedIds([])
    notifySuccess('Produto(s) resgatado(s) para o estoque ativo!')
    loadProducts()
  }

  // Prévia da Compra
  const purchasePreview = useMemo(() => {
    if (!purchaseProduct) return null
    const baseUnit = purchaseProduct.unit as 'g' | 'ml' | 'un'
    const rawQty = parsePtNumber(purchaseQtyInput)
    const rawPrice = parsePtNumber(purchasePriceInput)

    return calculateEntryMetrics({
      baseUnit,
      rawQty,
      inputUnit: purchaseInputUnit,
      priceMode: purchasePriceMode,
      rawPrice,
      currentStock: Number(purchaseProduct.current_stock) || 0,
      currentAvgCost: Number(purchaseProduct.average_cost) || 0,
    })
  }, [
    purchaseProduct,
    purchaseQtyInput,
    purchaseInputUnit,
    purchasePriceMode,
    purchasePriceInput,
  ])

  // Salvar compra
  async function handleSavePurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!purchaseProduct || !purchasePreview) return

    setSavingPurchase(true)
    setError(null)

    const { baseQty, totalCost, unitCostBase, nextStock, nextAvgCost } = purchasePreview

    const { error: updateError } = await supabase
      .from('products')
      .update({
        current_stock: Number(nextStock.toFixed(3)),
        average_cost: Number(nextAvgCost.toFixed(6)),
        last_purchase_cost: Number(unitCostBase.toFixed(6)),
      })
      .eq('id', purchaseProduct.id)

    if (updateError) {
      console.error(updateError)
      setError(`Erro ao atualizar estoque: ${updateError.message}`)
      setSavingPurchase(false)
      return
    }

    const { error: movError } = await supabase.from('stock_movements').insert({
      product_id: purchaseProduct.id,
      type: 'compra',
      quantity: Number(baseQty.toFixed(3)),
      unit_cost: Number(unitCostBase.toFixed(4)),
      total_cost: Number(totalCost.toFixed(4)),
      reference_type: 'manual',
      notes: purchaseNotes.trim() || 'Entrada de compra registrada pela tela de estoque',
    })

    if (movError) {
      console.error(movError)
    }

    setSavingPurchase(false)
    setPurchaseProduct(null)
    setPurchaseQtyInput('')
    setPurchasePriceInput('')
    setPurchasePriceMode('total')
    setPurchaseNotes('')
    notifySuccess('Compra registrada e custo médio atualizado!')
    loadProducts()
  }

  // Salvar ajuste ou perda
  async function handleSaveAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustProduct) return

    const baseUnit = adjustProduct.unit as 'g' | 'ml' | 'un'
    const rawQty = parsePtNumber(adjustQtyInput)
    if (rawQty === 0) return

    setSavingAdjust(true)
    setError(null)

    const baseQty = toBaseQuantity(rawQty, adjustInputUnit, baseUnit)
    const currentStock = Number(adjustProduct.current_stock) || 0
    const avgCost = Number(adjustProduct.average_cost) || 0

    const delta = adjustType === 'perda' ? -Math.abs(baseQty) : baseQty
    const nextStock = Math.max(0, currentStock + delta)

    const { error: updateError } = await supabase
      .from('products')
      .update({
        current_stock: Number(nextStock.toFixed(3)),
      })
      .eq('id', adjustProduct.id)

    if (updateError) {
      console.error(updateError)
      setError(`Erro ao registrar movimentação: ${updateError.message}`)
      setSavingAdjust(false)
      return
    }

    const { error: movError } = await supabase.from('stock_movements').insert({
      product_id: adjustProduct.id,
      type: adjustType,
      quantity: Number(delta.toFixed(3)),
      unit_cost: Number(avgCost.toFixed(4)),
      total_cost: Number((Math.abs(delta) * avgCost).toFixed(4)),
      reference_type: 'manual',
      notes:
        adjustNotes.trim() ||
        (adjustType === 'perda' ? 'Perda / descarte registrado' : 'Ajuste manual de inventário'),
    })

    if (movError) {
      console.error(movError)
    }

    setSavingAdjust(false)
    setAdjustProduct(null)
    setAdjustQtyInput('')
    setAdjustNotes('')
    notifySuccess('Movimentação registrada com sucesso!')
    loadProducts()
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8 text-stone-800">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-900">
              Controle de Estoque
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Informe quantidades em kg/g, L/ml ou un e escolha informar o valor total ou o preço por kg/L.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setNewBaseUnit('g')
                setNewInputUnit('kg')
                setNewPriceMode('total')
                setShowNewModal(true)
              }}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 transition cursor-pointer"
            >
              + Novo Produto
            </button>

            <button
              onClick={openDeleteModal}
              disabled={products.length === 0}
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-40 transition cursor-pointer"
            >
              {selectedIds.length > 0
                ? `Remover Produto (${selectedIds.length})`
                : 'Remover Produto'}
            </button>

            <button
              onClick={() => {
                setRestoreSelectedIds(hiddenProducts.map((p) => p.id))
                setShowRestoreModal(true)
              }}
              disabled={hiddenProducts.length === 0}
              className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-100 disabled:opacity-40 transition cursor-pointer"
            >
              Resgatar Ocultos ({hiddenProducts.length})
            </button>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMsg}
          </div>
        )}

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Itens Ativos
            </p>
            <p className="mt-2 text-2xl font-bold text-stone-900">{summary.totalItems}</p>
            <p className="mt-1 text-xs text-stone-400">Insumos e produtos de revenda</p>
          </div>

          <div
            onClick={() => setFilterType(filterType === 'critico' ? 'todos' : 'critico')}
            className={`rounded-xl border p-5 shadow-sm transition cursor-pointer ${
              summary.criticalItems > 0
                ? 'border-red-200 bg-red-50/60 hover:bg-red-50'
                : 'border-stone-200 bg-white hover:bg-stone-50'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Abaixo / No Mínimo
            </p>
            <p
              className={`mt-2 text-2xl font-bold ${
                summary.criticalItems > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {summary.criticalItems}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {summary.criticalItems > 0
                ? 'Clique para filtrar itens críticos'
                : 'Nenhum item em alerta no momento'}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Valor Total em Estoque
            </p>
            <p className="mt-2 text-2xl font-bold text-stone-900">
              {formatBRL(summary.totalValue)}
            </p>
            <p className="mt-1 text-xs text-stone-400">Baseado no custo médio atual</p>
          </div>
        </div>

        {/* Busca e Filtros */}
        <div className="flex flex-col md:flex-row gap-3 justify-between bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
          <input
            type="text"
            placeholder="Buscar produto por nome (ex: calabresa, mussarela)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 rounded-lg border border-stone-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'insumo', label: 'Insumos' },
                { id: 'revenda', label: 'Revenda' },
                { id: 'critico', label: 'Estoque Crítico' },
              ] as { id: FilterType; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                  filterType === tab.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela de Produtos */}
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-stone-500">Carregando estoque...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-base font-medium text-stone-700">Nenhum produto encontrado</p>
              <p className="text-sm text-stone-500">
                Cadastre um novo produto no botão acima, resgate um item oculto ou limpe os filtros.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase text-stone-500">
                    <th className="py-3.5 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        title="Selecionar todos"
                        className="h-4 w-4 rounded border-stone-300 cursor-pointer"
                      />
                    </th>
                    <th className="py-3.5 px-4">Produto</th>
                    <th className="py-3.5 px-4">Tipo</th>
                    <th className="py-3.5 px-4">Estoque Atual</th>
                    <th className="py-3.5 px-4">Mínimo</th>
                    <th className="py-3.5 px-4">Custo Médio</th>
                    <th className="py-3.5 px-4">Valor em Estoque</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {filteredProducts.map((product) => {
                    const current = Number(product.current_stock)
                    const min = Number(product.min_stock)
                    const avgCost = Number(product.average_cost)
                    const isCritical = current <= min
                    const isSelected = selectedIds.includes(product.id)

                    return (
                      <tr
                        key={product.id}
                        className={
                          isSelected
                            ? 'bg-amber-50/70'
                            : isCritical
                            ? 'bg-red-50/50'
                            : 'hover:bg-stone-50/80'
                        }
                      >
                        <td className="py-3.5 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="h-4 w-4 rounded border-stone-300 cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-stone-900">{product.name}</div>
                          {product.notes && (
                            <div className="text-xs text-stone-400">{product.notes}</div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              product.type === 'insumo'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {product.type === 'insumo' ? 'Insumo' : 'Revenda'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div
                            className={`font-semibold ${
                              isCritical ? 'text-red-600' : 'text-stone-900'
                            }`}
                          >
                            {formatFriendlyStock(current, product.unit)}
                          </div>
                          {isCritical && (
                            <span className="inline-block mt-0.5 text-[11px] font-semibold text-red-600">
                              Repor estoque
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-stone-600">
                          {formatFriendlyStock(min, product.unit)}
                        </td>

                        <td className="py-3.5 px-4 text-stone-700">
                          {formatFriendlyCost(avgCost, product.unit)}
                        </td>

                        <td className="py-3.5 px-4 font-medium text-stone-900">
                          {formatBRL(current * avgCost)}
                        </td>

                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              const base = product.unit as 'g' | 'ml' | 'un'
                              setPurchaseProduct(product)
                              setPurchaseInputUnit(defaultInputUnit(base))
                              setPurchasePriceMode('total')
                              setPurchaseQtyInput('')
                              setPurchasePriceInput('')
                              setPurchaseNotes('')
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
                          >
                            + Compra
                          </button>
                          <button
                            onClick={() => {
                              const base = product.unit as 'g' | 'ml' | 'un'
                              setAdjustProduct(product)
                              setAdjustType('perda')
                              setAdjustInputUnit(defaultInputUnit(base))
                              setAdjustQtyInput('')
                              setAdjustNotes('')
                            }}
                            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                          >
                            Ajuste / Perda
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: NOVO PRODUTO */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">Cadastrar Novo Produto</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Calabresa, Mussarela, Coca-Cola Lata"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Tipo *</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'insumo' | 'revenda')}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="insumo">Insumo</option>
                    <option value="revenda">Revenda</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Medida no Sistema *
                  </label>
                  <select
                    value={newBaseUnit}
                    onChange={(e) => {
                      const nextBase = e.target.value as 'g' | 'ml' | 'un'
                      setNewBaseUnit(nextBase)
                      setNewInputUnit(defaultInputUnit(nextBase))
                      if (nextBase === 'un' && newPriceMode === 'per_kilo_or_liter') {
                        setNewPriceMode('total')
                      }
                    }}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="g">Peso (g / kg)</option>
                    <option value="ml">Volume (ml / L)</option>
                    <option value="un">Unidade (un)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Digitar Qtd em *
                  </label>
                  <select
                    value={newInputUnit}
                    onChange={(e) => setNewInputUnit(e.target.value as InputUnit)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    {getAllowedInputUnits(newBaseUnit).map((u) => (
                      <option key={u} value={u}>
                        {u === 'kg'
                          ? 'kg (Quilos)'
                          : u === 'g'
                          ? 'g (Gramas)'
                          : u === 'l'
                          ? 'L (Litros)'
                          : u === 'ml'
                          ? 'ml (Mililitros)'
                          : 'un (Unidades)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Quantidade Inicial ({newInputUnit})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={
                      newInputUnit === 'kg' ? 'Ex: 2,7 ou 8,7' : newInputUnit === 'g' ? 'Ex: 2700' : 'Ex: 12'
                    }
                    value={newStockInput}
                    onChange={(e) => setNewStockInput(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Estoque Mínimo ({newInputUnit})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={newInputUnit === 'kg' ? 'Ex: 1,5' : 'Ex: 5'}
                    value={newMinStockInput}
                    onChange={(e) => setNewMinStockInput(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Como informar o valor? *
                  </label>
                  <select
                    value={newPriceMode}
                    onChange={(e) => setNewPriceMode(e.target.value as PriceMode)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="total">Valor total pago (R$)</option>
                    {(newBaseUnit === 'g' || newBaseUnit === 'ml') && (
                      <option value="per_kilo_or_liter">
                        Preço por {newBaseUnit === 'g' ? 'kg' : 'L'} (R$)
                      </option>
                    )}
                    <option value="per_base_unit">Preço por {newBaseUnit} (R$)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {newPriceMode === 'total'
                      ? 'Valor Total Pago (R$)'
                      : newPriceMode === 'per_kilo_or_liter'
                      ? `Preço por ${newBaseUnit === 'g' ? 'kg' : 'L'} (R$)`
                      : `Preço por ${newBaseUnit} (R$)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={
                      newPriceMode === 'per_kilo_or_liter' ? 'Ex: 36,90' : 'Ex: 40,00'
                    }
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {newProductPreview.initialStockBase > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-1">
                  <div className="font-semibold">Cálculo automático do cadastro:</div>
                  <div>
                    • Estoque salvo:{' '}
                    <strong>
                      {formatFriendlyStock(newProductPreview.initialStockBase, newBaseUnit)}
                    </strong>
                  </div>
                  <div>
                    • Valor total calculado:{' '}
                    <strong>{formatBRL(newProductPreview.totalCost)}</strong>
                  </div>
                  <div>
                    • Custo médio:{' '}
                    <strong>
                      {formatFriendlyCost(newProductPreview.unitCostBase, newBaseUnit)}
                    </strong>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Observações (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Peças fracionadas, pacote fechado..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingNew ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REMOVER PRODUTO (1 OU VÁRIOS) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">Remover Produto(s)</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleRemoveProducts} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-stone-700">
                    Produtos selecionados para remoção ({deleteTargetIds.length}) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTargetIds(
                        deleteTargetIds.length === products.length
                          ? []
                          : products.map((p) => p.id)
                      )
                    }
                    className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                  >
                    {deleteTargetIds.length === products.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {products.map((p) => {
                    const checked = deleteTargetIds.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDeleteTargetIds((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((item) => item !== p.id)
                                  : [...prev, p.id]
                              )
                            }
                            className="h-4 w-4 rounded border-stone-300 cursor-pointer"
                          />
                          <span className="font-medium text-stone-800">{p.name}</span>
                        </div>
                        <span className="text-xs text-stone-500">
                          {formatFriendlyStock(Number(p.current_stock), p.unit)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Forma de Remoção
                </label>
                <select
                  value={deleteMode}
                  onChange={(e) => setDeleteMode(e.target.value as 'inativar' | 'excluir')}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="inativar">
                    Ocultar / Preservar histórico (pode ser resgatado depois)
                  </option>
                  <option value="excluir">Excluir permanentemente do banco</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingProduct || deleteTargetIds.length === 0}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {deletingProduct
                    ? 'Removendo...'
                    : `Confirmar (${deleteTargetIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESGATAR PRODUTOS OCULTOS */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Resgatar Produtos Ocultos</h2>
                <p className="text-xs text-stone-500">
                  Itens ocultados mantêm seu estoque e histórico intactos.
                </p>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleRestoreProducts} className="space-y-3.5">
              {hiddenProducts.length === 0 ? (
                <p className="text-sm text-stone-500 py-4 text-center">
                  Não há produtos ocultos no momento.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {hiddenProducts.map((p) => {
                    const checked = restoreSelectedIds.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectRestore(p.id)}
                            className="h-4 w-4 rounded border-stone-300 cursor-pointer"
                          />
                          <div>
                            <div className="font-medium text-stone-800">{p.name}</div>
                            <div className="text-xs text-stone-400">
                              Custo: {formatFriendlyCost(Number(p.average_cost), p.unit)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-stone-600">
                          {formatFriendlyStock(Number(p.current_stock), p.unit)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={restoringProducts || restoreSelectedIds.length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {restoringProducts
                    ? 'Resgatando...'
                    : `Resgatar (${restoreSelectedIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTRAR COMPRA */}
      {purchaseProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Registrar Compra</h2>
                <p className="text-xs text-stone-500">{purchaseProduct.name}</p>
              </div>
              <button
                onClick={() => setPurchaseProduct(null)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 space-y-1">
              <div>
                Estoque atual:{' '}
                <strong>
                  {formatFriendlyStock(
                    Number(purchaseProduct.current_stock),
                    purchaseProduct.unit
                  )}
                </strong>
              </div>
              <div>
                Custo médio atual:{' '}
                <strong>
                  {formatFriendlyCost(Number(purchaseProduct.average_cost), purchaseProduct.unit)}
                </strong>
              </div>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Quantidade Comprada *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder={
                      purchaseInputUnit === 'kg'
                        ? 'Ex: 2,7 ou 8,7'
                        : purchaseInputUnit === 'g'
                        ? 'Ex: 2700'
                        : 'Ex: 24'
                    }
                    value={purchaseQtyInput}
                    onChange={(e) => setPurchaseQtyInput(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Unidade Digitada *
                  </label>
                  <select
                    value={purchaseInputUnit}
                    onChange={(e) => setPurchaseInputUnit(e.target.value as InputUnit)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    {getAllowedInputUnits(purchaseProduct.unit as 'g' | 'ml' | 'un').map((u) => (
                      <option key={u} value={u}>
                        {u === 'kg'
                          ? 'kg (Quilos)'
                          : u === 'g'
                          ? 'g (Gramas)'
                          : u === 'l'
                          ? 'L (Litros)'
                          : u === 'ml'
                          ? 'ml (Mililitros)'
                          : 'un (Unidades)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Como informar o valor? *
                  </label>
                  <select
                    value={purchasePriceMode}
                    onChange={(e) => setPurchasePriceMode(e.target.value as PriceMode)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="total">Valor total da compra (R$)</option>
                    {(purchaseProduct.unit === 'g' || purchaseProduct.unit === 'ml') && (
                      <option value="per_kilo_or_liter">
                        Preço por {purchaseProduct.unit === 'g' ? 'kg' : 'L'} (R$)
                      </option>
                    )}
                    <option value="per_base_unit">
                      Preço por {purchaseProduct.unit} (R$)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {purchasePriceMode === 'total'
                      ? 'Valor Total Pago (R$) *'
                      : purchasePriceMode === 'per_kilo_or_liter'
                      ? `Preço por ${purchaseProduct.unit === 'g' ? 'kg' : 'L'} (R$) *`
                      : `Preço por ${purchaseProduct.unit} (R$) *`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder={
                      purchasePriceMode === 'per_kilo_or_liter' ? 'Ex: 36,90' : 'Ex: 40,00'
                    }
                    value={purchasePriceInput}
                    onChange={(e) => setPurchasePriceInput(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {purchasePreview && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
                  <div className="font-semibold">Prévia após salvar:</div>
                  <div>
                    • Entrada no estoque:{' '}
                    <strong>
                      {formatFriendlyStock(purchasePreview.baseQty, purchaseProduct.unit)}
                    </strong>
                  </div>
                  <div>
                    • Valor total pago nesta compra:{' '}
                    <strong>{formatBRL(purchasePreview.totalCost)}</strong>
                  </div>
                  <div>
                    • Novo estoque total:{' '}
                    <strong>
                      {formatFriendlyStock(purchasePreview.nextStock, purchaseProduct.unit)}
                    </strong>
                  </div>
                  <div>
                    • Novo custo médio ponderado:{' '}
                    <strong>
                      {formatFriendlyCost(purchasePreview.nextAvgCost, purchaseProduct.unit)}
                    </strong>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Observação / Fornecedor (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Peças 4,5kg + 4,2kg, Atacadão..."
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPurchaseProduct(null)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase || !purchasePreview}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingPurchase ? 'Registrando...' : 'Confirmar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: AJUSTE OU PERDA */}
      {adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Ajuste / Perda de Estoque</h2>
                <p className="text-xs text-stone-500">{adjustProduct.name}</p>
              </div>
              <button
                onClick={() => setAdjustProduct(null)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Tipo de Movimentação
                  </label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as 'ajuste' | 'perda')}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="perda">Perda / Descarte</option>
                    <option value="ajuste">Ajuste (+ ou -)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Unidade Digitada
                  </label>
                  <select
                    value={adjustInputUnit}
                    onChange={(e) => setAdjustInputUnit(e.target.value as InputUnit)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    {getAllowedInputUnits(adjustProduct.unit as 'g' | 'ml' | 'un').map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Quantidade ({adjustInputUnit}) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder={
                    adjustType === 'perda'
                      ? 'Ex: 0,250 ou 250'
                      : 'Ex: -0,150 para diminuir ou 0,150 para somar'
                  }
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Motivo</label>
                <input
                  type="text"
                  placeholder="Ex: Apara/sobra, contagem física..."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustProduct(null)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAdjust}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingAdjust ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}