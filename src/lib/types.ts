export type ProductType = 'insumo' | 'revenda'
export type UnitType = 'g' | 'ml' | 'un'
export type StockMovementType = 'compra' | 'producao' | 'venda' | 'ajuste' | 'perda'
export type MenuCategory = 'pizza' | 'salgado' | 'bebida' | 'sobremesa' | 'outro'
export type MenuItemType = 'produzido' | 'revenda'
export type OrderModality = 'retirada' | 'entrega'
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao'
export type CardType = 'credito' | 'debito'
export type OrderStatus = 'em_producao' | 'concluido' | 'cancelado'

export interface Product {
  id: string
  name: string
  type: ProductType
  unit: UnitType
  current_stock: number
  min_stock: number
  average_cost: number
  last_purchase_cost: number
  active: boolean
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  full_name: string
  phone?: string | null
  address?: string | null
  neighborhood?: string | null
  city?: string | null
  complement?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: string
  name: string
  category: MenuCategory
  type: MenuItemType
  recipe_id?: string | null
  product_id?: string | null
  cost_price: number
  suggested_price?: number | null
  sale_price: number
  profit: number
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  order_number: number
  customer_id?: string | null
  order_date: string
  modality: OrderModality
  delivery_address?: string | null
  delivery_distance_km: number
  delivery_fee: number
  payment_method: PaymentMethod
  card_type?: CardType | null
  card_fee_percent: number
  card_fee_value: number
  subtotal_products: number
  total_amount: number
  production_cost: number
  profit: number
  status: OrderStatus
  observations?: string | null
  created_at: string
  updated_at: string
}
