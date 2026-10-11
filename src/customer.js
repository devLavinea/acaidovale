import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where
} from 'firebase/firestore'

import { auth, authReady, db } from './firebase'

// A identificação principal do cliente neste navegador.
// O Firestore continua sendo usado para persistência dos dados,
// mas o localStorage garante o preenchimento automático mesmo
// antes/depois da autenticação anônima do Firebase.
const CUSTOMER_STORAGE_KEY = 'acai_do_vale_cliente'
const CUSTOMER_ID_STORAGE_KEY = 'acai_do_vale_cliente_id'

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeCustomer(customer = {}) {
  return {
    id: customer.id || '',
    name: String(customer.name || '').trim(),
    phone: normalizePhone(customer.phone),
    cep: String(customer.cep || '').replace(/\D/g, ''),
    address: {
      street: customer.address?.street || '',
      number: customer.address?.number || '',
      complement: customer.address?.complement || '',
      neighborhood: customer.address?.neighborhood || '',
      city: customer.address?.city || '',
      state: customer.address?.state || ''
    },
    location: {
      latitude: Number(customer.location?.latitude) || null,
      longitude: Number(customer.location?.longitude) || null
    }
  }
}

function saveCustomerInBrowser(customer) {
  try {
    const normalized = normalizeCustomer(customer)

    localStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify(normalized)
    )

    if (normalized.id) {
      localStorage.setItem(
        CUSTOMER_ID_STORAGE_KEY,
        String(normalized.id)
      )
    }
  } catch (error) {
    console.warn(
      'Não foi possível salvar os dados do cliente neste navegador.',
      error
    )
  }
}

function getCustomerFromBrowser() {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY)

    if (!raw) return null

    const customer = JSON.parse(raw)

    if (!customer || typeof customer !== 'object') {
      return null
    }

    if (!customer.name && !customer.phone && !customer.cep) {
      return null
    }

    return normalizeCustomer(customer)
  } catch (error) {
    console.warn(
      'Não foi possível ler os dados salvos neste navegador.',
      error
    )
    return null
  }
}

function saveCustomerIdInBrowser(id) {
  if (!id) return

  try {
    localStorage.setItem(
      CUSTOMER_ID_STORAGE_KEY,
      String(id)
    )
  } catch (error) {
    console.warn(
      'Não foi possível salvar a identificação do cliente.',
      error
    )
  }
}

function getCustomerIdFromBrowser() {
  try {
    return localStorage.getItem(
      CUSTOMER_ID_STORAGE_KEY
    ) || ''
  } catch {
    return ''
  }
}

async function getCurrentUser() {
  // Não bloqueia o preenchimento do formulário caso o Firebase
  // demore. A identificação do navegador é independente dele.
  try {
    const browserCustomer = getCustomerFromBrowser()

    if (browserCustomer?.id) {
      // Continua aguardando a autenticação abaixo para operações
      // que precisam do Firestore.
    }

    const readyUser = await authReady
    return readyUser || auth.currentUser || null
  } catch (error) {
    console.warn('Não foi possível obter o usuário do Firebase.', error)
    return auth.currentUser || null
  }
}

async function getCustomerById(id) {
  if (!id) return null

  const snap = await getDoc(doc(db, 'clientes', id))

  if (!snap.exists()) return null

  return {
    id: snap.id,
    ...snap.data()
  }
}

/*
 * Carrega o cliente deste navegador.
 *
 * A prioridade é:
 * 1. cadastro completo salvo no localStorage;
 * 2. cadastro no Firestore pelo UID do Firebase;
 * 3. cadastro antigo associado ao UID salvo no navegador.
 *
 * Assim, abrir o checkout novamente no MESMO navegador
 * preenche os dados automaticamente.
 */
export async function loadSavedCustomer() {
  const browserCustomer = getCustomerFromBrowser()

  // Este é o ponto principal da identificação do navegador.
  // Não depende de login, telefone ou CEP.
  if (browserCustomer) {
    return browserCustomer
  }

  const user = await getCurrentUser()

  if (!user?.uid) {
    return null
  }

  try {
    const saved = await getCustomerById(user.uid)

    if (saved) {
      saveCustomerInBrowser(saved)
      return saved
    }
  } catch (error) {
    console.error(
      'Erro ao carregar cliente pelo UID:',
      error
    )
  }

  const browserId = getCustomerIdFromBrowser()

  if (browserId && browserId === user.uid) {
    try {
      const saved = await getCustomerById(browserId)

      if (saved) {
        saveCustomerInBrowser(saved)
        return saved
      }
    } catch (error) {
      console.error(
        'Erro ao carregar cliente do navegador:',
        error
      )
    }
  }

  return null
}

export async function saveCustomer(customer = {}) {
  const normalized = normalizeCustomer(customer)
  const user = await getCurrentUser()

  if (!user?.uid) {
    // Mesmo que o Firebase esteja temporariamente indisponível,
    // guarda o cadastro no navegador para o próximo checkout.
    saveCustomerInBrowser(normalized)

    throw new Error(
      'Não foi possível conectar ao banco de dados. Os dados foram mantidos neste navegador; tente enviar o pedido novamente.'
    )
  }

  if (!normalized.phone) {
    throw new Error('Informe o telefone do cliente.')
  }

  const id = user.uid

  const payload = {
    name: normalized.name,
    phone: normalized.phone,
    cep: normalized.cep,
    address: normalized.address,
    location: normalized.location,
    userId: user.uid,
    updatedAt: new Date().toISOString()
  }

  // Salva primeiro no navegador para garantir o preenchimento
  // automático nas próximas aberturas.
  saveCustomerInBrowser({
    id,
    ...payload
  })

  await setDoc(
    doc(db, 'clientes', id),
    payload,
    { merge: true }
  )

  saveCustomerIdInBrowser(id)

  return {
    id,
    ...payload
  }
}

export async function saveOrderToFirebase(order = {}) {
  const user = await getCurrentUser()

  if (!user?.uid) {
    throw new Error(
      'Não foi possível identificar este navegador. Recarregue a página e tente novamente.'
    )
  }

  const clienteId = user.uid

  saveCustomerIdInBrowser(clienteId)

  // O número do pedido é sequencial e começa em 1000:
  // 1º pedido = 1001, 40º = 1040, 500º = 1500.
  // O contador fica no Firestore para continuar igual em outros
  // celulares/computadores e não depender do localStorage.
  let orderNumber = Number(order.orderNumber || 0)

  if (!orderNumber) {
    const counterRef = doc(db, 'dados_loja', 'controle_pedidos')

    orderNumber = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef)
      const currentCount = Number(counterSnap.exists() ? counterSnap.data().totalPedidos || 0 : 0)
      const nextCount = currentCount + 1
      transaction.set(counterRef, {
        totalPedidos: nextCount,
        updatedAt: new Date().toISOString()
      }, { merge: true })
      return 1000 + nextCount
    })
  }

  const orderId = String(order.orderNumber || orderNumber)

  const payload = {
    ...order,
    id: orderId,
    orderNumber,
    clienteId,
    userId: user.uid,
    createdAt:
      order.createdAt ||
      new Date().toISOString()
  }

  await setDoc(
    doc(db, 'pedidos', orderId),
    payload
  )

  return payload
}

export async function getCustomerOrders() {
  const user = await getCurrentUser()

  if (!user?.uid) return []

  const q = query(
    collection(db, 'pedidos'),
    where('userId', '==', user.uid),
    limit(30)
  )

  const snap = await getDocs(q)

  return snap.docs
    .map((item) => ({
      id: item.id,
      ...item.data()
    }))
    .sort((a, b) =>
      String(b.createdAt || '').localeCompare(
        String(a.createdAt || '')
      )
    )
}
