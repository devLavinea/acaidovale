import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCawN7xOt-sTxJZ1sOCkmbBRgQxnKww-aE',
  authDomain: 'acaidovale-104ba.firebaseapp.com',
  projectId: 'acaidovale-104ba',
  storageBucket: 'acaidovale-104ba.firebasestorage.app',
  messagingSenderId: '726720265795',
  appId: '1:726720265795:web:8f84d98eb7598e59389ef6',
  measurementId: 'G-EH2CC7B537'
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

/*
 * Mantém o mesmo usuário anônimo neste navegador.
 * Não chamamos signInAnonymously() toda vez que a página abre,
 * pois isso criaria um UID novo e impediria o preenchimento automático.
 */
export const authReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence)
  } catch (error) {
    console.warn('Não foi possível configurar a persistência do Firebase:', error)
  }

  if (auth.currentUser) return auth.currentUser

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    let settled = false

    const finish = (user, error = null) => {
      if (settled) return
      settled = true
      unsubscribe()
      if (error) reject(error)
      else resolve(user || null)
    }

    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        finish(user)
        return
      }

      try {
        const result = await signInAnonymously(auth)
        finish(result.user)
      } catch (error) {
        console.error('Erro ao iniciar autenticação anônima:', error)
        finish(null, error)
      }
    }, (error) => finish(null, error))
  })
})()
