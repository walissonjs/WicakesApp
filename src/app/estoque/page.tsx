'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import '@/app/estoque/estoque.css'

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
    <div className="estoque-page">
      <div className="estoque-container">
        {/* Navegação rápida da marca */}
        <div className="estoque-topbar">
          <div className="estoque-brand">
            <span className="estoque-brand-dot" />
            <span className="estoque-brand-name">WI CAKES</span>
            <span className="estoque-brand-sub">
              • Bolos · Doces · Salgados · Pizzas
            </span>
          </div>

          <nav className="estoque-nav">
            <Link href="/estoque" className="estoque-nav-link estoque-nav-link--active">
              Estoque
            </Link>
            <Link href="/receitas" className="estoque-nav-link">
              Receitas
            </Link>
          </nav>
        </div>

        {/* Cabeçalho */}
        <div className="estoque-header">
          <div>
            <h1 className="estoque-title">Controle de Estoque</h1>
            <p className="estoque-subtitle">
              Informe quantidades em kg/g, L/ml ou un e escolha informar o valor total ou o preço por kg/L.
            </p>
          </div>

          <div className="estoque-actions">
            <button
              onClick={() => {
                setNewBaseUnit('g')
                setNewInputUnit('kg')
                setNewPriceMode('total')
                setShowNewModal(true)
              }}
              className="btn btn-primary"
            >
              + Novo Produto
            </button>

            <button
              onClick={openDeleteModal}
              disabled={products.length === 0}
              className="btn btn-danger-outline"
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
              className="btn btn-gold-outline"
            >
              Resgatar Ocultos ({hiddenProducts.length})
            </button>
          </div>
        </div>

        {/* Alertas */}
        {error && <div className="alert alert-error">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* Cards de Resumo */}
        <div className="estoque-summary-grid">
          <div className="summary-card">
            <p className="summary-label">Itens Ativos</p>
            <p className="summary-value">{summary.totalItems}</p>
            <p className="summary-helper">Insumos e produtos de revenda</p>
          </div>

          <div
            onClick={() => setFilterType(filterType === 'critico' ? 'todos' : 'critico')}
            className={`summary-card summary-card--clickable ${
              summary.criticalItems > 0 ? 'summary-card--critical' : ''
            }`}
          >
            <p className="summary-label">Abaixo / No Mínimo</p>
            <p
              className={`summary-value ${
                summary.criticalItems > 0 ? 'summary-value--alert' : 'summary-value--ok'
              }`}
            >
              {summary.criticalItems}
            </p>
            <p className="summary-helper">
              {summary.criticalItems > 0
                ? 'Clique para filtrar itens críticos'
                : 'Nenhum item em alerta no momento'}
            </p>
          </div>

          <div className="summary-card summary-card--gold">
            <p className="summary-label">Valor Total em Estoque</p>
            <p className="summary-value summary-value--gold">
              {formatBRL(summary.totalValue)}
            </p>
            <p className="summary-helper">Baseado no custo médio atual</p>
          </div>
        </div>

        {/* Busca e Filtros */}
        <div className="estoque-toolbar">
          <input
            type="text"
            placeholder="Buscar produto por nome (ex: calabresa, mussarela)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="estoque-search"
          />

          <div className="estoque-filters">
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
                className={`filter-btn ${filterType === tab.id ? 'filter-btn--active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela de Produtos */}
        <div className="estoque-table-card">
          {loading ? (
            <div className="estoque-empty">
              <p className="estoque-empty-sub">Carregando estoque...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="estoque-empty">
              <p className="estoque-empty-title">Nenhum produto encontrado</p>
              <p className="estoque-empty-sub">
                Cadastre um novo produto no botão acima, resgate um item oculto ou limpe os filtros.
              </p>
            </div>
          ) : (
            <div className="estoque-table-wrap">
              <table className="estoque-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        title="Selecionar todos"
                        className="checkbox-wicakes"
                      />
                    </th>
                    <th>Produto</th>
                    <th>Tipo</th>
                    <th>Estoque Atual</th>
                    <th>Mínimo</th>
                    <th>Custo Médio</th>
                    <th>Valor em Estoque</th>
                    <th className="col-actions">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const current = Number(product.current_stock)
                    const min = Number(product.min_stock)
                    const avgCost = Number(product.average_cost)
                    const isCritical = current <= min
                    const isSelected = selectedIds.includes(product.id)

                    const rowClass = isSelected
                      ? 'row--selected'
                      : isCritical
                      ? 'row--critical'
                      : ''

                    return (
                      <tr key={product.id} className={rowClass}>
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="checkbox-wicakes"
                          />
                        </td>

                        <td>
                          <div className="product-name">{product.name}</div>
                          {product.notes && (
                            <div className="product-notes">{product.notes}</div>
                          )}
                        </td>

                        <td>
                          <span
                            className={`badge-type ${
                              product.type === 'insumo'
                                ? 'badge-type--insumo'
                                : 'badge-type--revenda'
                            }`}
                          >
                            {product.type === 'insumo' ? 'Insumo' : 'Revenda'}
                          </span>
                        </td>

                        <td>
                          <div
                            className={`stock-qty ${isCritical ? 'stock-qty--critical' : ''}`}
                          >
                            {formatFriendlyStock(current, product.unit)}
                          </div>
                          {isCritical && (
                            <span className="stock-alert-tag">Repor estoque</span>
                          )}
                        </td>

                        <td>{formatFriendlyStock(min, product.unit)}</td>

                        <td>{formatFriendlyCost(avgCost, product.unit)}</td>

                        <td className="stock-value">{formatBRL(current * avgCost)}</td>

                        <td className="col-actions">
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
                            className="btn btn-sm-primary"
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
                            className="btn btn-sm-gold"
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
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Cadastrar Novo Produto</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="modal-close"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="modal-form">
              <div>
                <label className="form-label">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Calabresa, Mussarela, Coca-Cola Lata"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="form-grid-3">
                <div>
                  <label className="form-label">Tipo *</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'insumo' | 'revenda')}
                    className="form-control"
                  >
                    <option value="insumo">Insumo</option>
                    <option value="revenda">Revenda</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Medida no Sistema *</label>
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
                    className="form-control"
                  >
                    <option value="g">Peso (g / kg)</option>
                    <option value="ml">Volume (ml / L)</option>
                    <option value="un">Unidade (un)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Digitar Qtd em *</label>
                  <select
                    value={newInputUnit}
                    onChange={(e) => setNewInputUnit(e.target.value as InputUnit)}
                    className="form-control"
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

              <div className="form-grid-2">
                <div>
                  <label className="form-label">
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
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">
                    Estoque Mínimo ({newInputUnit})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={newInputUnit === 'kg' ? 'Ex: 1,5' : 'Ex: 5'}
                    value={newMinStockInput}
                    onChange={(e) => setNewMinStockInput(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div>
                  <label className="form-label">Como informar o valor? *</label>
                  <select
                    value={newPriceMode}
                    onChange={(e) => setNewPriceMode(e.target.value as PriceMode)}
                    className="form-control"
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
                  <label className="form-label">
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
                    className="form-control"
                  />
                </div>
              </div>

              {newProductPreview.initialStockBase > 0 && (
                <div className="preview-box">
                  <strong>Cálculo automático do cadastro:</strong>
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
                <label className="form-label">Observações (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Peças fracionadas, pacote fechado..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="btn btn-primary"
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
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Remover Produto(s)</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="modal-close"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleRemoveProducts} className="modal-form">
              <div>
                <div className="modal-header">
                  <label className="form-label">
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
                    className="modal-close"
                  >
                    {deleteTargetIds.length === products.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                </div>

                <div className="checklist-box">
                  {products.map((p) => {
                    const checked = deleteTargetIds.includes(p.id)
                    return (
                      <label key={p.id} className="checklist-item">
                        <div className="checklist-left">
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
                            className="checkbox-wicakes"
                          />
                          <span className="product-name">{p.name}</span>
                        </div>
                        <span className="product-notes">
                          {formatFriendlyStock(Number(p.current_stock), p.unit)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="form-label">Forma de Remoção</label>
                <select
                  value={deleteMode}
                  onChange={(e) => setDeleteMode(e.target.value as 'inativar' | 'excluir')}
                  className="form-control"
                >
                  <option value="inativar">
                    Ocultar / Preservar histórico (pode ser resgatado depois)
                  </option>
                  <option value="excluir">Excluir permanentemente do banco</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingProduct || deleteTargetIds.length === 0}
                  className="btn btn-danger-solid"
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
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Resgatar Produtos Ocultos</h2>
                <p className="modal-subtitle">
                  Itens ocultados mantêm seu estoque e histórico intactos.
                </p>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="modal-close"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleRestoreProducts} className="modal-form">
              {hiddenProducts.length === 0 ? (
                <p className="estoque-empty-sub">Não há produtos ocultos no momento.</p>
              ) : (
                <div className="checklist-box">
                  {hiddenProducts.map((p) => {
                    const checked = restoreSelectedIds.includes(p.id)
                    return (
                      <label key={p.id} className="checklist-item">
                        <div className="checklist-left">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectRestore(p.id)}
                            className="checkbox-wicakes"
                          />
                          <div>
                            <div className="product-name">{p.name}</div>
                            <div className="product-notes">
                              Custo: {formatFriendlyCost(Number(p.average_cost), p.unit)}
                            </div>
                          </div>
                        </div>
                        <span className="product-notes">
                          {formatFriendlyStock(Number(p.current_stock), p.unit)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={restoringProducts || restoreSelectedIds.length === 0}
                  className="btn btn-primary"
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
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Registrar Compra</h2>
                <p className="modal-subtitle">{purchaseProduct.name}</p>
              </div>
              <button
                onClick={() => setPurchaseProduct(null)}
                className="modal-close"
              >
                Fechar
              </button>
            </div>

            <div className="preview-box preview-box--wine">
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

            <form onSubmit={handleSavePurchase} className="modal-form">
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Quantidade Comprada *</label>
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
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">Unidade Digitada *</label>
                  <select
                    value={purchaseInputUnit}
                    onChange={(e) => setPurchaseInputUnit(e.target.value as InputUnit)}
                    className="form-control"
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

              <div className="form-grid-2">
                <div>
                  <label className="form-label">Como informar o valor? *</label>
                  <select
                    value={purchasePriceMode}
                    onChange={(e) => setPurchasePriceMode(e.target.value as PriceMode)}
                    className="form-control"
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
                  <label className="form-label">
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
                    className="form-control"
                  />
                </div>
              </div>

              {purchasePreview && (
                <div className="preview-box">
                  <strong>Prévia após salvar:</strong>
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
                <label className="form-label">Observação / Fornecedor (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Peças 4,5kg + 4,2kg, Atacadão..."
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setPurchaseProduct(null)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase || !purchasePreview}
                  className="btn btn-primary"
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
        <div className="modal-backdrop">
          <div className="modal-card modal-card--sm">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Ajuste / Perda de Estoque</h2>
                <p className="modal-subtitle">{adjustProduct.name}</p>
              </div>
              <button
                onClick={() => setAdjustProduct(null)}
                className="modal-close"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="modal-form">
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Tipo de Movimentação</label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as 'ajuste' | 'perda')}
                    className="form-control"
                  >
                    <option value="perda">Perda / Descarte</option>
                    <option value="ajuste">Ajuste (+ ou -)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Unidade Digitada</label>
                  <select
                    value={adjustInputUnit}
                    onChange={(e) => setAdjustInputUnit(e.target.value as InputUnit)}
                    className="form-control"
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
                <label className="form-label">Quantidade ({adjustInputUnit}) *</label>
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
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Motivo</label>
                <input
                  type="text"
                  placeholder="Ex: Apara/sobra, contagem física..."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setAdjustProduct(null)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAdjust}
                  className="btn btn-primary"
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