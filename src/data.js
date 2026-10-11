import { doc, getDoc, setDoc } from 'firebase/firestore'
import { authReady, db } from './firebase'

export const DEFAULT_PRODUCTS = [
  { id: '1', name: 'Açaí 300 ml', description: 'Açaí cremoso para matar a vontade.', price: 17, active: true },
  { id: '2', name: 'Açaí 500 ml', description: 'Mais açaí para aproveitar cada colherada.', price: 25, active: true },
  { id: '3', name: 'Açaí 700 ml', description: 'O queridinho para quem quer caprichar.', price: 35, active: true },
]

export const DEFAULT_ADDON_GROUPS = [
  { id: 'coberturas', name: 'Coberturas', optional: true, multiple: true, maxSelections: 0, items: [
    { id: 'chocolate', name: 'Cobertura de Chocolate', price: 0, active: true },
    { id: 'morango', name: 'Cobertura de Morango', price: 0, active: true },
    { id: 'condensado', name: 'Leite Condensado', price: 0, active: true },
  ] },
  { id: 'frutas', name: 'Frutas', optional: true, multiple: true, maxSelections: 0, items: [{ id: 'banana', name: 'Banana', price: 0, active: true }] },
  { id: 'complementos', name: 'Complementos (à vontade)!', optional: true, multiple: true, maxSelections: 0, items: [
    { id: 'granulado', name: 'Granulado', price: 0, active: true }, { id: 'xerem', name: 'Xerém de Amendoim', price: 0, active: true },
    { id: 'chocobol', name: 'Chocobol', price: 0, active: true }, { id: 'leite-po', name: 'Leite em pó', price: 0, active: true },
    { id: 'granola', name: 'Granola', price: 0, active: true }, { id: 'mms', name: 'M&Ms', price: 0, active: true },
    { id: 'creme-avelã', name: 'Creme de Avelã', price: 0, active: true },
  ] },
]

export const PRODUCT_STORAGE_KEY = 'acai-do-vale-produtos'
export const ADDON_STORAGE_KEY = 'acai-do-vale-complementos'
export const ORDER_STORAGE_KEY = 'acai-do-vale-pedidos'
export const SETTINGS_STORAGE_KEY = 'acai-do-vale-config'

export const DEFAULT_SETTINGS = {
  spoonEnabled: true,
  spoonPrice: 0,
  store: { name: 'Açaí do Vale', street: '', number: '', complement: '', neighborhood: '', city: 'Juazeiro', state: 'BA', cep: '', latitude: '', longitude: '' },
  payment: { pixKey: '74988248014', pixName: 'Lavinea Souza Santos', pixBank: 'Mercado Pago' },
  deliveryBands: [
    { id: 'free', maxKm: 2, fee: 0, minutes: 20 },
    { id: 'b1', maxKm: 5, fee: 5, minutes: 30 },
    { id: 'b2', maxKm: 7, fee: 7, minutes: 40 },
    { id: 'b3', maxKm: 10, fee: 10, minutes: 50 },
  ],
}

function readStorage(key, fallback) {
  try { const saved = localStorage.getItem(key); if (saved) return JSON.parse(saved) } catch { /* padrão */ }
  return fallback
}
export function loadProducts() { return readStorage(PRODUCT_STORAGE_KEY, DEFAULT_PRODUCTS) }
export function saveProducts(products) { localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products)) }
export function loadAddonGroups() { return readStorage(ADDON_STORAGE_KEY, DEFAULT_ADDON_GROUPS) }
export function saveAddonGroups(groups) { localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(groups)) }
export function loadSettings() {
  const saved = readStorage(SETTINGS_STORAGE_KEY, {})
  return { ...DEFAULT_SETTINGS, ...saved, store: { ...DEFAULT_SETTINGS.store, ...(saved.store || {}) }, payment: { ...DEFAULT_SETTINGS.payment, ...(saved.payment || {}) }, deliveryBands: Array.isArray(saved.deliveryBands) && saved.deliveryBands.length ? saved.deliveryBands : DEFAULT_SETTINGS.deliveryBands }
}
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  return saveSettingsToFirebase(settings)
}

export async function loadSettingsFromFirebase() {
  try {
    await authReady
    const snap = await getDoc(doc(db, 'dados_loja', 'loja'))
    if (!snap.exists()) return null
    const remote = snap.data()
    const merged = {
      ...DEFAULT_SETTINGS,
      ...remote,
      store: { ...DEFAULT_SETTINGS.store, ...(remote.store || {}) },
      payment: { ...DEFAULT_SETTINGS.payment, ...(remote.payment || {}) },
      deliveryBands: Array.isArray(remote.deliveryBands) && remote.deliveryBands.length
        ? remote.deliveryBands
        : DEFAULT_SETTINGS.deliveryBands
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
    return merged
  } catch (error) {
    console.warn('Não foi possível carregar os dados da loja do Firebase.', error)
    return null
  }
}

export async function saveSettingsToFirebase(settings) {
  try {
    await authReady
    await setDoc(doc(db, 'dados_loja', 'loja'), {
      spoonEnabled: Boolean(settings?.spoonEnabled),
      spoonPrice: Number(settings?.spoonPrice || 0),
      store: { ...DEFAULT_SETTINGS.store, ...(settings?.store || {}) },
      payment: { ...DEFAULT_SETTINGS.payment, ...(settings?.payment || {}) },
      deliveryBands: Array.isArray(settings?.deliveryBands) ? settings.deliveryBands : DEFAULT_SETTINGS.deliveryBands,
      updatedAt: new Date().toISOString()
    }, { merge: true })
    return true
  } catch (error) {
    console.warn('Não foi possível salvar os dados da loja no Firebase.', error)
    return false
  }
}
export function loadOrders() { return readStorage(ORDER_STORAGE_KEY, []) }
export function saveOrders(orders) { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders)) }
export function addOrder(order) { const next = [order, ...loadOrders()]; saveOrders(next); window.dispatchEvent(new Event('orders-updated')); return order }
