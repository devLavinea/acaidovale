import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const KEY = 'acai-do-vale-carrinho'

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return []

      const saved = JSON.parse(raw)
      // O carrinho expira 24 horas após ser salvo.
      // Também aceita o formato antigo (array) para não quebrar
      // carrinhos existentes durante a atualização.
      if (Array.isArray(saved)) {
        localStorage.removeItem(KEY)
        return []
      }

      const savedAt = Number(saved?.savedAt || 0)
      if (!savedAt || Date.now() - savedAt >= 24 * 60 * 60 * 1000) {
        localStorage.removeItem(KEY)
        return []
      }

      return Array.isArray(saved.items) ? saved.items : []
    } catch {
      localStorage.removeItem(KEY)
      return []
    }
  })

  useEffect(() => {
    if (items.length === 0) {
      localStorage.removeItem(KEY)
      return
    }

    let savedAt = Date.now()
    try {
      const existing = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (existing && !Array.isArray(existing) && Number(existing.savedAt)) {
        savedAt = Number(existing.savedAt)
      }
    } catch { /* cria um novo timestamp */ }

    localStorage.setItem(KEY, JSON.stringify({
      savedAt,
      items
    }))
  }, [items])

  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0) * item.quantity, 0)

  function addItem(item) {
    setItems((current) => [...current, { ...item, cartId: `${Date.now()}-${Math.random()}`, quantity: 1 }])
  }
  function updateQuantity(cartId, quantity) {
    setItems((current) => quantity <= 0 ? current.filter((item) => item.cartId !== cartId) : current.map((item) => item.cartId === cartId ? { ...item, quantity } : item))
  }
  function removeItem(cartId) { setItems((current) => current.filter((item) => item.cartId !== cartId)) }
  function clearCart() { setItems([]) }

  const value = useMemo(() => ({ items, count, subtotal, addItem, updateQuantity, removeItem, clearCart }), [items, count, subtotal])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart() { return useContext(CartContext) }
