import { useEffect, useState } from 'react'
import { IoArrowForward, IoRestaurant, IoLeaf, IoFlash, IoShieldCheckmark, IoCar } from 'react-icons/io5'
import Order from './order'
import heroImage from '../assets/fundo-acai-site.webp'
function Cta(){
 const [orderOpen,setOrderOpen]=useState(false)
 useEffect(()=>{const open=()=>setOrderOpen(true);window.addEventListener('open-order-builder',open);return()=>window.removeEventListener('open-order-builder',open)},[])
 return <>
  <main className="model-page">
   <section id="inicio" className="model-hero">
    <img className="model-hero-image" src={heroImage} alt="Açaí do Vale com frutas e granola"/><div className="model-hero-shade"/>
    <div className="model-hero-content"><span className="model-kicker"><i/> AÇAÍ DO VALE</span><h1>O melhor açaí,<br/><em>no seu jeito!</em></h1><p>Sabor, energia e qualidade para o seu dia!</p><button className="model-primary" onClick={()=>setOrderOpen(true)}><IoRestaurant/> Ver Cardápio <IoArrowForward/></button></div>
   </section>

  

   <section className="model-features"><div><IoLeaf/><span>Ingredientes<br/><b>selecionados</b></span></div><div><IoFlash/><span>Mais energia<br/><b>para o seu dia</b></span></div><div><IoShieldCheckmark/><span>Pagamento<br/><b>seguro</b></span></div><div><IoCar/><span>Entrega rápida<br/><b>e com cuidado</b></span></div><button onClick={()=>setOrderOpen(true)}>Faça já o seu pedido! <IoArrowForward/></button></section>
  </main>
  {orderOpen&&<Order onClose={()=>setOrderOpen(false)}/>} 
 </>
}
export default Cta
