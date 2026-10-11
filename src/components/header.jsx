import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import { IoClose, IoMenu, IoHome, IoRestaurant, IoReceiptOutline, IoCall, IoCartOutline } from 'react-icons/io5'
import { useCart } from '../cart'
import OrdersHistory from './ordersHistory'

function Header() {
  const [menuOpen,setMenuOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false)
  const {count}=useCart()
  useEffect(()=>{const close=()=>setMenuOpen(false);window.addEventListener('hashchange',close);return()=>window.removeEventListener('hashchange',close)},[])
  function openBuilder(){window.dispatchEvent(new Event('open-order-builder'));setMenuOpen(false)}
  function openCart(){window.dispatchEvent(new Event('open-cart'));setMenuOpen(false)}
  return <>
    <header className="model-header"><nav className="model-nav">
      <a href="#inicio" className="model-logo"><img src={logo} alt="Açaí do Vale"/></a>
      <button className="model-menu-toggle" onClick={()=>setMenuOpen(v=>!v)} aria-label="Menu">{menuOpen?<IoClose/>:<IoMenu/>}</button>
      <div className={`model-nav-menu ${menuOpen?'is-open':''}`}>
        <a className="model-nav-item active" href="#inicio" onClick={()=>setMenuOpen(false)}><IoHome/><span>Início</span></a>
        <button className="model-nav-item" onClick={openBuilder}><IoRestaurant/><span>Cardápio</span></button>
        <button className="model-nav-item" onClick={()=>{setHistoryOpen(true);setMenuOpen(false)}}><IoReceiptOutline/><span>Meus Pedidos</span></button>
        <a className="model-nav-item" href="#footer" onClick={()=>setMenuOpen(false)}><IoCall/><span>Contato</span></a>
        <button className="model-cart-button" onClick={openCart}><IoCartOutline/><span className="cart-count">{count}</span></button>
      </div>
    </nav></header>
    {historyOpen&&<OrdersHistory onClose={()=>setHistoryOpen(false)}/>} 
  </>
}
export default Header
