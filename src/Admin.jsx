import { useEffect, useMemo, useState } from 'react'
import logo from './assets/logo.png'
import {
  IoAdd,
  IoCheckmarkCircleOutline,
  IoCreateOutline,
  IoGridOutline,
  IoListOutline,
  IoLogOutOutline,
  IoNotificationsOutline,
  IoOptionsOutline,
  IoSearch,
  IoTrashOutline,
  IoClose,
  IoCashOutline,
  IoStorefrontOutline,
} from 'react-icons/io5'
import AddressMapPicker from './AddressMapPicker'
import {
  loadAddonGroups,
  loadOrders,
  loadProducts,
  loadSettings,
  saveAddonGroups,
  saveOrders,
  saveProducts,
  saveSettings,
  loadSettingsFromFirebase,
} from './data'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function normalizeWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function formatOrderAddress(order) {
  // Os pedidos atuais salvam o endereço diretamente em order.customer.
  // Alguns pedidos antigos podem ter customer.address como objeto/string.
  const customer = order?.customer || {}
  const address = customer?.address
  if (typeof address === 'string' && address.trim()) return address.trim()

  const source = address && typeof address === 'object' ? address : customer
  if (!source || typeof source !== 'object') return ''

  return [
    source.street,
    source.number,
    source.complement,
    source.neighborhood,
    source.city && source.state ? `${source.city}/${source.state}` : (source.city || source.state),
    source.cep ? `CEP ${source.cep}` : ''
  ].filter(Boolean).join(', ')
}

function buildGoogleMapsLink(order) {
  const location = order?.customer?.location || order?.location
  const lat = Number(location?.latitude)
  const lng = Number(location?.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }

  const address = formatOrderAddress(order)
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }
  return ''
}

function sendOrderWhatsapp(order, action) {
  const phone = normalizeWhatsapp(order?.customer?.phone)
  if (!phone) return

  const number = order?.orderNumber || order?.id || ''
  const items = (order?.items || []).map((item) => {
    const addons = item?.addons?.length ? `\n   Acompanhamentos: ${item.addons.join(', ')}` : ''
    return `${item.quantity}x ${item.name}${addons}`
  })

  const paymentLabels = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    credito: 'Crédito (maquineta)',
    debito: 'Débito (maquineta)'
  }

  const isPix = order?.paymentMethod === 'pix'

  let lines
  if (action === 'accept') {
    lines = [
      `Olá, ${order?.customer?.name || 'cliente'}!`,
      'Seu pedido foi recebido e já está sendo preparado. 💜',
      '',
      'Pedido:',
      ...items,
      '',
      `Total: ${money(order?.total)}`,
      `Pagamento: ${paymentLabels[order?.paymentMethod] || 'Não informado'}`,
      `Entrega ou retirada: ${order?.fulfillmentType === 'retirada' ? 'Retirada na loja' : 'Entrega'}`,
      ...(isPix
        ? [
            '',
            'Pagamento via PIX:',
            `Chave PIX: ${order?.payment?.pixKey || 'Não informada'}`,
            `${order?.payment?.pixName || 'Titular não informado'} • ${order?.payment?.pixBank || 'Banco não informado'}`,
            '⚠️ Após o pagamento, envie o comprovante pelo WhatsApp.'
          ]
        : [])
    ]
  } else if (action === 'ready') {
    lines = order?.fulfillmentType === 'retirada'
      ? [
          `Olá, ${order?.customer?.name || 'cliente'}!`,
          'Seu pedido está pronto para retirada. 💜',
          '',
          'Já pode vir buscar seu pedido na loja. Muito obrigada pela preferência! ☺️'
        ]
      : [
          `Olá, ${order?.customer?.name || 'cliente'}!`,
          'Seu pedido está em rota de entrega e, em breve, chegará até você. 💜',
          '',
          'Muito obrigada pela preferência! ☺️'
        ]
  } else {
    lines = [
      'Agradecemos muito pela preferência! 💜',
      'Esperamos que você tenha gostado do seu Açaí do Vale. 🥤',
      'Esperamos te encontrar novamente em breve! 💜'
    ]
  }

  // No Android, direciona explicitamente para o pacote do WhatsApp Business.
  // Assim, as mensagens enviadas pelo painel saem pela conta comercial da loja.
  const text = encodeURIComponent(lines.join('\n'))
  const businessIntent = `intent://send?phone=${phone}&text=${text}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`
  window.location.href = businessIntent
}

function sendMotoboyWhatsapp(order) {
  const address = formatOrderAddress(order) || 'Endereço não informado'
  const mapLink = buildGoogleMapsLink(order)
  const paymentLabels = {
    pix: 'PIX — PEDIDO PAGO',
    dinheiro: 'Dinheiro',
    credito: 'Crédito (maquineta)',
    debito: 'Débito (maquineta)'
  }
  const lines = [
    '🛵 NOVA ENTREGA — AÇAÍ DO VALE',
    '',
    `Cliente: ${order?.customer?.name || 'Não informado'}`,
    `Contato: ${order?.customer?.phone || 'Não informado'}`,
    
    order?.paymentMethod !== 'pix' ? `Valor do pedido: ${money(order?.total)}` : '',
    `Forma de pagamento: ${paymentLabels[order?.paymentMethod] || 'Não informado'}`,
    '',
     `Endereço: ${address}`,
    mapLink ? `📍 Localização no Google Maps: ${mapLink}` : '',
    '',
    'Por favor, realize a entrega. Obrigada! 💜'
  ].filter(Boolean)

  // Abre a tela de compartilhamento/conversa do WhatsApp Business no Android.
  const text = encodeURIComponent(lines.join('\n'))
  const businessIntent = `intent://send?text=${text}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`
  window.location.href = businessIntent
}

function playAlert() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    oscillator.type = 'sine'
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    setTimeout(() => { oscillator.frequency.value = 660 }, 180)
    setTimeout(() => { oscillator.stop(); context.close() }, 380)
  } catch {
    // O navegador pode bloquear áudio até uma interação do usuário.
  }
}

function Admin() {
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem('acai_admin') === '1')
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [products, setProducts] = useState(loadProducts)
  const [groups, setGroups] = useState(loadAddonGroups)
  const [orders, setOrders] = useState(loadOrders)
  const [settings, setSettings] = useState(loadSettings)
  const [storeForm, setStoreForm] = useState(() => loadSettings().store)
  const [paymentForm, setPaymentForm] = useState(() => loadSettings().payment)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [productEditing, setProductEditing] = useState(null)
  const [groupEditing, setGroupEditing] = useState(null)
  const [itemEditing, setItemEditing] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    loadSettingsFromFirebase().then((remote) => {
      if (cancelled || !remote) return
      setSettings(remote)
      setStoreForm(remote.store)
      setPaymentForm(remote.payment)
    })
    return () => { cancelled = true }
  }, [loggedIn])

  const newOrders = orders.filter((order) => order.status === 'novo')
  const inProgress = orders.filter((order) => ['andamento', 'pronto'].includes(order.status))
  const finished = orders.filter((order) => order.status === 'finalizado')
  const activeProducts = products.filter((product) => product.active).length

  useEffect(() => {
    if (!loggedIn) return undefined
    const refresh = () => setOrders(loadOrders())
    window.addEventListener('orders-updated', refresh)
    const interval = setInterval(() => {
      const latest = loadOrders()
      setOrders((current) => {
        if (latest.length > current.length || latest.some((order) => order.status !== current.find((old) => old.id === order.id)?.status)) {
          if (latest.some((order) => order.status === 'novo' && !current.some((old) => old.id === order.id))) playAlert()
          return latest
        }
        return current
      })
    }, 1200)
    return () => { window.removeEventListener('orders-updated', refresh); clearInterval(interval) }
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn || newOrders.length === 0) return undefined
    const interval = setInterval(playAlert, 3000)
    return () => clearInterval(interval)
  }, [loggedIn, newOrders.length])

  async function lookupStoreCep(event) {
    const cep = event.target.value.replace(/\D/g, '').slice(0, 8)
    const formattedCep = cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep

    setStoreForm((current) => ({
      ...current,
      cep: formattedCep,
      ...(cep.length !== 8 ? { latitude: null, longitude: null, manual: false } : {})
    }))

    if (cep.length !== 8) return

    try {
      let data = null
      let lastError = null

      // ViaCEP é a primeira opção. Se estiver indisponível no navegador,
      // usa a BrasilAPI como segunda fonte gratuita.
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          headers: { Accept: 'application/json' }
        })
        if (!response.ok) throw new Error('ViaCEP indisponível.')
        const result = await response.json()
        if (result?.erro) throw new Error('CEP não encontrado.')
        data = {
          street: result.logradouro,
          neighborhood: result.bairro,
          city: result.localidade,
          state: result.uf,
          complement: result.complemento
        }
      } catch (error) {
        lastError = error
      }

      if (!data) {
        try {
          const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
            headers: { Accept: 'application/json' }
          })
          if (!response.ok) throw new Error('CEP não encontrado.')
          const result = await response.json()
          data = {
            street: result.street,
            neighborhood: result.neighborhood,
            city: result.city,
            state: result.state,
            complement: result.service || ''
          }
        } catch (error) {
          lastError = error
        }
      }

      if (!data) throw lastError || new Error('CEP não encontrado.')

      setStoreForm((current) => ({
        ...current,
        cep: formattedCep,
        street: data.street || '',
        neighborhood: data.neighborhood || '',
        city: data.city || '',
        state: String(data.state || '').toUpperCase(),
        complement: current.complement || data.complement || '',
        latitude: null,
        longitude: null,
        manual: false
      }))

      flash('CEP localizado. Rua, bairro, cidade e UF preenchidos automaticamente.')
    } catch (error) {
      flash(error.message || 'Não foi possível localizar o CEP. Confira os números digitados.')
    }
  }

  function login(event) {
    event.preventDefault()
    if (password !== ADMIN_PASSWORD) { setMessage('Senha incorreta.'); return }
    sessionStorage.setItem('acai_admin', '1')
    setLoggedIn(true)
    setPassword('')
    setMessage('')
  }

  function logout() {
    sessionStorage.removeItem('acai_admin')
    setLoggedIn(false)
  }

  function flash(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }

  function persistProducts(next, text) { setProducts(next); saveProducts(next); flash(text) }
  function persistGroups(next, text) { setGroups(next); saveAddonGroups(next); flash(text) }

  function submitProduct(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = {
      id: productEditing?.id || crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      description: String(form.get('description')).trim(),
      price: Number(form.get('price')) || 0,
      active: form.get('active') === 'on',
    }
    const next = productEditing?.id ? products.map((item) => item.id === productEditing.id ? product : item) : [...products, product]
    persistProducts(next, productEditing?.id ? 'Produto atualizado.' : 'Produto cadastrado.')
    setProductEditing(null)
  }

  function submitGroup(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const multiple = form.get('multiple') === 'on'
    const group = {
      id: groupEditing?.id || crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      optional: form.get('optional') === 'on',
      multiple,
      maxSelections: multiple ? Number(form.get('maxSelections')) || 0 : 1,
      items: groupEditing?.items || [],
    }
    const next = groupEditing?.id ? groups.map((item) => item.id === groupEditing.id ? group : item) : [...groups, group]
    persistGroups(next, groupEditing?.id ? 'Grupo atualizado.' : 'Grupo criado.')
    setGroupEditing(null)
  }

  function submitItem(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const item = {
      id: itemEditing.item?.id || crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      price: Number(form.get('price')) || 0,
      active: form.get('active') === 'on',
    }
    const next = groups.map((group) => group.id === itemEditing.groupId
      ? { ...group, items: itemEditing.item?.id ? group.items.map((old) => old.id === item.id ? item : old) : [...group.items, item] }
      : group)
    persistGroups(next, itemEditing.item?.id ? 'Acompanhamento atualizado.' : 'Acompanhamento adicionado.')
    setItemEditing(null)
  }

  function removeGroup(id) {
    if (!window.confirm('Excluir este grupo e todos os seus acompanhamentos?')) return
    persistGroups(groups.filter((group) => group.id !== id), 'Grupo excluído.')
  }

  function removeItem(groupId, itemId) {
    if (!window.confirm('Excluir este acompanhamento?')) return
    persistGroups(groups.map((group) => group.id === groupId ? { ...group, items: group.items.filter((item) => item.id !== itemId) } : group), 'Acompanhamento excluído.')
  }

  function updateOrder(id, status, extra = {}) {
    const target = orders.find((order) => order.id === id)
    const next = orders.map((order) => order.id === id ? { ...order, status, ...extra, updatedAt: new Date().toISOString() } : order)
    setOrders(next)
    saveOrders(next)

    if (target && status === 'andamento') {
      sendOrderWhatsapp({ ...target, status }, 'accept')
    }

    if (target && status === 'pronto') {
      sendOrderWhatsapp({ ...target, status }, 'ready')
    }


    flash(
      status === 'andamento'
        ? 'Pedido aceito e mensagem enviada pelo WhatsApp.'
        : status === 'pronto'
          ? 'Cliente avisado que o pedido está pronto.'
          : status === 'finalizado'
            ? 'Pedido finalizado.'
            : 'Pedido atualizado.'
    )
  }

  function rejectOrder(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const reason = String(form.get('reason')).trim()
    if (!reason) return
    updateOrder(rejecting.id, 'recusado', { rejectionReason: reason })
    setRejecting(null)
  }

  function clearFinished() {
    if (!window.confirm('Excluir do painel os pedidos finalizados e recusados?')) return
    const next = orders.filter((order) => !['finalizado', 'recusado'].includes(order.status))
    setOrders(next)
    saveOrders(next)
    flash('Histórico limpo.')
  }

  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase())), [products, search])
  const filteredGroups = useMemo(() => groups.filter((group) => `${group.name} ${group.items.map((item) => item.name).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [groups, search])

  if (!loggedIn) {
    return (
      <main className="admin-login">
        <div className="admin-login-card">
          <div className="admin-login-card-img">
          <img src={logo} alt="Açaí do Vale" />
          </div>
          <span className="admin-badge">ADMINISTRATIVO</span>
          <h1>Área administrativa</h1>
          <p>Entre para gerenciar pedidos e cardápio.</p>
          <form onSubmit={login} className="admin-form">
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" required />
            {message && <div className="form-error" role="alert">{message}</div>}
            <button className="btn-default admin-submit" type="submit">Entrar</button>
          </form>
          <a href="/" className="back-link">Voltar para o site</a>
        </div>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <img src={logo} alt="Açaí do Vale" />
        <span className="admin-badge">ADMINISTRATIVO</span>
        <nav>
          <button className={activeTab === 'dashboard' ? 'is-active' : ''} onClick={() => setActiveTab('dashboard')}><IoGridOutline /> Dashboard</button>
          <button className={activeTab === 'operacao' ? 'is-active' : ''} onClick={() => setActiveTab('operacao')}><IoNotificationsOutline /> Operação {newOrders.length > 0 && <b>{newOrders.length}</b>}</button>
          <button className={activeTab === 'cardapio' ? 'is-active' : ''} onClick={() => setActiveTab('cardapio')}><IoListOutline /> Cardápio</button>
          <button className={activeTab === 'taxa' ? 'is-active' : ''} onClick={() => setActiveTab('taxa')}><IoCashOutline /> Taxa e tempo</button>
          <button className={activeTab === 'loja' ? 'is-active' : ''} onClick={() => setActiveTab('loja')}><IoStorefrontOutline /> Dados da loja</button>
        </nav>
        <a className="sidebar-site" href="/">Ver site</a>
        <button className="sidebar-logout" type="button" onClick={logout}><IoLogOutOutline /> Sair</button>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div><span>Gestão • Açaí do Vale</span><h1>{activeTab === 'dashboard' ? 'Visão geral' : activeTab === 'operacao' ? 'Operação de pedidos' : activeTab === 'cardapio' ? 'Cardápio' : activeTab === 'taxa' ? 'Taxa e tempo' : 'Dados da loja'}</h1></div>
          <div className="topbar-actions"><a className="btn-default" href="/">Ver site</a>{newOrders.length > 0 && <span className="new-order-pill"><IoNotificationsOutline /> {newOrders.length} pedido(s) novo(s)</span>}</div>
        </header>

        {message && <div className="success-message" role="status">{message}</div>}

        {activeTab === 'dashboard' && (
          <>
            <div className="admin-stats">
              <div className="stat-card"><span>Pedidos novos</span><strong>{newOrders.length}</strong><small>Aguardando sua decisão</small></div>
              <div className="stat-card"><span>Em andamento</span><strong>{inProgress.length}</strong><small>Pedidos aceitos</small></div>
              <div className="stat-card"><span>Finalizados</span><strong>{finished.length}</strong><small>Concluídos</small></div>
              <div className="stat-card"><span>Produtos ativos</span><strong>{activeProducts}</strong><small>Visíveis no site</small></div>
            </div>
            <section className="admin-panel dashboard-panel">
              <div className="panel-header"><div><h2>Pedidos recentes</h2><p>Os pedidos novos ficam aqui até você aceitar ou recusar.</p></div><button className="btn-default" onClick={() => setActiveTab('operacao')}>Abrir operação</button></div>
              <OrderColumns orders={orders.slice(0, 5)} onAccept={(id) => updateOrder(id, 'andamento')} onFinish={(id) => updateOrder(id, 'finalizado')} onReady={(id) => updateOrder(id, 'pronto')} onMotoboy={sendMotoboyWhatsapp} onReject={(order) => setRejecting(order)} />
            </section>
          </>
        )}

        {activeTab === 'operacao' && (
          <section className="admin-panel">
            <div className="panel-header"><div><h2>Pedidos</h2><p>Pedido novo apita até você aceitar ou recusar.</p></div><button className="secondary-button" onClick={clearFinished}>Limpar finalizados/recusados</button></div>
            <div className="operation-board">
              <OrderColumn title="Pedido novo" status="novo" orders={orders} onAccept={(id) => updateOrder(id, 'andamento')} onFinish={(id) => updateOrder(id, 'finalizado')} onReady={(id) => updateOrder(id, 'pronto')} onMotoboy={sendMotoboyWhatsapp} onReject={(order) => setRejecting(order)} />
              <OrderColumn title="Em andamento" status="andamento" orders={orders} onAccept={(id) => updateOrder(id, 'andamento')} onFinish={(id) => updateOrder(id, 'finalizado')} onReady={(id) => updateOrder(id, 'pronto')} onMotoboy={sendMotoboyWhatsapp} onReject={(order) => setRejecting(order)} />
              <OrderColumn title="Pedido pronto" status="pronto" orders={orders} onAccept={(id) => updateOrder(id, 'andamento')} onFinish={(id) => updateOrder(id, 'finalizado')} onReady={(id) => updateOrder(id, 'pronto')} onMotoboy={sendMotoboyWhatsapp} onReject={(order) => setRejecting(order)} />
              <OrderColumn title="Finalizado" status="finalizado" orders={orders} onAccept={(id) => updateOrder(id, 'andamento')} onFinish={(id) => updateOrder(id, 'finalizado')} onReady={(id) => updateOrder(id, 'pronto')} onMotoboy={sendMotoboyWhatsapp} onReject={(order) => setRejecting(order)} />
            </div>
            {orders.some((order) => order.status === 'recusado') && <div className="rejected-list"><h3>Recusados</h3>{orders.filter((order) => order.status === 'recusado').map((order) => <div key={order.id}><strong>{order.id} • {order.customer.name}</strong><span>{order.rejectionReason}</span></div>)}</div>}
          </section>
        )}

        {activeTab === 'cardapio' && (
          <section className="admin-panel">
            <div className="panel-header"><div><h2>Copos</h2><p>Edite tamanho, preço, descrição e disponibilidade.</p></div><button className="btn-default" onClick={() => setProductEditing({ name: '', description: '', price: '', active: true })}><IoAdd /> Novo copo</button></div>
            <div className="admin-toolbar"><div className="search-box"><IoSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar copo..." /></div></div>
            <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Produto</th><th>Descrição</th><th>Preço</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.description}</td><td>{money(product.price)}</td><td><span className={`status ${product.active ? 'active' : 'inactive'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td><td className="table-actions"><button onClick={() => setProductEditing(product)} aria-label="Editar"><IoCreateOutline /></button><button onClick={() => { if (window.confirm('Excluir este copo?')) persistProducts(products.filter((item) => item.id !== product.id), 'Copo excluído.') }} aria-label="Excluir"><IoTrashOutline /></button></td></tr>)}</tbody></table>{!filteredProducts.length && <div className="empty-state">Nenhum copo encontrado.</div>}</div>
            <div className="cardapio-addon-section">
              <div className="panel-header"><div><h2>Acompanhamentos</h2><p>Configure grupos, limites de escolha e itens que aparecem no montador do pedido.</p></div><button className="btn-default" onClick={() => setGroupEditing({ name: '', optional: true, multiple: true, maxSelections: 0, items: [] })}><IoAdd /> Novo grupo</button></div>
              <div className="addon-admin-grid">
                {filteredGroups.map((group) => (
                  <article className="addon-admin-card" key={group.id}>
                    <div className="addon-admin-header"><div><span className="admin-badge">{group.optional ? 'OPCIONAL' : 'OBRIGATÓRIO'}</span><h3>{group.name}</h3><p>{group.multiple ? (group.maxSelections ? `Cliente pode escolher até ${group.maxSelections}` : 'Cliente pode escolher mais de um') : 'Cliente pode escolher apenas 1'}</p></div><div className="table-actions"><button onClick={() => setGroupEditing(group)} aria-label="Editar grupo"><IoCreateOutline /></button><button onClick={() => removeGroup(group.id)} aria-label="Excluir grupo"><IoTrashOutline /></button></div></div>
                    <div className="addon-admin-items">{group.items.map((item) => <div className="addon-admin-item" key={item.id}><div><strong>{item.name}</strong><small>{item.price ? money(item.price) : 'Grátis'} • {item.active === false ? 'Oculto' : 'Ativo'}</small></div><div className="table-actions"><button onClick={() => setItemEditing({ groupId: group.id, item })} aria-label="Editar acompanhamento"><IoCreateOutline /></button><button onClick={() => removeItem(group.id, item.id)} aria-label="Excluir acompanhamento"><IoTrashOutline /></button></div></div>)}{!group.items.length && <div className="empty-state">Nenhum item cadastrado.</div>}</div>
                    <button className="add-item-button" onClick={() => setItemEditing({ groupId: group.id, item: null })}><IoAdd /> Adicionar acompanhamento</button>
                  </article>
                ))}
              </div>
              <div className="admin-settings-card"><h3>Colher</h3><p>Defina se o cliente poderá escolher receber colher no pedido.</p><label className="checkbox-label"><input type="checkbox" checked={settings.spoonEnabled} onChange={(event) => { const next = { ...settings, spoonEnabled: event.target.checked }; setSettings(next); saveSettings(next); flash('Configuração de colher salva.') }} /> Permitir escolha de colher</label><label>Preço da colher<input type="number" min="0" step="0.01" value={settings.spoonPrice} onChange={(event) => { const next = { ...settings, spoonPrice: Number(event.target.value) || 0 }; setSettings(next); saveSettings(next) }} /></label></div>
            </div>
          </section>
        )}

        {activeTab === 'taxa' && (
          <section className="admin-panel">
            <div className="panel-header"><div><h2>Taxa e tempo</h2><p>Configure quanto cobrar conforme a distância do cliente.</p></div></div>
            <div className="delivery-admin-list">
              {(settings.deliveryBands || []).map((band, index) => <div className="delivery-admin-row" key={band.id || index}>
                <label>Até (km)<input type="number" min="0.1" step="0.1" value={band.maxKm} onChange={(e) => { const bands = [...settings.deliveryBands]; bands[index] = { ...band, maxKm: Number(e.target.value) || 0 }; const next = { ...settings, deliveryBands: bands }; setSettings(next); saveSettings(next) }} /></label>
                <label>Taxa<input type="number" min="0" step="0.01" value={band.fee} onChange={(e) => { const bands = [...settings.deliveryBands]; bands[index] = { ...band, fee: Number(e.target.value) || 0 }; const next = { ...settings, deliveryBands: bands }; setSettings(next); saveSettings(next) }} /></label>
                <label>Tempo (min)<input type="number" min="1" step="1" value={band.minutes} onChange={(e) => { const bands = [...settings.deliveryBands]; bands[index] = { ...band, minutes: Number(e.target.value) || 1 }; const next = { ...settings, deliveryBands: bands }; setSettings(next); saveSettings(next) }} /></label>
                <button className="reject-button" type="button" onClick={() => { const next = { ...settings, deliveryBands: settings.deliveryBands.filter((_, i) => i !== index) }; setSettings(next); saveSettings(next) }}>Excluir</button>
              </div>)}
            </div>
            <button className="btn-default" type="button" onClick={() => { const next = { ...settings, deliveryBands: [...(settings.deliveryBands || []), { id: crypto.randomUUID(), maxKm: 12, fee: 12, minutes: 60 }] }; setSettings(next); saveSettings(next) }}>+ Adicionar faixa</button>
            <p className="modal-note">Se a taxa da faixa for R$ 0,00, o cliente verá <strong>Taxa grátis!</strong>.</p>

            <div className="store-location-summary">
              <div className="store-location-summary-icon"><IoStorefrontOutline /></div>
              <div>
                <strong>Local da loja</strong>
                <p>
                  {settings?.store?.street || 'Rua não informada'}
                  {settings?.store?.number ? `, ${settings.store.number}` : ''}
                  {settings?.store?.neighborhood ? ` • ${settings.store.neighborhood}` : ''}
                  {settings?.store?.city ? ` • ${settings.store.city}` : ''}
                  {settings?.store?.state ? `/${settings.store.state}` : ''}
                </p>
                {settings?.store?.cep && <small>CEP: {settings.store.cep}</small>}
              </div>
            </div>

          </section>
        )}

        {activeTab === 'loja' && (
          <section className="admin-panel">
            <div className="panel-header"><div><h2>Dados da loja</h2><p>O mapa localiza automaticamente a loja e permite ajustar o ponto exato.</p></div></div>
            <form className="admin-form" onSubmit={async (e) => { e.preventDefault(); const lat = Number(storeForm.latitude); const lng = Number(storeForm.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 0.000001 || Math.abs(lng) < 0.000001) { flash('Não foi possível salvar: o endereço da loja ainda não foi localizado no mapa. Confira rua, número, bairro, cidade e UF e aguarde a localização aparecer.'); return; } const next = { ...settings, store: { ...settings.store, ...storeForm }, payment: { ...settings.payment, ...paymentForm } }; setSettings(next); setStoreForm(next.store); setPaymentForm(next.payment); const saved = await saveSettings(next); flash(saved === false ? 'Dados salvos localmente, mas não foi possível sincronizar com o Firebase.' : 'Dados da loja e pagamento salvos.'); }}>
              <label>Nome da loja<input value={storeForm.name || ''} onChange={(e) => setStoreForm(v => ({ ...v, name: e.target.value }))} /></label>
              <div className="panel-subsection">
                <div className="panel-header"><div><h3>Dados de pagamento</h3><p>Esses dados serão usados quando o cliente escolher PIX e também nas mensagens enviadas pelo WhatsApp.</p></div></div>
                <div className="customer-grid">
                  <label>Chave PIX<input value={paymentForm?.pixKey || ''} onChange={(e) => setPaymentForm(v => ({ ...v, pixKey: e.target.value }))} placeholder="Digite a chave PIX" /></label>
                  <label>Nome completo<input value={paymentForm?.pixName || ''} onChange={(e) => setPaymentForm(v => ({ ...v, pixName: e.target.value }))} placeholder="Nome do titular" /></label>
                </div>
                <label>Banco / instituição<input value={paymentForm?.pixBank || ''} onChange={(e) => setPaymentForm(v => ({ ...v, pixBank: e.target.value }))} placeholder="Ex.: Mercado Pago" /></label>
              </div>
              <div className="customer-grid"><label>CEP<input value={storeForm.cep || ''} placeholder="00000-000" inputMode="numeric" maxLength="9" onChange={lookupStoreCep} /></label><label>Número<input value={storeForm.number || ''} onChange={(e) => setStoreForm(v => ({ ...v, number: e.target.value, latitude: null, longitude: null, manual: false }))} required /></label></div>
              <label>Rua<input value={storeForm.street || ''} readOnly required /></label>
              <div className="customer-grid"><label>Bairro<input value={storeForm.neighborhood || ''} readOnly required /></label><label>Complemento<input value={storeForm.complement || ''} onChange={(e) => setStoreForm(v => ({ ...v, complement: e.target.value }))} /></label></div>
              <div className="customer-grid"><label>Cidade<input value={storeForm.city || ''} readOnly required /></label><label>UF<input value={storeForm.state || ''} readOnly maxLength="2" required /></label></div>
              <AddressMapPicker
                address={storeForm}
                cep={storeForm.cep}
                latitude={storeForm.latitude}
                longitude={storeForm.longitude}
                onChange={(location) => setStoreForm((current) => ({
                  ...current,
                  ...location,
                  ...(location.address
                    ? {
                        street: location.address.street || current.street,
                        neighborhood: location.address.neighborhood || current.neighborhood,
                        city: location.address.city || current.city,
                        state: location.address.state || current.state,
                        cep: location.address.cep || current.cep,
                      }
                    : {})
                }))}
                title="Localização exata da loja"
              />
              <FormActions onCancel={() => { setStoreForm(settings.store); setPaymentForm(settings.payment) }} submitText="Salvar dados da loja" />
            </form>
          </section>
        )}

      </section>

      {productEditing && <Modal title={productEditing.id ? 'Editar copo' : 'Novo copo'} onClose={() => setProductEditing(null)}><form className="admin-form" onSubmit={submitProduct}><label>Nome<input name="name" defaultValue={productEditing.name} required /></label><label>Descrição<textarea name="description" defaultValue={productEditing.description} rows="3" /></label><label>Preço<input name="price" type="number" min="0" step="0.01" defaultValue={productEditing.price} required /></label><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={productEditing.active} /> Exibir no site</label><FormActions onCancel={() => setProductEditing(null)} /></form></Modal>}
      {groupEditing && <Modal title={groupEditing.id ? 'Editar grupo' : 'Novo grupo'} onClose={() => setGroupEditing(null)}><form className="admin-form" onSubmit={submitGroup}><label>Nome do grupo<input name="name" defaultValue={groupEditing.name} placeholder="Ex.: Coberturas" required /></label><label className="checkbox-label"><input name="optional" type="checkbox" defaultChecked={groupEditing.optional} /> Cliente pode não escolher nada</label><label className="checkbox-label"><input name="multiple" type="checkbox" defaultChecked={groupEditing.multiple} /> Cliente pode escolher mais de 1</label><label>Máximo de escolhas <small>(0 = sem limite)</small><input name="maxSelections" type="number" min="0" defaultValue={groupEditing.maxSelections || 0} /></label><FormActions onCancel={() => setGroupEditing(null)} /></form></Modal>}
      {itemEditing && <Modal title={itemEditing.item ? 'Editar acompanhamento' : 'Novo acompanhamento'} onClose={() => setItemEditing(null)}><form className="admin-form" onSubmit={submitItem}><label>Nome<input name="name" defaultValue={itemEditing.item?.name || ''} required /></label><label>Preço<input name="price" type="number" min="0" step="0.01" defaultValue={itemEditing.item?.price || 0} required /></label><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={itemEditing.item?.active !== false} /> Exibir para o cliente</label><FormActions onCancel={() => setItemEditing(null)} /></form></Modal>}
      {rejecting && <Modal title={`Recusar ${rejecting.id}`} onClose={() => setRejecting(null)}><form className="admin-form" onSubmit={rejectOrder}><p className="modal-note">Informe ao cliente o motivo da recusa. O motivo fica registrado no pedido.</p><label>Justificativa<textarea name="reason" rows="4" placeholder="Ex.: item indisponível no momento..." required /></label><FormActions onCancel={() => setRejecting(null)} submitText="Recusar pedido" /></form></Modal>}
    </main>
  )
}

function FormActions({ onCancel, submitText = 'Salvar' }) {
  return <div className="modal-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="btn-default" type="submit">{submitText}</button></div>
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true"><div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fechar"><IoClose /></button></div>{children}</section></div>
}

function OrderCard({ order, onAccept, onFinish, onReady, onMotoboy, onReject }) {
  const statusLabel = {
    novo: 'Novo',
    andamento: 'Em andamento',
    pronto: 'Pedido pronto',
    finalizado: 'Finalizado',
    recusado: 'Recusado'
  }[order.status] || order.status

  return (
    <article className="order-card">
      <div className="order-card-head">
        <div><strong>{order.orderNumber || order.id}</strong><small>{formatDate(order.createdAt)}</small></div>
        <span className={`status status-${order.status}`}>{statusLabel}</span>
      </div>
      <h4>{order.customer?.name}</h4>
      <p>{order.customer?.phone}{order.customer?.address ? ` • ${order.customer.address}` : ''}</p>
      <div className="order-card-body">
        {(order.items || []).map((item, index) => (
          <div key={`${item.name}-${index}`} className="order-card-item">
            <strong>{item.quantity}x {item.name}</strong>
            <span>{item.addons?.length ? `Acompanhamentos: ${item.addons.join(', ')}` : 'Sem acompanhamentos'}</span>
          </div>
        ))}
        <span>Colher: {order.spoon ? 'Sim' : 'Não'}</span>
        <b>{money(order.total)}</b>
      </div>
      {order.rejectionReason && <div className="rejection-note"><strong>Motivo:</strong> {order.rejectionReason}</div>}
      <div className="order-actions">
        {order.status === 'novo' && <>
          <button className="btn-default" onClick={() => onAccept(order.id)}><IoCheckmarkCircleOutline /> Aceitar pedido</button>
          <button className="reject-button" onClick={() => onReject(order)}>Recusar</button>
        </>}
        {order.status === 'andamento' && <>
          <button className="btn-default" onClick={() => onReady(order.id)}>Pedido pronto</button>
        </>}
        {order.status === 'pronto' && <>
          {order.fulfillmentType === 'entrega' && <button className="secondary-button" onClick={() => onMotoboy(order)}>Enviar para motoboy</button>}
          <button className="btn-default" onClick={() => onFinish(order.id)}>Finalizar pedido</button>
        </>}
      </div>
    </article>
  )
}

function OrderColumn({ title, status, orders, ...props }) {
  const items = orders.filter((order) => order.status === status)
  return <div className={`order-column ${status}`}><div className="order-column-title"><h3>{title}</h3><b>{items.length}</b></div>{items.length ? items.map((order) => <OrderCard key={order.id} order={order} {...props} />) : <div className="column-empty">Nenhum pedido aqui.</div>}</div>
}

function OrderColumns({ orders, ...props }) {
  return <div className="recent-orders">{orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} {...props} />) : <div className="empty-state">Ainda não há pedidos.</div>}</div>
}

export default Admin
