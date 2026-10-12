import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth'

const config = {
  apiKey: 'AIzaSyCawN7xOt-sTxJZ1sOCkmbBRgQxnKww-aE',
  authDomain: 'acaidovale-104ba.firebaseapp.com',
  projectId: 'acaidovale-104ba',
  storageBucket: 'acaidovale-104ba.firebasestorage.app',
  messagingSenderId: '726720265795',
  appId: '1:726720265795:web:8f84d98eb7598e59389ef6'
}
const app = getApps().find(item => item.name === 'acai-admin-auth') || initializeApp(config, 'acai-admin-auth')
export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
export const loginAdmin = (email, password) => signInWithEmailAndPassword(adminAuth, email.trim(), password)
export const sendAdminPasswordReset = (email) => sendPasswordResetEmail(adminAuth, email.trim())
export async function changeAdminPassword(currentPassword, newPassword) {
  const user = adminAuth.currentUser
  if (!user?.email) throw new Error('Entre novamente no painel para alterar a senha.')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}
export const logoutAdmin = () => signOut(adminAuth)
