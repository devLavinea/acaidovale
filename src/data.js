import { doc, getDoc, setDoc } from 'firebase/firestore'
import { adminAuth, adminDb } from './adminAuth'
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
  store: { name: 'Açaí do Vale', contact: '', addressText: '', ifoodUrl: '', street: '', number: '', complement: '', neighborhood: '', city: 'Juazeiro', state: 'BA', cep: '', latitude: '', longitude: '' },
  hours: { monday: { open: false, start: '18:00', end: '22:00', pauses: [] }, tuesday: { open: false, start: '18:00', end: '22:00', pauses: [] }, wednesday: { open: false, start: '18:00', end: '22:00', pauses: [] }, thursday: { open: false, start: '18:00', end: '22:00', pauses: [] }, friday: { open: false, start: '18:00', end: '23:00', pauses: [] }, saturday: { open: false, start: '18:00', end: '23:00', pauses: [] }, sunday: { open: false, start: '18:00', end: '22:00', pauses: [] } },
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
export function saveProducts(products) {
  localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products))
  if (adminAuth.currentUser) setDoc(doc(adminDb, 'catalogo', 'produtos'), { products, updatedAt: new Date().toISOString() }, { merge: true }).catch(error => console.warn('Não foi possível sincronizar os produtos.', error))
}
export async function loadProductsFromFirebase() {
  try {
    await authReady
    const snap = await getDoc(doc(db, 'catalogo', 'produtos'))
    if (!snap.exists() || !Array.isArray(snap.data().products)) return null
    localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(snap.data().products))
    return snap.data().products
  } catch (error) { console.warn('Não foi possível carregar produtos do Firebase.', error); return null }
}
export function loadAddonGroups() { return readStorage(ADDON_STORAGE_KEY, DEFAULT_ADDON_GROUPS) }
export function saveAddonGroups(groups) {
  localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(groups))
  if (adminAuth.currentUser) setDoc(doc(adminDb, 'catalogo', 'produtos'), { addonGroups: groups, updatedAt: new Date().toISOString() }, { merge: true }).catch(error => console.warn('Não foi possível sincronizar os acompanhamentos.', error))
}
export async function loadAddonGroupsFromFirebase() {
  try {
    await authReady
    const snap = await getDoc(doc(db, 'catalogo', 'produtos'))
    if (!snap.exists() || !Array.isArray(snap.data().addonGroups)) return null
    localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(snap.data().addonGroups))
    return snap.data().addonGroups
  } catch (error) { console.warn('Não foi possível carregar acompanhamentos do Firebase.', error); return null }
}
export function loadSettings() {
  const saved = readStorage(SETTINGS_STORAGE_KEY, {})
  return { ...DEFAULT_SETTINGS, ...saved, store: { ...DEFAULT_SETTINGS.store, ...(saved.store || {}) }, payment: { ...DEFAULT_SETTINGS.payment, ...(saved.payment || {}) }, hours: { ...DEFAULT_SETTINGS.hours, ...(saved.hours || {}) }, deliveryBands: Array.isArray(saved.deliveryBands) && saved.deliveryBands.length ? saved.deliveryBands : DEFAULT_SETTINGS.deliveryBands }
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
      hours: { ...DEFAULT_SETTINGS.hours, ...(remote.hours || {}) },
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
    if (!adminAuth.currentUser) throw new Error('É necessário entrar com a conta administrativa para salvar as configurações.')
    await setDoc(doc(adminDb, 'dados_loja', 'loja'), {
      spoonEnabled: Boolean(settings?.spoonEnabled),
      spoonPrice: Number(settings?.spoonPrice || 0),
      store: { ...DEFAULT_SETTINGS.store, ...(settings?.store || {}) },
      payment: { ...DEFAULT_SETTINGS.payment, ...(settings?.payment || {}) },
      hours: { ...DEFAULT_SETTINGS.hours, ...(settings?.hours || {}) },
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


const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function minutesOfDay(value) {
  const [h, m] = String(value || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1
}
export function getStoreHoursStatus(settings, now = new Date()) {
  const hours = settings?.hours
  const dayKey = WEEKDAYS[now.getDay()]
  const today = hours?.[dayKey]
  if (!today || !today.open || !today.start || !today.end) {
    const next = findNextOpening(hours, now)
    return { isOpen: false, configured: Boolean(hours), message: next ? `Loja fechada. Abrimos ${next.label} às ${next.time}.` : 'Loja fechada no momento.' }
  }
  const current = now.getHours() * 60 + now.getMinutes()
  const start = minutesOfDay(today.start)
  const end = minutesOfDay(today.end)
  const inMainHours = start >= 0 && end >= 0 && current >= start && current < end
  const pause = (today.pauses || []).find(p => current >= minutesOfDay(p.start) && current < minutesOfDay(p.end))
  if (inMainHours && !pause) return { isOpen: true, configured: true, message: 'Estamos abertos e aceitando pedidos.' }
  if (pause) return { isOpen: false, configured: true, message: `Estamos em pausa até às ${pause.end}.` }
  const next = findNextOpening(hours, now)
  return { isOpen: false, configured: true, message: next ? `Loja fechada. Abrimos ${next.label} às ${next.time}.` : 'Loja fechada no momento.' }
}
function findNextOpening(hours, now) {
  if (!hours) return null
  const labels = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(now)
    date.setDate(now.getDate() + offset)
    const day = hours[WEEKDAYS[date.getDay()]]
    if (!day?.open || !day.start) continue
    if (offset === 0 && minutesOfDay(day.start) <= now.getHours() * 60 + now.getMinutes()) continue
    return { label: offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : labels[date.getDay()], time: day.start }
  }
  return null
}
