import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IoAnalyticsOutline, IoLocationOutline, IoPeopleOutline, IoTrendingUpOutline, IoWalletOutline } from 'react-icons/io5'

const DEFAULT_CENTER = [-9.4167, -40.5031]

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function orderDate(order) {
  const value = order?.createdAt || order?.updatedAt
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function orderCustomerKey(order) {
  return String(order?.clienteId || order?.userId || order?.customer?.phone || order?.customer?.name || order?.id || '')
}

function getCustomerAddress(order) {
  const customer = order?.customer || {}
  const address = customer?.address || {}
  return {
    street: address.street || customer.street || '',
    number: address.number || customer.number || '',
    complement: address.complement || customer.complement || '',
    neighborhood: address.neighborhood || customer.neighborhood || '',
    city: address.city || customer.city || '',
    state: address.state || customer.state || '',
    cep: customer.cep || address.cep || ''
  }
}

function getLocation(order) {
  const location = order?.customer?.location || order?.location || {}
  const lat = Number(location.latitude ?? location.lat)
  const lng = Number(location.longitude ?? location.lon ?? location.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.000001 && Math.abs(lng) > 0.000001
    ? { lat, lng }
    : null
}

function aggregateCustomers(orders) {
  const map = new Map()

  orders.forEach((order) => {
    const key = orderCustomerKey(order)
    if (!key) return
    const current = map.get(key) || {
      key,
      name: order?.customer?.name || 'Cliente',
      phone: order?.customer?.phone || '',
      orders: 0,
      spent: 0,
      location: null,
      address: getCustomerAddress(order),
      lastOrder: null
    }

    current.orders += 1
    current.spent += Number(order?.total || 0)
    current.name = order?.customer?.name || current.name
    current.phone = order?.customer?.phone || current.phone
    current.location = getLocation(order) || current.location
    current.address = getCustomerAddress(order)
    const date = orderDate(order)
    if (date && (!current.lastOrder || date > current.lastOrder)) current.lastOrder = date
    map.set(key, current)
  })

  return [...map.values()]
}

function getTopProduct(orders) {
  const map = new Map()
  orders.forEach((order) => {
    ;(order?.items || []).forEach((item) => {
      const key = item?.productId || item?.name || 'Produto'
      const current = map.get(key) || { name: item?.name || 'Produto', quantity: 0, revenue: 0 }
      current.quantity += Number(item?.quantity || 0)
      current.revenue += Number(item?.total || 0)
      map.set(key, current)
    })
  })
  return [...map.values()].sort((a, b) => b.quantity - a.quantity)
}

function getNeighborhoods(orders) {
  const map = new Map()
  orders.forEach((order) => {
    const neighborhood = getCustomerAddress(order).neighborhood || 'Sem bairro informado'
    const key = normalizeText(neighborhood)
    const current = map.get(key) || { name: neighborhood, orders: 0, spent: 0 }
    current.orders += 1
    current.spent += Number(order?.total || 0)
    map.set(key, current)
  })
  return [...map.values()].sort((a, b) => b.orders - a.orders)
}

function MapPanel({ customers, store }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const storeLat = Number(store?.latitude)
    const storeLng = Number(store?.longitude)
    const hasStore = Number.isFinite(storeLat) && Number.isFinite(storeLng) && Math.abs(storeLat) > 0.000001 && Math.abs(storeLng) > 0.000001

    const map = L.map(containerRef.current, { center: hasStore ? [storeLat, storeLng] : DEFAULT_CENTER, zoom: hasStore ? 13 : 12 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    if (hasStore) {
      const storeIcon = L.divIcon({
        className: 'dashboard-store-marker-wrap',
        html: '<span class="dashboard-store-marker">⌂</span>',
        iconSize: [38, 38],
        iconAnchor: [19, 38]
      })
      L.marker([storeLat, storeLng], { icon: storeIcon })
        .addTo(map)
        .bindPopup('<strong>Açaí do Vale</strong><br>Loja')
    }

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 100)

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
  }, [store?.latitude, store?.longitude])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((marker) => marker.removeFrom(map))
    markersRef.current = []

    customers.forEach((customer) => {
      if (!customer.location) return
      const size = Math.min(34, 18 + Math.min(customer.orders, 8) * 2)
      const icon = L.divIcon({
        className: 'dashboard-client-marker-wrap',
        html: `<span class="dashboard-client-marker" style="width:${size}px;height:${size}px">${customer.orders > 1 ? customer.orders : ''}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      })
      const address = customer.address
      const addressLine = [address.street, address.number, address.neighborhood].filter(Boolean).join(', ')
      const marker = L.marker([customer.location.lat, customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>${customer.name}</strong><br>${customer.orders} pedido(s) • ${money(customer.spent)}${addressLine ? `<br>${addressLine}` : ''}`)
      markersRef.current.push(marker)
    })

    if (customers.some((customer) => customer.location)) {
      const bounds = L.latLngBounds(customers.filter((customer) => customer.location).map((customer) => [customer.location.lat, customer.location.lng]))
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.12), { maxZoom: 15 })
    }
  }, [customers])

  return <div className="analytics-map" ref={containerRef} aria-label="Mapa de clientes" />
}

export default function DashboardAnalytics({ orders = [], settings = {} }) {
  const [period, setPeriod] = useState('all')

  const filteredOrders = useMemo(() => {
    const valid = orders.filter((order) => order?.status !== 'recusado')
    if (period === 'all') return valid
    const now = new Date()
    const start = new Date(now)
    if (period === '30') start.setDate(now.getDate() - 30)
    if (period === '7') start.setDate(now.getDate() - 7)
    if (period === 'month') start.setDate(1)
    return valid.filter((order) => {
      const date = orderDate(order)
      return date && date >= start
    })
  }, [orders, period])

  const customers = useMemo(() => aggregateCustomers(filteredOrders), [filteredOrders])
  const mappedCustomers = useMemo(() => customers.filter((customer) => customer.location), [customers])
  const topOrders = useMemo(() => [...customers].sort((a, b) => b.orders - a.orders), [customers])
  const topSpenders = useMemo(() => [...customers].sort((a, b) => b.spent - a.spent), [customers])
  const topProducts = useMemo(() => getTopProduct(filteredOrders), [filteredOrders])
  const neighborhoods = useMemo(() => getNeighborhoods(filteredOrders), [filteredOrders])

  const revenue = filteredOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0)
  const averageTicket = filteredOrders.length ? revenue / filteredOrders.length : 0
  const repeatCustomers = customers.filter((customer) => customer.orders > 1).length
  const locationCoverage = customers.length ? Math.round((mappedCustomers.length / customers.length) * 100) : 0

  return (
    <div className="analytics-dashboard">
      <div className="analytics-toolbar">
        <div>
          <h2>Análise da loja</h2>
          <p>Veja onde seus clientes estão, quem mais compra e onde está o faturamento.</p>
        </div>
        <div className="analytics-periods">
          {[['7', '7 dias'], ['30', '30 dias'], ['month', 'Este mês'], ['all', 'Tudo']].map(([value, label]) => (
            <button key={value} className={period === value ? 'is-active' : ''} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="analytics-stats">
        <div className="analytics-stat"><IoTrendingUpOutline /><span>Faturamento</span><strong>{money(revenue)}</strong><small>{filteredOrders.length} pedido(s)</small></div>
        <div className="analytics-stat"><IoWalletOutline /><span>Ticket médio</span><strong>{money(averageTicket)}</strong><small>por pedido</small></div>
        <div className="analytics-stat"><IoPeopleOutline /><span>Clientes</span><strong>{customers.length}</strong><small>{repeatCustomers} recorrente(s)</small></div>
        <div className="analytics-stat"><IoLocationOutline /><span>Clientes no mapa</span><strong>{locationCoverage}%</strong><small>{mappedCustomers.length} localização(ões)</small></div>
      </div>

      <section className="analytics-panel analytics-map-panel">
        <div className="panel-header"><div><h2><IoLocationOutline /> Onde estão seus clientes?</h2><p>Cada ponto representa um cliente. Quanto maior o número, mais pedidos aquele cliente fez.</p></div></div>
        <MapPanel customers={customers} store={settings.store} />
      </section>

      <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="panel-header"><div><h2>🏆 Quem mais pede</h2><p>Clientes com maior quantidade de pedidos.</p></div></div><Ranking rows={topOrders} value={(row) => `${row.orders} pedido(s)`} moneyValue={(row) => money(row.spent)} empty="Ainda não há clientes suficientes." /></section>
        <section className="analytics-panel"><div className="panel-header"><div><h2>💰 Quem mais gasta</h2><p>Clientes que mais geraram faturamento.</p></div></div><Ranking rows={topSpenders} value={(row) => money(row.spent)} moneyValue={(row) => `${row.orders} pedido(s)`} empty="Ainda não há clientes suficientes." /></section>
      </div>

      <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="panel-header"><div><h2>📍 Bairros que mais compram</h2><p>Ajuda a decidir onde concentrar divulgação e promoções.</p></div></div><SimpleRanking rows={neighborhoods.slice(0, 8)} primary={(row) => row.name} secondary={(row) => `${row.orders} pedidos • ${money(row.spent)}`} /></section>
        <section className="analytics-panel"><div className="panel-header"><div><h2>🥤 Produtos mais pedidos</h2><p>Mostra o que realmente movimenta o cardápio.</p></div></div><SimpleRanking rows={topProducts.slice(0, 8)} primary={(row) => row.name} secondary={(row) => `${row.quantity} unidades • ${money(row.revenue)}`} /></section>
      </div>

      <section className="analytics-panel"><div className="panel-header"><div><h2><IoAnalyticsOutline /> Indicadores para tomar decisão</h2><p>Use estes números para identificar oportunidades da loja.</p></div></div><div className="analytics-insights"><Insight title="Clientes recorrentes" value={`${customers.length ? Math.round((repeatCustomers / customers.length) * 100) : 0}%`} text="da sua base fez mais de um pedido no período." /><Insight title="Bairro líder" value={neighborhoods[0]?.name || '—'} text={neighborhoods[0] ? `${neighborhoods[0].orders} pedidos registrados.` : 'Ainda sem dados.'} /><Insight title="Produto líder" value={topProducts[0]?.name || '—'} text={topProducts[0] ? `${topProducts[0].quantity} unidades pedidas.` : 'Ainda sem dados.'} /><Insight title="Clientes sem localização" value={`${customers.length - mappedCustomers.length}`} text="precisam de localização para aparecer no mapa." /></div></section>
    </div>
  )
}

function Ranking({ rows, value, moneyValue, empty }) {
  if (!rows.length) return <div className="empty-state">{empty}</div>
  return <div className="analytics-ranking">{rows.slice(0, 10).map((row, index) => <div className="analytics-ranking-row" key={row.key}><span className="rank-number">{index + 1}</span><div className="rank-main"><strong>{row.name}</strong><small>{row.phone || 'Cliente identificado pelo cadastro'}</small></div><div className="rank-value"><strong>{value(row)}</strong><small>{moneyValue(row)}</small></div></div>)}</div>
}

function SimpleRanking({ rows, primary, secondary }) {
  if (!rows.length) return <div className="empty-state">Ainda não há dados.</div>
  return <div className="analytics-ranking">{rows.map((row, index) => <div className="analytics-ranking-row" key={`${primary(row)}-${index}`}><span className="rank-number">{index + 1}</span><div className="rank-main"><strong>{primary(row)}</strong><small>{secondary(row)}</small></div></div>)}</div>
}

function Insight({ title, value, text }) {
  return <div className="analytics-insight"><span>{title}</span><strong>{value}</strong><small>{text}</small></div>
}
