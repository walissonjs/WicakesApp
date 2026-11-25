'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import '@/app/receitas/receitas.css'

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

  // Simulador de Preço de Venda
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

  function openNewRecipeModal() {
    setEditingRecipe(null)
    setRecipeName('')
    setRecipeDescription('')
    setRecipeYieldQty('1')
    setRecipeYieldUnit('un')
    setShowRecipeModal(true)
  }

  function openEditRecipeModal(recipe: Recipe) {
    setEditingRecipe(recipe)
    setRecipeName(recipe.name)
    setRecipeDescription(recipe.description || '')
    setRecipeYieldQty(String(recipe.yield_quantity || 1))
    setRecipeYieldUnit(recipe.yield_unit || 'un')
    setShowRecipeModal(true)
  }

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
    <div className="receitas-page">
      <div className="receitas-container">
        {/* Navegação rápida da marca */}
        <div className="receitas-topbar">
          <div className="receitas-brand">
            <span className="receitas-brand-dot" />
            <span className="receitas-brand-name">WI CAKES</span>
            <span className="receitas-brand-sub">
              • Bolos · Doces · Salgados · Pizzas
            </span>
          </div>

          <nav className="receitas-nav">
            <Link href="/estoque" className="receitas-nav-link">
              Estoque
            </Link>
            <Link href="/receitas" className="receitas-nav-link receitas-nav-link--active">
              Receitas
            </Link>
          </nav>
        </div>

        {/* Cabeçalho */}
        <div className="receitas-header">
          <div>
            <h1 className="receitas-title">Receitas & Ficha Técnica</h1>
            <p className="receitas-subtitle">
              Monte a composição de cada item produzido com custo puxado automaticamente do estoque.
            </p>
          </div>

          <button onClick={openNewRecipeModal} className="rc-btn rc-btn-primary">
            + Nova Receita
          </button>
        </div>

        {/* Alertas */}
        {error && <div className="rc-alert rc-alert--error">{error}</div>}
        {successMsg && <div className="rc-alert rc-alert--success">{successMsg}</div>}

        {loading ? (
          <div className="ficha-card">
            <p className="rc-empty-text">Carregando receitas e insumos...</p>
          </div>
        ) : (
          <div className="receitas-grid">
            {/* COLUNA ESQUERDA: LISTA DE RECEITAS */}
            <div className="receitas-sidebar receitas-list-card">
              <div className="receitas-list-header">
                <h2 className="receitas-list-heading">Receitas ({recipes.length})</h2>
                <input
                  type="text"
                  placeholder="Buscar receita (ex: 3 Queijos, Calabresa)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="receitas-search"
                />
              </div>

              {filteredRecipes.length === 0 ? (
                <div className="rc-empty-box">
                  <p className="rc-empty-text">Nenhuma receita encontrada.</p>
                  <button
                    onClick={openNewRecipeModal}
                    className="rc-btn rc-btn-sm-gold rc-empty-cta"
                  >
                    Criar primeira receita
                  </button>
                </div>
              ) : (
                <div className="receitas-items">
                  {filteredRecipes.map((recipe) => {
                    const isSelected = recipe.id === selectedRecipeId
                    const cost = recipeCostsMap.get(recipe.id) || 0
                    const y = Number(recipe.yield_quantity) || 1
                    const unitCost = y > 0 ? cost / y : cost

                    return (
                      <button
                        key={recipe.id}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        className={`receita-row-btn ${
                          isSelected ? 'receita-row-btn--active' : ''
                        }`}
                      >
                        <div>
                          <div className="receita-row-name">{recipe.name}</div>
                          <div className="receita-row-yield">
                            Rende: {formatNumber(y)} {recipe.yield_unit}
                          </div>
                        </div>
                        <div className="receita-row-cost-wrap">
                          <div className="receita-row-cost">{formatBRL(unitCost)}</div>
                          <div className="receita-row-unit">por {recipe.yield_unit}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* COLUNA DIREITA: FICHA TÉCNICA DA RECEITA SELECIONADA */}
            <div className="receitas-main">
              {!selectedRecipe ? (
                <div className="ficha-card rc-empty-box">
                  <p className="rc-empty-title">Nenhuma receita selecionada</p>
                  <p className="rc-empty-text">
                    Crie uma nova receita (ex.: 3 Queijos, Calabresa, Massa de Pizza) para começar a montar sua ficha técnica.
                  </p>
                  <div>
                    <button
                      onClick={openNewRecipeModal}
                      className="rc-btn rc-btn-primary rc-empty-cta"
                    >
                      + Criar Receita
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Cabeçalho da Receita + Resumo de Custos */}
                  <div className="ficha-card">
                    <div className="ficha-header">
                      <div>
                        <div className="ficha-title-row">
                          <h2 className="ficha-title">{selectedRecipe.name}</h2>
                          <span className="ficha-yield-badge">
                            Rende {formatNumber(Number(selectedRecipe.yield_quantity))}{' '}
                            {selectedRecipe.yield_unit}
                          </span>
                        </div>
                        {selectedRecipe.description && (
                          <p className="ficha-description">{selectedRecipe.description}</p>
                        )}
                      </div>

                      <div className="ficha-actions">
                        <button
                          onClick={() => openEditRecipeModal(selectedRecipe)}
                          className="rc-btn rc-btn-sm-gold"
                        >
                          Editar Receita
                        </button>
                        <button
                          onClick={handleDuplicateRecipe}
                          disabled={savingRecipe}
                          className="rc-btn rc-btn-sm-duplicate"
                        >
                          Duplicar
                        </button>
                        <button
                          onClick={handleArchiveRecipe}
                          className="rc-btn rc-btn-sm-danger"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    {/* Cards de Custo & Simulador de Preço */}
                    <div className="metrics-grid">
                      <div className="metric-box metric-box--cost">
                        <p className="metric-label">Custo Total da Receita</p>
                        <p className="metric-value">{formatBRL(totalRecipeCost)}</p>
                        <p className="metric-sub">
                          Custo por {selectedRecipe.yield_unit}:{' '}
                          <strong>{formatBRL(costPerYieldUnit)}</strong>
                        </p>
                      </div>

                      <div className="metric-box metric-box--suggested">
                        <div className="metric-top">
                          <p className="metric-label metric-label--gold">Preço Sugerido</p>
                          <div className="inline-sim-control">
                            <span>Markup:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={markupMultiplier}
                              onChange={(e) => setMarkupMultiplier(e.target.value)}
                              className="inline-sim-input"
                            />
                            <span>x</span>
                          </div>
                        </div>
                        <p className="metric-value metric-value--gold">
                          {formatBRL(pricingSimulation.suggested)}
                        </p>
                        <p className="metric-sub">Baseado no custo unitário</p>
                      </div>

                      <div className="metric-box metric-box--profit">
                        <div className="metric-top">
                          <p className="metric-label metric-label--wine">Lucro Estimado</p>
                          <div className="inline-sim-control">
                            <span>Venda R$:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={targetSalePrice}
                              onChange={(e) => setTargetSalePrice(e.target.value)}
                              className="inline-sim-input inline-sim-input--sale"
                            />
                          </div>
                        </div>
                        <p
                          className={`metric-value ${
                            pricingSimulation.profit < 0 ? 'metric-value--loss' : ''
                          }`}
                        >
                          {formatBRL(pricingSimulation.profit)}
                        </p>
                        <p className="metric-sub">
                          Margem: {formatNumber(pricingSimulation.marginPercent)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Formulário: Adicionar Ingrediente */}
                  <div className="add-ing-card">
                    <h3 className="add-ing-title">
                      Adicionar / Atualizar Ingrediente na Receita
                    </h3>

                    {products.length === 0 ? (
                      <p className="rc-empty-text">
                        Cadastre seus insumos primeiro na tela <strong>/estoque</strong> para adicioná-los aqui.
                      </p>
                    ) : (
                      <form onSubmit={handleAddIngredient} className="add-ing-form">
                        <div className="add-ing-col-product">
                          <label className="rc-label">Ingrediente (do Estoque)</label>
                          <select
                            value={selectedProductId}
                            onChange={(e) => {
                              setSelectedProductId(e.target.value)
                              setIngredientInputUnit('base')
                            }}
                            className="rc-control"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="add-ing-col-qty">
                          <label className="rc-label">Quantidade</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder="Ex: 150 ou 1"
                            value={ingredientQtyInput}
                            onChange={(e) => setIngredientQtyInput(e.target.value)}
                            className="rc-control"
                          />
                        </div>

                        <div className="add-ing-col-unit">
                          <label className="rc-label">Unidade</label>
                          <select
                            value={ingredientInputUnit}
                            onChange={(e) =>
                              setIngredientInputUnit(e.target.value as 'base' | 'kg_or_l')
                            }
                            className="rc-control"
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

                        <div className="add-ing-col-submit">
                          <button
                            type="submit"
                            disabled={savingIngredient}
                            className="rc-btn rc-btn-insert"
                          >
                            {savingIngredient ? '...' : '+ Inserir'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Tabela de Ingredientes da Receita */}
                  <div className="comp-card">
                    <div className="comp-header">
                      <h3 className="comp-title">
                        Composição / Ingredientes ({selectedIngredients.length})
                      </h3>
                      <span className="comp-hint">
                        Valores atualizados pelo custo médio do estoque
                      </span>
                    </div>

                    {selectedIngredients.length === 0 ? (
                      <div className="rc-empty-box">
                        <p className="rc-empty-text">
                          Nenhum ingrediente adicionado ainda. Use o formulário acima para inserir os itens desta receita.
                        </p>
                      </div>
                    ) : (
                      <div className="comp-table-wrap">
                        <table className="comp-table">
                          <thead>
                            <tr>
                              <th>Ingrediente</th>
                              <th>Qtd.</th>
                              <th>Custo Unit. Estoque</th>
                              <th>Custo Parcial</th>
                              <th>% do Custo</th>
                              <th className="col-actions">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedIngredients.map((item) => {
                              const share =
                                totalRecipeCost > 0
                                  ? (item.partialCost / totalRecipeCost) * 100
                                  : 0

                              return (
                                <tr key={item.id}>
                                  <td className="comp-td-name">
                                    {item.product?.name || 'Produto removido'}
                                  </td>
                                  <td className="comp-td-qty">
                                    {formatNumber(Number(item.quantity))} {item.unit}
                                  </td>
                                  <td className="comp-td-muted">
                                    {item.unit === 'g' || item.unit === 'ml'
                                      ? `${formatBRL(item.unitCost * 1000, 2)}/${
                                          item.unit === 'g' ? 'kg' : 'L'
                                        }`
                                      : `${formatBRL(item.unitCost, 2)}/un`}
                                  </td>
                                  <td className="comp-td-cost">
                                    {formatBRL(item.partialCost)}
                                  </td>
                                  <td className="comp-td-muted">{formatNumber(share)}%</td>
                                  <td className="col-actions">
                                    <button
                                      onClick={() => handleRemoveIngredient(item.id)}
                                      className="rc-btn rc-btn-sm-danger"
                                    >
                                      Remover
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={3}>CUSTO TOTAL DA RECEITA</td>
                              <td>{formatBRL(totalRecipeCost)}</td>
                              <td className="comp-td-muted">100%</td>
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
        <div className="rc-modal-backdrop">
          <div className="rc-modal-card">
            <div className="rc-modal-header">
              <h2 className="rc-modal-title">
                {editingRecipe ? 'Editar Receita' : 'Nova Receita'}
              </h2>
              <button
                onClick={() => setShowRecipeModal(false)}
                className="rc-modal-close"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="rc-modal-form">
              <div>
                <label className="rc-label">Nome da Receita *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 3 Queijos, Calabresa, Massa Pizza"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="rc-control"
                />
              </div>

              <div className="rc-modal-grid-2">
                <div>
                  <label className="rc-label">Rendimento *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="Ex: 1"
                    value={recipeYieldQty}
                    onChange={(e) => setRecipeYieldQty(e.target.value)}
                    className="rc-control"
                  />
                </div>

                <div>
                  <label className="rc-label">Unidade de Rendimento *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: un, pizza, porção, g"
                    value={recipeYieldUnit}
                    onChange={(e) => setRecipeYieldUnit(e.target.value)}
                    className="rc-control"
                  />
                </div>
              </div>

              <div>
                <label className="rc-label">Descrição / Modo de Preparo (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Pizza tamanho padrão 30cm..."
                  value={recipeDescription}
                  onChange={(e) => setRecipeDescription(e.target.value)}
                  className="rc-control"
                />
              </div>

              <div className="rc-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowRecipeModal(false)}
                  className="rc-btn rc-btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRecipe}
                  className="rc-btn rc-btn-primary"
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