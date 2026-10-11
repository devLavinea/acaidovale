import { IoAdd, IoCartOutline, IoRemove, IoTrashOutline, IoClose } from 'react-icons/io5'
import { useCart } from '../cart'
import { useEffect, useState } from 'react'
import Order from './order'

export default function Cart() {
  const { items, count, subtotal, updateQuantity, removeItem } = useCart()
  const [open, setOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  useEffect(() => {
    const fn = () => setOpen(true)
    const checkoutFn = () => { setOpen(false); setCheckout(true) }
    window.addEventListener('open-cart', fn)
    window.addEventListener('open-cart-checkout', checkoutFn)
    return () => { window.removeEventListener('open-cart', fn); window.removeEventListener('open-cart-checkout', checkoutFn) }
  }, [])
  return <>
    <button className="floating-cart" type="button" onClick={() => setOpen(true)} aria-label="Abrir carrinho"><IoCartOutline /><span>{count}</span></button>
    {open && <div className="cart-backdrop" onClick={() => setOpen(false)}>
      <aside className="cart-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cart-panel-head"><div><IoCartOutline /><h2>Meu Carrinho</h2><b>{count}</b></div><button onClick={() => setOpen(false)}><IoClose /></button></div>
        <div className="cart-items">{items.length === 0 ? <div className="cart-empty">Seu carrinho está vazio.<button className="cart-continue" onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-order-builder')) }}>Ver Cardápio</button></div> : items.map(item => <div className="cart-item" key={item.cartId}>
          <img src={item.image} alt="" /><div className="cart-item-info"><strong>{item.name}</strong><small>{item.addons?.length ? item.addons.join(' • ') : 'Sem acompanhamentos'}</small><b>R$ {Number(item.total * item.quantity).toFixed(2).replace('.', ',')}</b><div className="cart-qty"><button onClick={() => updateQuantity(item.cartId, item.quantity - 1)}><IoRemove /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.cartId, item.quantity + 1)}><IoAdd /></button><button className="cart-delete" onClick={() => removeItem(item.cartId)}><IoTrashOutline /></button></div></div>
        </div>)}</div>
        {items.length > 0 && <div className="cart-summary"><div><span>Subtotal</span><strong>R$ {subtotal.toFixed(2).replace('.', ',')}</strong></div><button className="cart-checkout" onClick={() => { setOpen(false); setCheckout(true) }}>Finalizar Pedido <span>→</span></button></div>}
      </aside>
    </div>}
    {checkout && <Order onClose={() => setCheckout(false)} checkoutOnly />}
  </>
}
