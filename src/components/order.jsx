import { useEffect, useMemo, useState } from 'react'
import {
  IoCheckmarkCircle,
  IoChevronDown,
  IoChevronUp,
  IoClose,
  IoAdd,
  IoRemove,
  IoCartOutline
} from 'react-icons/io5'
import { loadAddonGroups, loadProducts, loadSettings, loadSettingsFromFirebase, addOrder, getStoreHoursStatus, loadProductsFromFirebase, loadAddonGroupsFromFirebase } from '../data'
import { useCart } from '../cart'
import AddressMapPicker from '../AddressMapPicker'
import { geocodeAddress, routeDistance } from '../location'
import {
  loadSavedCustomer,
  saveCustomer,
  saveOrderToFirebase
} from '../customer'
import heroImage from '../assets/fundo-acai-site.webp'

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
}

function storeAddressText(store = {}) {
  return [
    store.street,
    store.number,
    store.complement,
    store.neighborhood,
    store.city && store.state ? `${store.city}/${store.state}` : '',
    store.cep ? `CEP ${formatCep(store.cep)}` : ''
  ].filter(Boolean).join(', ')
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8)
}

function formatCep(value) {
  const d = onlyDigits(value)
  return d.length > 5
    ? `${d.slice(0, 5)}-${d.slice(5)}`
    : d
}

function findDeliveryBand(km, bands) {
  const validBands = [...(bands || [])]
    .map((band) => ({
      ...band,
      maxKm: Number(band.maxKm)
    }))
    .filter((band) => Number.isFinite(band.maxKm))
    .sort((a, b) => a.maxKm - b.maxKm)

  return (
    validBands.find((band) => km <= band.maxKm) ||
    null
  )
}

export default function Order({
  onClose,
  checkoutOnly = false
}) {
  const {
    items,
    subtotal: cartSubtotal,
    addItem,
    updateQuantity,
    clearCart
  } = useCart()

  const [products, setProducts] = useState(() => loadProducts().filter(p => p.active))
  const [groups, setGroups] = useState(() => loadAddonGroups().map(g => ({ ...g, items: g.items.filter(i => i.active !== false) })))
  const [settings, setSettings] = useState(loadSettings)
  const storeStatus = getStoreHoursStatus(settings)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadSettingsFromFirebase(), loadProductsFromFirebase(), loadAddonGroupsFromFirebase()]).then(([remote, remoteProducts, remoteGroups]) => {
      if (cancelled) return
      if (remote) setSettings(remote)
      if (remoteProducts) setProducts(remoteProducts.filter(p => p.active))
      if (remoteGroups) setGroups(remoteGroups.map(g => ({ ...g, items: g.items.filter(i => i.active !== false) })))
    })
    return () => { cancelled = true }
  }, [])

  const [selectedCup, setSelectedCup] = useState(
    products[0]?.id || ''
  )

  const [selectedItems, setSelectedItems] =
    useState([])

  const [spoon, setSpoon] = useState(null)

  const [openGroups, setOpenGroups] =
    useState(() =>
      groups.reduce(
        (acc, group) => ({
          ...acc,
          [group.id]: true
        }),
        {}
      )
    )

  const [customerName, setCustomerName] =
    useState('')

  const [customerPhone, setCustomerPhone] =
    useState('')

  const [paymentMethod, setPaymentMethod] =
    useState('pix')

  const [fulfillmentType, setFulfillmentType] =
    useState('entrega')

  const [cep, setCep] = useState('')

  const [address, setAddress] = useState({
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  })

  const [delivery, setDelivery] =
    useState(null)

  const [customerLocation, setCustomerLocation] = useState({ latitude: null, longitude: null })

  const [cepLoading, setCepLoading] =
    useState(false)

  const [deliveryError, setDeliveryError] =
    useState('')

  const [saving, setSaving] =
    useState(false)

  const [sent, setSent] =
    useState(false)

  const [savedCustomer, setSavedCustomer] =
    useState(false)

  const [customerLoaded, setCustomerLoaded] =
    useState(false)

  /*
   * Carrega automaticamente o cliente associado
   * a este navegador.
   *
   * IMPORTANTE:
   * os valores carregados são usados diretamente
   * para calcular o frete, evitando depender dos
   * estados antes de eles serem atualizados.
   */
  useEffect(() => {
    if (!checkoutOnly) return

    let cancelled = false

    async function loadCustomerData() {
      try {
        const customer = await loadSavedCustomer()

        if (cancelled || !customer) {
          setCustomerLoaded(true)
          return
        }

        const customerAddress = {
          street: customer.address?.street || '',
          number: customer.address?.number || '',
          complement: customer.address?.complement || '',
          neighborhood: customer.address?.neighborhood || '',
          city: customer.address?.city || '',
          state: customer.address?.state || ''
        }

        setCustomerName(customer.name || '')
        setCustomerPhone(customer.phone || '')
        setCep(
          customer.cep
            ? formatCep(customer.cep)
            : ''
        )

        setAddress(customerAddress)
        setCustomerLocation({ latitude: Number(customer.location?.latitude), longitude: Number(customer.location?.longitude) })
        setSavedCustomer(true)
        setCustomerLoaded(true)

        /*
         * Se já temos um endereço completo salvo,
         * recalcula o frete automaticamente.
         */
        const savedCep = onlyDigits(customer.cep)

        if (
          fulfillmentType === 'entrega' &&
          customerAddress.number &&
          customerAddress.street &&
          customerAddress.city &&
          customerAddress.state &&
          savedCep.length === 8
        ) {
          setCepLoading(true)
          setDeliveryError('')

          try {
            const store = settings.store
            const origin = Number.isFinite(Number(store?.latitude)) && Number.isFinite(Number(store?.longitude))
              ? { lat: Number(store.latitude), lon: Number(store.longitude) }
              : await geocodeAddress(store)
            const savedLocation = customer.location || {}
            const destination = Number.isFinite(Number(savedLocation.latitude)) && Number.isFinite(Number(savedLocation.longitude))
              ? { lat: Number(savedLocation.latitude), lon: Number(savedLocation.longitude) }
              : await geocodeAddress(customerAddress)

            const route =
              await routeDistance(
                origin,
                destination
              )

            const band =
              findDeliveryBand(
                route.km,
                settings.deliveryBands || []
              )

            if (!band) {
              throw new Error(
                `Não entregamos nessa distância (${route.km
                  .toFixed(1)
                  .replace('.', ',')} km).`
              )
            }

            if (!cancelled) {
              setDelivery({
                km: route.km,
                fee: Number(band.fee || 0),
                minutes: Number(
                  band.minutes ||
                  route.routeMinutes
                )
              })
            }
          } catch (error) {
            if (!cancelled) {
              setDelivery(null)
              setDeliveryError(
                error.message ||
                'Não foi possível calcular o frete.'
              )
            }
          } finally {
            if (!cancelled) {
              setCepLoading(false)
            }
          }
        }
      } catch (error) {
        console.debug(error)
        if (!cancelled) {
          setCustomerLoaded(true)
        }
      }
    }

    loadCustomerData()

    return () => {
      cancelled = true
    }
  }, [checkoutOnly, fulfillmentType])

  const cup = products.find(
    (p) => p.id === selectedCup
  )

  const selectedAddons = useMemo(
    () =>
      groups
        .flatMap((g) => g.items)
        .filter((i) =>
          selectedItems.includes(i.id)
        ),
    [groups, selectedItems]
  )

  const itemTotal =
    Number(cup?.price || 0) +
    selectedAddons.reduce(
      (sum, item) =>
        sum + Number(item.price || 0),
      0
    ) +
    (spoon === true
      ? Number(settings.spoonPrice || 0)
      : 0)

  const finalTotal =
    cartSubtotal +
    Number(delivery?.fee || 0)

  function toggleItem(group, item) {
    setSelectedItems((current) => {
      if (current.includes(item.id)) {
        return current.filter(
          (id) => id !== item.id
        )
      }

      if (!group.multiple) {
        return [
          ...current.filter(
            (id) =>
              !group.items.some(
                (x) => x.id === id
              )
          ),
          item.id
        ]
      }

      const max = Number(
        group.maxSelections || 0
      )

      const selected =
        current.filter((id) =>
          group.items.some(
            (x) => x.id === id
          )
        )

      if (
        max > 0 &&
        selected.length >= max
      ) {
        return current
      }

      return [...current, item.id]
    })
  }

  function addCurrentToCart(
    openCheckout = false
  ) {
    // Quando a loja está fechada, o cliente pode montar e adicionar ao carrinho,
    // mas nunca pode abrir/finalizar o checkout.
    if (!cup || spoon === null) return
    if (openCheckout && !storeStatus.isOpen) return

    addItem({
      productId: cup.id,
      name: cup.name,

      /*
       * Mantém uma imagem válida do projeto.
       */
      image: heroImage,

      addons: selectedAddons.map(
        (item) => item.name
      ),

      spoon,
      total: itemTotal
    })

    setSelectedItems([])
    setSpoon(null)

    window.dispatchEvent(
      new Event('cart-updated')
    )

    if (openCheckout) {
      setTimeout(() => {
        window.dispatchEvent(
          new Event('open-cart-checkout')
        )
      }, 0)

      onClose?.()
    }
  }

  async function calculateDelivery(
    nextAddress,
    nextCep,
    locationOverride = null
  ) {
    const cleanCep = onlyDigits(nextCep)

    if (
      !nextAddress.number ||
      !nextAddress.street ||
      !nextAddress.city ||
      !nextAddress.state ||
      cleanCep.length !== 8
    ) {
      return
    }

    setCepLoading(true)
    setDeliveryError('')
    setDelivery(null)

    try {
      const store = settings.store
      const origin = Number.isFinite(Number(store?.latitude)) && Number.isFinite(Number(store?.longitude))
        ? { lat: Number(store.latitude), lon: Number(store.longitude) }
        : await geocodeAddress(store)
      const location = locationOverride || customerLocation
      const destination = Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))
        ? { lat: Number(location.latitude), lon: Number(location.longitude) }
        : await geocodeAddress(nextAddress)

      const route =
        await routeDistance(
          origin,
          destination
        )

      const band =
        findDeliveryBand(
          route.km,
          settings.deliveryBands || []
        )

      if (!band) {
        throw new Error(
          `Não entregamos nessa distância (${route.km
            .toFixed(1)
            .replace('.', ',')} km).`
        )
      }

      setDelivery({
        km: route.km,
        fee: Number(band.fee || 0),
        minutes: Number(
          band.minutes ||
          route.routeMinutes
        )
      })
    } catch (error) {
      setDeliveryError(
        error.message ||
        'Não foi possível calcular o frete.'
      )
    } finally {
      setCepLoading(false)
    }
  }

  function selectFulfillment(type) {
    setFulfillmentType(type)
    setDeliveryError('')
    if (type === 'retirada') {
      setDelivery({
        km: 0,
        fee: 0,
        minutes: 0,
        type: 'retirada'
      })
    } else {
      setDelivery(null)
      setCustomerLocation({ latitude: null, longitude: null })
    }
  }

  async function handleCep(e) {
    const raw = onlyDigits(
      e.target.value
    )

    setCep(formatCep(raw))
    setDelivery(null)
    setDeliveryError('')
    setCustomerLocation({ latitude: null, longitude: null })

    /*
     * Ao alterar o CEP, o endereço anterior deixa
     * de ser considerado o endereço atual.
     */
    setSavedCustomer(false)

    if (raw.length !== 8) return

    setCepLoading(true)

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${raw}/json/`
      )

      const data = await response.json()

      if (!response.ok || data.erro) {
        throw new Error(
          'CEP não encontrado.'
        )
      }

      const nextAddress = {
        street: data.logradouro || '',
        number: '',
        complement:
          data.complemento || '',
        neighborhood:
          data.bairro || '',
        city:
          data.localidade || '',
        state:
          data.uf || ''
      }

      setAddress(nextAddress)

      /*
       * O número é apagado porque o CEP mudou.
       */
      setDelivery(null)
    } catch (error) {
      setDeliveryError(
        error.message ||
        'Não foi possível consultar o CEP.'
      )
    } finally {
      setCepLoading(false)
    }
  }

  async function finishOrder() {
    const currentStoreStatus = getStoreHoursStatus(settings)
    if (!currentStoreStatus.isOpen) {
      setDeliveryError(currentStoreStatus.message || 'A loja está fechada e não pode receber pedidos agora.')
      return
    }
    if (
      !items.length ||
      !customerName.trim() ||
      !customerPhone.trim() ||
      !delivery ||
      (fulfillmentType === 'entrega' && (!cep || !address.number))
    ) {
      return
    }

    setSaving(true)
    setDeliveryError('')

    const storeAddress = [
      settings.store?.street,
      settings.store?.number,
      settings.store?.complement,
      settings.store?.neighborhood,
      settings.store?.city && settings.store?.state
        ? `${settings.store.city}/${settings.store.state}`
        : '',
      settings.store?.cep ? `CEP ${formatCep(settings.store.cep)}` : ''
    ].filter(Boolean).join(', ')

    const fullAddress = fulfillmentType === 'retirada'
      ? storeAddress
      : [
          address.street,
          address.number,
          address.complement,
          address.neighborhood,
          `${address.city}/${address.state}`,
          `CEP ${cep}`
        ].filter(Boolean).join(', ')

    try {
      /*
       * Primeiro salva/localiza o cliente.
       *
       * saveCustomer() devolve o ID do cliente.
       * Esse ID será usado explicitamente no pedido.
       */
      const customer = await saveCustomer({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        cep: fulfillmentType === 'retirada'
          ? onlyDigits(settings.store?.cep)
          : onlyDigits(cep),
        address: fulfillmentType === 'retirada'
          ? {
              street: settings.store?.street || '',
              number: settings.store?.number || '',
              complement: settings.store?.complement || '',
              neighborhood: settings.store?.neighborhood || '',
              city: settings.store?.city || '',
              state: settings.store?.state || ''
            }
          : {
              street: address.street,
              number: address.number,
              complement: address.complement,
              neighborhood: address.neighborhood,
              city: address.city,
              state: address.state
            },
        location: fulfillmentType === 'retirada'
          ? {
              latitude: Number(settings.store?.latitude) || null,
              longitude: Number(settings.store?.longitude) || null
            }
          : customerLocation
      })

      if (!customer?.id) {
        throw new Error(
          'Não foi possível identificar o cadastro do cliente.'
        )
      }

      const order = {
        createdAt:
          new Date().toISOString(),

        status: 'novo',

        /*
         * Associação explícita do pedido
         * com o cliente encontrado/salvo.
         */
        clienteId: customer.id,

        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          cep: fulfillmentType === 'retirada'
            ? formatCep(onlyDigits(settings.store?.cep))
            : formatCep(onlyDigits(cep)),
          ...(fulfillmentType === 'retirada'
            ? {
                street: settings.store?.street || '',
                number: settings.store?.number || '',
                complement: settings.store?.complement || '',
                neighborhood: settings.store?.neighborhood || '',
                city: settings.store?.city || '',
                state: settings.store?.state || ''
              }
            : address),
          location: fulfillmentType === 'retirada'
            ? {
                latitude: Number(settings.store?.latitude) || null,
                longitude: Number(settings.store?.longitude) || null
              }
            : customerLocation
        },

        fulfillmentType,
        paymentMethod,
        payment: { ...(settings.payment || {}) },

        items: items.map((item) => ({
          ...item
        })),

        delivery: {
          ...delivery,
          type: fulfillmentType
        },

        subtotal: cartSubtotal,
        total: finalTotal
      }

      const savedOrder = await saveOrderToFirebase(order)

      addOrder(savedOrder)

      const paymentLabel = {
        pix: 'PIX',
        dinheiro: 'Dinheiro',
        credito: 'Crédito (maquineta)',
        debito: 'Débito (maquineta)'
      }[paymentMethod]

      const lines = [
        'Olá, Açaí do Vale! Fiz um pedido no site.',
        `Pedido ${savedOrder.orderNumber || savedOrder.id}`,
        `Cliente: ${customerName.trim()}`,
        `Telefone: ${customerPhone.trim()}`,
        `Entrega ou retirada: ${fulfillmentType === 'retirada' ? 'Retirada' : 'Entrega'}`,
        `Endereço: ${fullAddress}`,
        `Forma de pagamento: ${paymentLabel}`,
        '',
        ...items.map(
          (item) =>
            `${item.quantity}x ${item.name} — ${money(
              item.total
            )}${item.addons?.length ? ` | ${item.addons.join(', ')}` : ''}`
        ),
        fulfillmentType === 'entrega'
          ? `Distância: ${delivery.km.toFixed(1).replace('.', ',')} km`
          : '',
        `Frete: ${fulfillmentType === 'entrega' ? (delivery.fee ? money(delivery.fee) : 'Taxa grátis!') : 'Não se aplica'}`,
        `Total: ${money(finalTotal)}`,
        paymentMethod === 'pix'
          ? ''
          : '',
        paymentMethod === 'pix'
          ? `PIX: ${settings?.payment?.pixKey || 'Não informada'}`
          : '',
        paymentMethod === 'pix'
          ? `${settings?.payment?.pixName || 'Titular não informado'} • ${settings?.payment?.pixBank || 'Banco não informado'}`
          : '',
        paymentMethod === 'pix'
          ? '⚠️ Após o pagamento, envie o comprovante pelo WhatsApp.'
          : ''
      ].filter(Boolean).join('\n')

      window.open(
        `https://api.whatsapp.com/send?phone=5574999630180&text=${encodeURIComponent(
          lines
        )}`,
        '_blank',
        'noopener,noreferrer'
      )

      // O pedido foi encaminhado para o WhatsApp: limpa o carrinho
      // para que um novo pedido comece vazio.
      clearCart()
      setSent(true)
    } catch (error) {
      setDeliveryError(
        `Não foi possível salvar seu pedido no banco: ${
          error.message
        }`
      )
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <div className="modal-backdrop">
        <section className="order-modal order-success">
          <IoCheckmarkCircle className="success-icon" />

          <h1>Pedido enviado!</h1>

          <p>
            Seu pedido foi salvo e seus dados
            ficarão disponíveis para o próximo
            pedido.
          </p>

          <button
            className="btn-default order-submit"
            onClick={onClose}
          >
            Fechar
          </button>
        </section>
      </div>
    )
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <section
        className="order-modal order-builder"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <IoClose />
        </button>

        {!checkoutOnly ? (
          <>
            <div className="order-title-block">
              <span className="admin-badge">
                CARDÁPIO
              </span>

              <h1>Monte seu copo!</h1>

              <p>
                Escolha um açaí, personalize e
                adicione ao carrinho. Você pode
                montar quantos quiser.
              </p>
            </div>
            {!storeStatus.isOpen && <div className="store-closed-notice" role="status"><strong>Loja fechada</strong><span>{storeStatus.message}</span><small>Você pode consultar o cardápio, mas não é possível enviar pedidos agora.</small></div>}

            <div className="order-section">
              <div className="order-section-heading">
                <div>
                  <span className="step-number">
                    1
                  </span>

                  <div>
                    <h2>
                      Escolha seu copo!
                    </h2>

                    <p>
                      Selecione uma opção.
                    </p>
                  </div>
                </div>

                <span className="required-label">
                  Obrigatório
                </span>
              </div>

              <div className="cup-options">
                {products.map((product) => (
                  <button
                    key={product.id}
                    className={`cup-option ${
                      selectedCup === product.id
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() =>
                      setSelectedCup(
                        product.id
                      )
                    }
                  >
                    <span>
                      <strong>
                        {product.name}
                      </strong>

                      <small>
                        {product.description}
                      </small>
                    </span>

                    <b>
                      {money(product.price)}
                    </b>

                    {selectedCup ===
                      product.id && (
                      <IoCheckmarkCircle />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="order-section addons-section">
              <div className="order-section-heading">
                <div>
                  <span className="step-number">
                    2
                  </span>

                  <div>
                    <h2>
                      Escolha seus
                      acompanhamentos
                    </h2>

                    <p>
                      Personalize este açaí.
                    </p>
                  </div>
                </div>

                <span className="optional-label">
                  Opcional
                </span>
              </div>

              {groups.map((group) => (
                <div
                  className="addon-group"
                  key={group.id}
                >
                  <button
                    className="addon-group-heading"
                    onClick={() =>
                      setOpenGroups(
                        (current) => ({
                          ...current,
                          [group.id]:
                            !current[group.id]
                        })
                      )
                    }
                  >
                    <span>
                      <strong>
                        {group.name}
                      </strong>

                      <small>
                        ({group.items.length})
                      </small>

                      <em>
                        {group.multiple
                          ? group.maxSelections
                            ? `até ${group.maxSelections}`
                            : 'pode escolher vários'
                          : 'escolha 1'}
                      </em>
                    </span>

                    {openGroups[group.id] ? (
                      <IoChevronUp />
                    ) : (
                      <IoChevronDown />
                    )}
                  </button>

                  {openGroups[group.id] && (
                    <div className="addon-list">
                      {group.items.map(
                        (item) => (
                          <label
                            className={`addon-item ${
                              selectedItems.includes(
                                item.id
                              )
                                ? 'selected'
                                : ''
                            }`}
                            key={item.id}
                          >
                            <input
                              type={
                                group.multiple
                                  ? 'checkbox'
                                  : 'radio'
                              }
                              name={`group-${group.id}`}
                              checked={selectedItems.includes(
                                item.id
                              )}
                              onChange={() =>
                                toggleItem(
                                  group,
                                  item
                                )
                              }
                            />

                            <span>
                              {item.name}
                            </span>

                            <strong>
                              {item.price
                                ? `+ ${money(
                                    item.price
                                  )}`
                                : 'Grátis'}
                            </strong>
                          </label>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {settings.spoonEnabled && (
              <div className="spoon-option">
                <strong>
                  Vai querer colher?
                </strong>

                <div className="spoon-choice">
                  <label
                    className={
                      spoon === true
                        ? 'selected'
                        : ''
                    }
                  >
                    <input
                      type="radio"
                      name="spoon"
                      checked={
                        spoon === true
                      }
                      onChange={() =>
                        setSpoon(true)
                      }
                    />

                    Sim
                  </label>

                  <label
                    className={
                      spoon === false
                        ? 'selected'
                        : ''
                    }
                  >
                    <input
                      type="radio"
                      name="spoon"
                      checked={
                        spoon === false
                      }
                      onChange={() =>
                        setSpoon(false)
                      }
                    />

                    Não
                  </label>
                </div>

                <small>
                  {settings.spoonPrice
                    ? `+ ${money(
                        settings.spoonPrice
                      )}`
                    : 'Grátis'}
                </small>
              </div>
            )}

            <div className="builder-add-row">
              <strong>
                Este açaí:{' '}
                {money(itemTotal)}
              </strong>

              <div className="builder-action-buttons">
                <button
                  className="btn-default order-submit"
                  disabled={
                    !cup ||
                    spoon === null
                  }
                  onClick={() =>
                    addCurrentToCart(false)
                  }
                >
                  <IoAdd />
                  Adicionar ao carrinho
                </button>

                {storeStatus.isOpen && (
                  <button
                    className="btn-finish-now"
                    disabled={
                      !cup ||
                      spoon === null
                    }
                    onClick={() =>
                      addCurrentToCart(true)
                    }
                  >
                    <IoCartOutline />
                    Finalizar pedido
                  </button>
                )}
              </div>
            </div>

            {storeStatus.isOpen && (
              <div className="mini-cart-hint">
                Você pode adicionar outro açaí ao carrinho ou finalizar este pedido agora.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="order-title-block">
              <span className="admin-badge">
                FINALIZAR PEDIDO
              </span>

              <h1>Seu carrinho</h1>

              <p>
                Confira os itens e informe seus
                dados uma única vez.
              </p>
            </div>
            {!storeStatus.isOpen && <div className="store-closed-notice" role="status"><strong>Loja fechada</strong><span>{storeStatus.message}</span><small>O pedido só poderá ser enviado durante o horário de funcionamento.</small></div>}

            <div className="checkout-cart-list">
              {items.map((item) => (
                <div
                  className="checkout-line"
                  key={item.cartId}
                >
                  <div>
                    <strong>
                      {item.quantity}x{' '}
                      {item.name}
                    </strong>

                    <small>
                      {item.addons?.length
                        ? item.addons.join(
                            ' • '
                          )
                        : 'Sem acompanhamentos'}
                    </small>
                  </div>

                  <div className="checkout-line-controls">
                    <button
                      onClick={() =>
                        updateQuantity(
                          item.cartId,
                          item.quantity - 1
                        )
                      }
                    >
                      <IoRemove />
                    </button>

                    <span>
                      {item.quantity}
                    </span>

                    <button
                      onClick={() =>
                        updateQuantity(
                          item.cartId,
                          item.quantity + 1
                        )
                      }
                    >
                      <IoAdd />
                    </button>

                    <b>
                      {money(
                        item.total *
                          item.quantity
                      )}
                    </b>
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-choice-section">
              <div className="checkout-choice-heading">
                <h2>Forma de entrega</h2>
                <p>Escolha como deseja receber seu pedido.</p>
              </div>

              <div className="checkout-choice-options">
                <button
                  type="button"
                  className={`checkout-choice-card primary-choice ${fulfillmentType === 'entrega' ? 'selected' : ''}`}
                  onClick={() => selectFulfillment('entrega')}
                >
                  <strong>🚚 Entrega</strong>
                  <small>Receba seu pedido no endereço informado.</small>
                </button>

                <button
                  type="button"
                  className={`checkout-choice-card secondary-choice ${fulfillmentType === 'retirada' ? 'selected' : ''}`}
                  onClick={() => selectFulfillment('retirada')}
                >
                  <strong>🏪 Retirada</strong>
                  <small>Retire diretamente na loja.</small>
                </button>
              </div>

              {fulfillmentType === 'retirada' && (
                <div className="pickup-store-address">
                  <strong>📍 Endereço para retirada</strong>
                  <span>{storeAddressText(settings.store)}</span>
                </div>
              )}
            </div>

            <div className="checkout-choice-section">
              <div className="checkout-choice-heading">
                <h2>Forma de pagamento</h2>
                <p>Selecione como deseja pagar.</p>
              </div>

              <div className="payment-options">
                {[
                  ['pix', 'PIX'],
                  ['dinheiro', 'Dinheiro'],
                  ['credito', 'Crédito (maquineta)'],
                  ['debito', 'Débito (maquineta)']
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className={`payment-option ${paymentMethod === value ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={value}
                      checked={paymentMethod === value}
                      onChange={() => setPaymentMethod(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              {paymentMethod === 'pix' && (
                <div className="pix-payment-notice">
                  <strong>Pagamento via PIX</strong>
                  <div><b>Chave PIX:</b> {settings?.payment?.pixKey || 'Não informada'}</div>
                  <div><b>Nome:</b> {settings?.payment?.pixName || 'Titular não informado'}</div>
                  <div><b>Instituição:</b> {settings?.payment?.pixBank || 'Banco não informado'}</div>
                  <p>⚠️ Após realizar o pagamento, envie o comprovante pelo WhatsApp.</p>
                </div>
              )}
            </div>

            <div className="customer-fields">
              <h2>
                Seus dados

                {savedCustomer && (
                  <small className="saved-badge">
                    Dados salvos ✓
                  </small>
                )}

                {customerLoaded &&
                  !savedCustomer && (
                    <small className="saved-badge">
                      Novo cliente
                    </small>
                  )}
              </h2>

              <div className="customer-grid">
                <label>
                  Nome

                  <input
                    value={customerName}
                    onChange={(e) =>
                      setCustomerName(
                        e.target.value
                      )
                    }
                    placeholder="Seu nome"
                  />
                </label>

                <label>
                  Telefone

                  <input
                    value={customerPhone}
                    onChange={(e) =>
                      setCustomerPhone(
                        e.target.value
                      )
                    }
                    placeholder="(74) 99999-9999"
                  />
                </label>
              </div>

              {fulfillmentType === 'entrega' && (
                <>
                <div className="customer-grid">
                  <label>
                    CEP
  
                    <input
                      value={cep}
                      onChange={handleCep}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                    />
                  </label>
  
                  <label>
                    Número
  
                    <input
                      value={address.number}
                      onChange={(e) => {
                        const value =
                          e.target.value
  
                        setAddress(
                          (current) => ({
                            ...current,
                            number: value
                          })
                        )
  
                        setSavedCustomer(
                          false
                        )
  
                        setDelivery(null)
                        setDeliveryError('')
                      }}
                      onBlur={(e) =>
                        calculateDelivery(
                          {
                            ...address,
                            number:
                              e.target.value.trim()
                          },
                          cep
                        )
                      }
                      placeholder="Número"
                    />
                  </label>
                </div>
  
                <div className="customer-grid">
                  <label>
                    Rua
  
                    <input
                      value={address.street}
                      readOnly
                    />
                  </label>
  
                  <label>
                    Bairro
  
                    <input
                      value={
                        address.neighborhood
                      }
                      readOnly
                    />
                  </label>
                </div>
  
                <div className="customer-grid">
                  <label>
                    Cidade
  
                    <input
                      value={address.city}
                      readOnly
                    />
                  </label>
  
                  <label>
                    UF
  
                    <input
                      value={address.state}
                      readOnly
                    />
                  </label>
                </div>
  
                <AddressMapPicker
                  address={address}
                  cep={cep}
                  latitude={customerLocation.latitude}
                  longitude={customerLocation.longitude}
                  onChange={(location) => {
                    setCustomerLocation(location)
                    setDelivery(null)
  
                    if (location.address) {
                      setAddress((current) => ({
                        ...current,
                        street: location.address.street || current.street,
                        neighborhood: location.address.neighborhood || current.neighborhood,
                        city: location.address.city || current.city,
                        state: location.address.state || current.state,
                        // O número e o complemento digitados pelo cliente são preservados.
                      }))
  
                      if (location.address.cep) {
                        setCep(location.address.cep)
                      }
                    }
  
                    if (location.latitude && location.longitude && address.number) {
                      const nextAddress = location.address
                        ? {
                            ...address,
                            street: location.address.street || address.street,
                            neighborhood: location.address.neighborhood || address.neighborhood,
                            city: location.address.city || address.city,
                            state: location.address.state || address.state,
                          }
                        : address
                      const nextCep = location.address?.cep || cep
                      calculateDelivery(nextAddress, nextCep, location)
                    }
                  }}
                  title="Confira sua localização no mapa"
                />
  
                {cepLoading && (
                  <small className="delivery-loading">
                    Localizando endereço e
                    calculando frete...
                  </small>
                )}
  
                {deliveryError && (
                  <div className="delivery-error">
                    {deliveryError}
                  </div>
                )}
  
                </>
              )}

              {delivery && (
                <div className="delivery-result">
                  <span>
                    🚚 Frete
                  </span>

                  <strong>
                    {delivery.fee
                      ? money(
                          delivery.fee
                        )
                      : 'Taxa grátis!'}
                  </strong>

                  <small>
                    {delivery.km
                      .toFixed(1)
                      .replace('.', ',')}{' '}
                    km • até{' '}
                    {delivery.minutes}{' '}
                    min
                  </small>
                </div>
              )}
            </div>

            <div className="order-summary">
              <div>
                <span>
                  Subtotal
                </span>

                <strong>
                  {money(cartSubtotal)}
                </strong>
              </div>

              <div>
                <span>
                  Frete
                </span>

                <strong>
                  {delivery
                    ? delivery.fee
                      ? money(
                          delivery.fee
                        )
                      : 'Taxa grátis!'
                    : '—'}
                </strong>
              </div>

              <div className="order-total">
                <small>
                  Total
                </small>

                <strong>
                  {money(finalTotal)}
                </strong>
              </div>
            </div>

            <button
              className="btn-default order-submit"
              disabled={
                !items.length ||
                !customerName.trim() ||
                !customerPhone.trim() ||
                (fulfillmentType === 'entrega' && (!cep || !address.number)) ||
                !delivery ||
                !storeStatus.isOpen ||
                saving
              }
              onClick={finishOrder}
            >
              {saving
                ? 'Salvando...'
                : 'Enviar pedido'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}