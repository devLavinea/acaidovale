import { useEffect, useState } from 'react'
import { IoClose, IoReceiptOutline } from 'react-icons/io5'
import { getCustomerOrders } from '../customer'

function money(v){return `R$ ${Number(v||0).toFixed(2).replace('.',',')}`}
function date(v){ try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return v}}

export default function OrdersHistory({ onClose }) {
  const [orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{getCustomerOrders().then(setOrders).catch(e=>setError(e.message||'Não foi possível carregar seus pedidos.')).finally(()=>setLoading(false))},[])
  return <div className="modal-backdrop" onClick={onClose}><section className="order-modal history-modal" onClick={e=>e.stopPropagation()}>
    <button className="modal-close" onClick={onClose}><IoClose/></button>
    <div className="order-title-block"><span className="admin-badge">MEUS PEDIDOS</span><h1>Últimos pedidos</h1><p>Aqui ficam os pedidos feitos neste dispositivo.</p></div>
    {loading&&<div className="history-empty">Carregando seus pedidos...</div>}
    {error&&<div className="delivery-error">{error}</div>}
    {!loading&&!orders.length&&!error&&<div className="history-empty"><IoReceiptOutline/><strong>Você ainda não fez nenhum pedido.</strong><span>Quando fizer, ele aparecerá aqui.</span></div>}
    <div className="history-list">{orders.map(order=><article className="history-card" key={order.id}><div className="history-head"><div><strong>{order.id}</strong><small>{date(order.createdAt)}</small></div><b>{money(order.total)}</b></div><div className="history-products">{(order.items||[]).map((item,i)=><div key={i}><span>{item.quantity}x {item.name}</span><small>{item.addons?.length?item.addons.join(' • '):'Sem acompanhamentos'}</small></div>)}</div><div className="history-foot"><span className={`status status-${order.status||'novo'}`}>{order.status||'novo'}</span><small>{order.delivery?.km?.toFixed(1).replace('.',',')} km • {order.customer?.address || ''}</small></div></article>)}</div>
  </section></div>
}
