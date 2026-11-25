'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'

interface Recipe {
  id: string
  name: string
  description: string | null
  yield_quantity: number
  yield_unit: string
  active: boolean
  created_at: string
  updated_at: string
}

interface RecipeIngredientRow {
  id: string
  recipe_id: string
  product_id: string
  quantity: number
  unit: string
  product?: Product
}

function parsePtNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s+/g, '')
  if (!cleaned) return 0
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned.replace(',', '.')) || 0
}

export default function ReceitasPage() {
  const supabase = useMemo(() => createClient(), [])

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allIngredients, setAllIngredients] = useState<RecipeIngredientRow[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Modal Nova / Editar Receita
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [recipeName, setRecipeName] = useState('')
  const [recipeDescription, setRecipeDescription] = useState('')
  const [recipeYieldQty, setRecipeYieldQty] = useState('1')
  const [recipeYieldUnit, setRecipeYieldUnit] = useState('un')
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Formulário Adicionar Ingrediente na Ficha Técnica
  const [selectedProductId, setSelectedProductId] = useState('')
  const [ingredientQtyInput, setIngredientQtyInput] = useState('')
  const [ingredientInputUnit, setIngredientInputUnit] = useState<'base' | 'kg_or_l'>('base')
  const [savingIngredient, setSavingIngredient] = useState(false)

  // Simulador de Preço de Venda (inspirado na aba Cardápio)
  const [markupMultiplier, setMarkupMultiplier] = useState('2')
  const [targetSalePrice, setTargetSalePrice] = useState('25,00')

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

  function notifySuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  async function loadAllData() {
    setLoading(true)
    setError(null)

    const [recipesRes, productsRes, ingredientsRes] = await Promise.all([
      supabase
        .from('recipes')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase.from('recipe_ingredients').select('*'),
    ])

    if (recipesRes.error || productsRes.error || ingredientsRes.error) {
      const msg =
        recipesRes.error?.message ||
        productsRes.error?.message ||
        ingredientsRes.error?.message ||
        'Erro ao carregar dados'
      console.error(recipesRes.error || productsRes.error || ingredientsRes.error)
      setError(`Erro ao carregar receitas: ${msg}`)
      setLoading(false)
      return
    }

    const recipeList = (recipesRes.data as Recipe[]) || []
    const productList = (productsRes.data as Product[]) || []
    const ingredientList = (ingredientsRes.data as RecipeIngredientRow[]) || []

    setRecipes(recipeList)
    setProducts(productList)
    setAllIngredients(ingredientList)

    if (recipeList.length > 0) {
      setSelectedRecipeId((prev) =>
        prev && recipeList.some((r) => r.id === prev) ? prev : recipeList[0].id
      )
    } else {
      setSelectedRecipeId(null)
    }

    if (productList.length > 0 && !selectedProductId) {
      setSelectedProductId(productList[0].id)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAllData()
  }, [])

  const productMap = useMemo(() => {
    const map = new Map<string, Product>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  // Calcula custo total de cada receita para exibir na lista lateral
  const recipeCostsMap = useMemo(() => {
    const map = new Map<string, number>()
    recipes.forEach((r) => map.set(r.id, 0))

    allIngredients.forEach((ing) => {
      const prod = productMap.get(ing.product_id)
      const unitCost = prod ? Number(prod.average_cost) : 0
      const partial = Number(ing.quantity) * unitCost
      map.set(ing.recipe_id, (map.get(ing.recipe_id) || 0) + partial)
    })

    return map
  }, [recipes, allIngredients, productMap])

  const filteredRecipes = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return recipes
    return recipes.filter((r) => r.name.toLowerCase().includes(term))
  }, [recipes, search])

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  )

  const selectedIngredients = useMemo(() => {
    if (!selectedRecipe) return []
    return allIngredients
      .filter((ing) => ing.recipe_id === selectedRecipe.id)
      .map((ing) => {
        const prod = productMap.get(ing.product_id)
        const unitCost = prod ? Number(prod.average_cost) : 0
        const partialCost = Number(ing.quantity) * unitCost
        return {
          ...ing,
          product: prod,
          unitCost,
          partialCost,
        }
      })
      .sort((a, b) => (a.product?.name || '').localeCompare(b.product?.name || ''))
  }, [selectedRecipe, allIngredients, productMap])

  const totalRecipeCost = useMemo(
    () => selectedIngredients.reduce((acc, item) => acc + item.partialCost, 0),
    [selectedIngredients]
  )

  const costPerYieldUnit = useMemo(() => {
    if (!selectedRecipe) return 0
    const y = Number(selectedRecipe.yield_quantity) || 1
    return y > 0 ? totalRecipeCost / y : totalRecipeCost
  }, [selectedRecipe, totalRecipeCost])

  const selectedInputProduct = useMemo(
    () => productMap.get(selectedProductId) || null,
    [productMap, selectedProductId]
  )

  // Abrir modal para criar receita
  function openNewRecipeModal() {
    setEditingRecipe(null)
    setRecipeName('')
    setRecipeDescription('')
    setRecipeYieldQty('1')
    setRecipeYieldUnit('un')
    setShowRecipeModal(true)
  }

  // Abrir modal para editar receita atual
  function openEditRecipeModal(recipe: Recipe) {
    setEditingRecipe(recipe)
    setRecipeName(recipe.name)
    setRecipeDescription(recipe.description || '')
    setRecipeYieldQty(String(recipe.yield_quantity || 1))
    setRecipeYieldUnit(recipe.yield_unit || 'un')
    setShowRecipeModal(true)
  }

  // Salvar nova receita ou edição
  async function handleSaveRecipe(e: React.FormEvent) {
    e.preventDefault()
    if (!recipeName.trim()) return

    setSavingRecipe(true)
    setError(null)

    const yieldQty = Math.max(0.01, parsePtNumber(recipeYieldQty) || 1)

    if (editingRecipe) {
      const { error: updateError } = await supabase
        .from('recipes')
        .update({
          name: recipeName.trim(),
          description: recipeDescription.trim() || null,
          yield_quantity: yieldQty,
          yield_unit: recipeYieldUnit.trim() || 'un',
        })
        .eq('id', editingRecipe.id)

      if (updateError) {
        console.error(updateError)
        setError(`Erro ao atualizar receita: ${updateError.message}`)
        setSavingRecipe(false)
        return
      }

      notifySuccess('Receita atualizada!')
    } else {
      const { data: created, error: insertError } = await supabase
        .from('recipes')
        .insert({
          name: recipeName.trim(),
          description: recipeDescription.trim() || null,
          yield_quantity: yieldQty,
          yield_unit: recipeYieldUnit.trim() || 'un',
          active: true,
        })
        .select()
        .single()

      if (insertError) {
        console.error(insertError)
        setError(`Erro ao criar receita: ${insertError.message}`)
        setSavingRecipe(false)
        return
      }

      if (created) {
        setSelectedRecipeId(created.id)
      }
      notifySuccess('Receita criada! Agora adicione os ingredientes na ficha técnica.')
    }

    setSavingRecipe(false)
    setShowRecipeModal(false)
    loadAllData()
  }

  // Duplicar receita selecionada (ideal para variações de sabores)
  async function handleDuplicateRecipe() {
    if (!selectedRecipe) return

    setSavingRecipe(true)
    setError(null)

    const { data: copy, error: copyError } = await supabase
      .from('recipes')
      .insert({
        name: `${selectedRecipe.name} (Cópia)`,
        description: selectedRecipe.description,
        yield_quantity: selectedRecipe.yield_quantity,
        yield_unit: selectedRecipe.yield_unit,
        active: true,
      })
      .select()
      .single()

    if (copyError || !copy) {
      console.error(copyError)
      setError(`Erro ao duplicar receita: ${copyError?.message}`)
      setSavingRecipe(false)
      return
    }

    if (selectedIngredients.length > 0) {
      const rowsToInsert = selectedIngredients.map((ing) => ({
        recipe_id: copy.id,
        product_id: ing.product_id,
        quantity: ing.quantity,
        unit: ing.unit,
      }))

      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(rowsToInsert)

      if (ingError) {
        console.error(ingError)
      }
    }

    setSavingRecipe(false)
    setSelectedRecipeId(copy.id)
    notifySuccess('Receita duplicada! Edite o nome e ajuste os ingredientes.')
    loadAllData()
  }

  // Inativar receita
  async function handleArchiveRecipe() {
    if (!selectedRecipe) return
    const confirmed = window.confirm(
      `Deseja remover a receita "${selectedRecipe.name}" da lista ativa?`
    )
    if (!confirmed) return

    const { error: updateError } = await supabase
      .from('recipes')
      .update({ active: false })
      .eq('id', selectedRecipe.id)

    if (updateError) {
      console.error(updateError)
      setError(`Erro ao remover receita: ${updateError.message}`)
      return
    }

    notifySuccess('Receita removida da lista ativa.')
    loadAllData()
  }

  // Adicionar ou atualizar ingrediente na ficha técnica
  async function handleAddIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRecipe || !selectedInputProduct) return

    const rawQty = parsePtNumber(ingredientQtyInput)
    if (rawQty <= 0) return

    setSavingIngredient(true)
    setError(null)

    const baseUnit = selectedInputProduct.unit
    const baseQty =
      ingredientInputUnit === 'kg_or_l' && (baseUnit === 'g' || baseUnit === 'ml')
        ? rawQty * 1000
        : rawQty

    const existing = selectedIngredients.find(
      (item) => item.product_id === selectedInputProduct.id
    )

    if (existing) {
      const { error: updateError } = await supabase
        .from('recipe_ingredients')
        .update({
          quantity: Number(baseQty.toFixed(3)),
          unit: baseUnit,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error(updateError)
        setError(`Erro ao atualizar ingrediente: ${updateError.message}`)
        setSavingIngredient(false)
        return
      }
      notifySuccess(`Quantidade de "${selectedInputProduct.name}" atualizada!`)
    } else {
      const { error: insertError } = await supabase.from('recipe_ingredients').insert({
        recipe_id: selectedRecipe.id,
        product_id: selectedInputProduct.id,
        quantity: Number(baseQty.toFixed(3)),
        unit: baseUnit,
      })

      if (insertError) {
        console.error(insertError)
        setError(`Erro ao adicionar ingrediente: ${insertError.message}`)
        setSavingIngredient(false)
        return
      }
      notifySuccess(`"${selectedInputProduct.name}" adicionado à ficha técnica!`)
    }

    setSavingIngredient(false)
    setIngredientQtyInput('')
    loadAllData()
  }

  // Remover ingrediente da ficha técnica
  async function handleRemoveIngredient(ingredientId: string) {
    const { error: deleteError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('id', ingredientId)

    if (deleteError) {
      console.error(deleteError)
      setError(`Erro ao remover ingrediente: ${deleteError.message}`)
      return
    }

    notifySuccess('Ingrediente removido da receita.')
    loadAllData()
  }

  // Cálculos da simulação de preço (como na aba Cardápio)
  const pricingSimulation = useMemo(() => {
    const mult = Math.max(1, parsePtNumber(markupMultiplier) || 2)
    const sale = Math.max(0, parsePtNumber(targetSalePrice) || 0)
    const suggested = costPerYieldUnit * mult
    const profit = sale - costPerYieldUnit
    const marginPercent = sale > 0 ? (profit / sale) * 100 : 0

    return {
      suggested,
      sale,
      profit,
      marginPercent,
    }
  }, [costPerYieldUnit, markupMultiplier, targetSalePrice])

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8 text-stone-800">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-900">
              Receitas & Ficha Técnica
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Monte a composição de cada item produzido com custo puxado automaticamente do estoque.
            </p>
          </div>

          <button
            onClick={openNewRecipeModal}
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 transition cursor-pointer"
          >
            + Nova Receita
          </button>
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

        {loading ? (
          <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
            Carregando receitas e insumos...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* COLUNA ESQUERDA: LISTA DE RECEITAS */}
            <div className="lg:col-span-4 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-stone-600">
                    Receitas ({recipes.length})
                  </h2>
                </div>
                <input
                  type="text"
                  placeholder="Buscar receita (ex: 3 Queijos, Calabresa)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              {filteredRecipes.length === 0 ? (
                <div className="p-6 text-center text-sm text-stone-500 space-y-2">
                  <p>Nenhuma receita encontrada.</p>
                  <button
                    onClick={openNewRecipeModal}
                    className="text-amber-700 font-semibold hover:underline cursor-pointer"
                  >
                    Criar primeira receita
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 max-h-[65vh] overflow-y-auto">
                  {filteredRecipes.map((recipe) => {
                    const isSelected = recipe.id === selectedRecipeId
                    const cost = recipeCostsMap.get(recipe.id) || 0
                    const y = Number(recipe.yield_quantity) || 1
                    const unitCost = y > 0 ? cost / y : cost

                    return (
                      <button
                        key={recipe.id}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        className={`w-full text-left px-4 py-3.5 transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-amber-50 border-l-4 border-amber-600'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-stone-900 text-sm">
                            {recipe.name}
                          </div>
                          <div className="text-xs text-stone-500">
                            Rende: {formatNumber(y)} {recipe.yield_unit}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-stone-900">
                            {formatBRL(unitCost)}
                          </div>
                          <div className="text-[11px] text-stone-400">
                            por {recipe.yield_unit}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* COLUNA DIREITA: FICHA TÉCNICA DA RECEITA SELECIONADA */}
            <div className="lg:col-span-8 space-y-6">
              {!selectedRecipe ? (
                <div className="rounded-xl border border-stone-200 bg-white p-10 text-center space-y-3 shadow-sm">
                  <p className="text-base font-semibold text-stone-800">
                    Nenhuma receita selecionada
                  </p>
                  <p className="text-sm text-stone-500">
                    Crie uma nova receita (ex.: 3 Queijos, Calabresa, Massa de Pizza) para começar a montar sua ficha técnica.
                  </p>
                  <button
                    onClick={openNewRecipeModal}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 cursor-pointer"
                  >
                    + Criar Receita
                  </button>
                </div>
              ) : (
                <>
                  {/* Cabeçalho da Receita + Resumo de Custos */}
                  <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-stone-900">
                            {selectedRecipe.name}
                          </h2>
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            Rende {formatNumber(Number(selectedRecipe.yield_quantity))}{' '}
                            {selectedRecipe.yield_unit}
                          </span>
                        </div>
                        {selectedRecipe.description && (
                          <p className="text-sm text-stone-500 mt-1">
                            {selectedRecipe.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEditRecipeModal(selectedRecipe)}
                          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                        >
                          Editar Receita
                        </button>
                        <button
                          onClick={handleDuplicateRecipe}
                          disabled={savingRecipe}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          Duplicar
                        </button>
                        <button
                          onClick={handleArchiveRecipe}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    {/* Cards de Custo & Simulador de Preço */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-stone-100">
                      <div className="rounded-lg bg-stone-50 p-4 border border-stone-200/80">
                        <p className="text-xs font-medium uppercase text-stone-500">
                          Custo Total da Receita
                        </p>
                        <p className="mt-1 text-xl font-bold text-stone-900">
                          {formatBRL(totalRecipeCost)}
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Custo por {selectedRecipe.yield_unit}:{' '}
                          <strong>{formatBRL(costPerYieldUnit)}</strong>
                        </p>
                      </div>

                      <div className="rounded-lg bg-amber-50/70 p-4 border border-amber-200/80">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase text-amber-900">
                            Preço Sugerido
                          </p>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-amber-800">Markup:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={markupMultiplier}
                              onChange={(e) => setMarkupMultiplier(e.target.value)}
                              className="w-12 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-center font-semibold text-stone-900"
                            />
                            <span className="text-amber-800">x</span>
                          </div>
                        </div>
                        <p className="mt-1 text-xl font-bold text-amber-900">
                          {formatBRL(pricingSimulation.suggested)}
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Baseado no custo unitário
                        </p>
                      </div>

                      <div className="rounded-lg bg-emerald-50/70 p-4 border border-emerald-200/80">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase text-emerald-900">
                            Lucro Estimado
                          </p>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-emerald-800">Venda R$:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={targetSalePrice}
                              onChange={(e) => setTargetSalePrice(e.target.value)}
                              className="w-16 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-right font-semibold text-stone-900"
                            />
                          </div>
                        </div>
                        <p
                          className={`mt-1 text-xl font-bold ${
                            pricingSimulation.profit >= 0
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }`}
                        >
                          {formatBRL(pricingSimulation.profit)}
                        </p>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          Margem: {formatNumber(pricingSimulation.marginPercent)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Formulário: Adicionar Ingrediente */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-stone-900">
                      Adicionar / Atualizar Ingrediente na Receita
                    </h3>

                    {products.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        Cadastre seus insumos primeiro na tela <strong>/estoque</strong> para adicioná-los aqui.
                      </p>
                    ) : (
                      <form
                        onSubmit={handleAddIngredient}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                      >
                        <div className="sm:col-span-5">
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Ingrediente (do Estoque)
                          </label>
                          <select
                            value={selectedProductId}
                            onChange={(e) => {
                              setSelectedProductId(e.target.value)
                              setIngredientInputUnit('base')
                            }}
                            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Quantidade
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder="Ex: 150 ou 1"
                            value={ingredientQtyInput}
                            onChange={(e) => setIngredientQtyInput(e.target.value)}
                            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Unidade
                          </label>
                          <select
                            value={ingredientInputUnit}
                            onChange={(e) =>
                              setIngredientInputUnit(e.target.value as 'base' | 'kg_or_l')
                            }
                            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          >
                            <option value="base">
                              {selectedInputProduct?.unit || 'un'}
                            </option>
                            {selectedInputProduct?.unit === 'g' && (
                              <option value="kg_or_l">kg</option>
                            )}
                            {selectedInputProduct?.unit === 'ml' && (
                              <option value="kg_or_l">L</option>
                            )}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={savingIngredient}
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                          >
                            {savingIngredient ? '...' : '+ Inserir'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Tabela de Ingredientes da Receita */}
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                    <div className="px-5 py-3.5 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">
                        Composição / Ingredientes ({selectedIngredients.length})
                      </h3>
                      <span className="text-xs text-stone-500">
                        Valores atualizados pelo custo médio do estoque
                      </span>
                    </div>

                    {selectedIngredients.length === 0 ? (
                      <div className="p-8 text-center text-sm text-stone-500">
                        Nenhum ingrediente adicionado ainda. Use o formulário acima para inserir os itens desta receita.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-stone-200 text-xs font-semibold uppercase text-stone-500">
                              <th className="py-3 px-4">Ingrediente</th>
                              <th className="py-3 px-4">Qtd.</th>
                              <th className="py-3 px-4">Custo Unit. Estoque</th>
                              <th className="py-3 px-4">Custo Parcial</th>
                              <th className="py-3 px-4">% do Custo</th>
                              <th className="py-3 px-4 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100 text-sm">
                            {selectedIngredients.map((item) => {
                              const share =
                                totalRecipeCost > 0
                                  ? (item.partialCost / totalRecipeCost) * 100
                                  : 0

                              return (
                                <tr key={item.id} className="hover:bg-stone-50">
                                  <td className="py-3 px-4 font-semibold text-stone-900">
                                    {item.product?.name || 'Produto removido'}
                                  </td>
                                  <td className="py-3 px-4 text-stone-700">
                                    {formatNumber(Number(item.quantity))} {item.unit}
                                  </td>
                                  <td className="py-3 px-4 text-stone-500 text-xs">
                                    {item.unit === 'g' || item.unit === 'ml'
                                      ? `${formatBRL(item.unitCost * 1000, 2)}/${
                                          item.unit === 'g' ? 'kg' : 'L'
                                        }`
                                      : `${formatBRL(item.unitCost, 2)}/un`}
                                  </td>
                                  <td className="py-3 px-4 font-semibold text-stone-900">
                                    {formatBRL(item.partialCost)}
                                  </td>
                                  <td className="py-3 px-4 text-stone-500 text-xs">
                                    {formatNumber(share)}%
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      onClick={() => handleRemoveIngredient(item.id)}
                                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                                    >
                                      Remover
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-stone-200 bg-stone-50 font-bold text-stone-900 text-sm">
                              <td className="py-3 px-4" colSpan={3}>
                                CUSTO TOTAL DA RECEITA
                              </td>
                              <td className="py-3 px-4 text-amber-800">
                                {formatBRL(totalRecipeCost)}
                              </td>
                              <td className="py-3 px-4 text-xs text-stone-500">100%</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: NOVA / EDITAR RECEITA */}
      {showRecipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">
                {editingRecipe ? 'Editar Receita' : 'Nova Receita'}
              </h2>
              <button
                onClick={() => setShowRecipeModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nome da Receita *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 3 Queijos, Calabresa, Massa Pizza"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Rendimento *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="Ex: 1"
                    value={recipeYieldQty}
                    onChange={(e) => setRecipeYieldQty(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Unidade de Rendimento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: un, pizza, porção, g"
                    value={recipeYieldUnit}
                    onChange={(e) => setRecipeYieldUnit(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Descrição / Modo de Preparo (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Pizza tamanho padrão 30cm..."
                  value={recipeDescription}
                  onChange={(e) => setRecipeDescription(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecipeModal(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRecipe}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingRecipe ? 'Salvando...' : 'Salvar Receita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}