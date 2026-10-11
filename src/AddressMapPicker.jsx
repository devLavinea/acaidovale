import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IoLocationOutline } from 'react-icons/io5'
import { DEFAULT_CENTER, geocodeAddress, reverseGeocode } from './location'
const markerIcon = L.divIcon({
  className: 'customer-location-marker-wrap',
  html: '<div class="customer-location-marker" aria-label="Localização"><span></span></div>',
  iconSize: [36, 46],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44]
})

function validCoordinate(value) {
  if (value === null || value === undefined || value === '') return false
  const number = Number(value)
  return Number.isFinite(number) && Math.abs(number) > 0.000001
}

function addressKey(address) {
  // A chave é baseada no ENDEREÇO, não no CEP.
  // Assim, trocar/consultar o CEP não reposiciona o marcador se o endereço
  // continuar sendo o mesmo.
  return [
    address?.street,
    address?.number,
    address?.neighborhood,
    address?.city,
    address?.state
  ].map((value) => String(value || '').trim().toLowerCase()).join('|')
}

export default function AddressMapPicker({
  address,
  latitude,
  longitude,
  onChange,
  title = 'Localização no mapa'
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const timerRef = useRef(null)
  const requestRef = useRef(0)
  const onChangeRef = useRef(onChange)
  const manualRef = useRef(false)
  const resolvedKeyRef = useRef('')
  const lastAddressKeyRef = useRef('')
  const internalAddressUpdateRef = useRef(false)
  const [status, setStatus] = useState('')
  const [locationError, setLocationError] = useState(false)
  const [showMap, setShowMap] = useState(true)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const removeMarker = () => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.removeFrom(mapRef.current)
    }
    markerRef.current = null
  }

  const place = (lat, lng, center = true) => {
    const map = mapRef.current
    if (!map || !validCoordinate(lat) || !validCoordinate(lng)) return

    const point = [Number(lat), Number(lng)]

    if (!markerRef.current) {
      markerRef.current = L.marker(point, {
        icon: markerIcon,
        draggable: true
      }).addTo(map)

      markerRef.current.bindTooltip('Arraste para ajustar o ponto exato', {
        direction: 'top',
        offset: [0, -10]
      })

      markerRef.current.on('dragstart', () => {
        manualRef.current = true
        requestRef.current += 1
        setStatus('Posição ajustada manualmente.')
      })

      markerRef.current.on('dragend', async () => {
        const current = markerRef.current?.getLatLng()
        if (!current) return

        requestRef.current += 1
        const reverseRequestId = requestRef.current
        setLocationError(false)
        setStatus('Identificando o endereço do novo ponto...')

        try {
          const result = await reverseGeocode(current.lat, current.lng)
          if (reverseRequestId !== requestRef.current) return

          internalAddressUpdateRef.current = true
          onChangeRef.current({
            latitude: current.lat,
            longitude: current.lng,
            approximate: false,
            manual: true,
            address: result
          })

          setStatus('Endereço atualizado automaticamente pelo ponto marcado. Você pode alterar apenas o número e o complemento.')
        } catch (error) {
          if (reverseRequestId !== requestRef.current) return

          onChangeRef.current({
            latitude: current.lat,
            longitude: current.lng,
            approximate: false,
            manual: true
          })
          setStatus('Ponto ajustado. Não foi possível preencher todos os dados do endereço automaticamente; confira o endereço.')
        }
      })
    } else {
      markerRef.current.setLatLng(point)
    }

    if (center) {
      map.setView(point, Math.max(map.getZoom(), 17), { animate: true })
    }
  }

  const chooseMapPoint = async (lat, lng) => {
    manualRef.current = true
    requestRef.current += 1
    const reverseRequestId = requestRef.current
    place(lat, lng, true)
    setLocationError(false)
    setStatus('Identificando o endereço do novo ponto...')

    try {
      const result = await reverseGeocode(lat, lng)
      if (reverseRequestId !== requestRef.current) return

      internalAddressUpdateRef.current = true
      onChangeRef.current({
        latitude: lat,
        longitude: lng,
        approximate: false,
        manual: true,
        address: result
      })
      setStatus('Endereço atualizado automaticamente pelo ponto marcado. Você pode alterar apenas o número e o complemento.')
    } catch (error) {
      if (reverseRequestId !== requestRef.current) return
      onChangeRef.current({
        latitude: lat,
        longitude: lng,
        approximate: false,
        manual: true
      })
      setStatus('Ponto ajustado. Não foi possível preencher todos os dados do endereço automaticamente; confira o endereço.')
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const lat = Number(latitude)
    const lng = Number(longitude)
    const valid = validCoordinate(lat) && validCoordinate(lng)

    const map = L.map(containerRef.current, {
      center: valid ? [lat, lng] : DEFAULT_CENTER,
      zoom: valid ? 17 : 14,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    mapRef.current = map

    if (valid) place(lat, lng, false)

    map.on('click', (event) => {
      chooseMapPoint(event.latlng.lat, event.latlng.lng)
    })

    setTimeout(() => map.invalidateSize(), 150)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // O mapa deve ser criado uma única vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sempre que latitude/longitude mudarem no React, o marcador também muda.
  // O setLatLng é o método oficial do Leaflet para atualizar a posição do marker.
  useEffect(() => {
    const lat = Number(latitude)
    const lng = Number(longitude)

    if (validCoordinate(lat) && validCoordinate(lng)) {
      place(lat, lng, true)
    } else if (mapRef.current) {
      removeMarker()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude])

  const searchAddress = async () => {
    const currentKey = addressKey(address)
    const street = String(address?.street || '').trim()
    const number = String(address?.number || '').trim()
    const city = String(address?.city || '').trim()
    const state = String(address?.state || '').trim()

    if (!street || !city || !state) {
      setLocationError(true)
      setStatus('Informe rua, cidade e estado antes de procurar no mapa.')
      return
    }

    manualRef.current = false
    resolvedKeyRef.current = ''
    const requestId = ++requestRef.current

    try {
      setLocationError(false)
      setShowMap(true)
      setStatus('Procurando endereço no mapa...')

      const result = await geocodeAddress(address)

      if (requestId !== requestRef.current || manualRef.current) return
      if (!validCoordinate(result.lat) || !validCoordinate(result.lon)) {
        throw new Error('O serviço encontrou o endereço, mas não retornou uma localização válida.')
      }

      resolvedKeyRef.current = currentKey

      onChangeRef.current({
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        approximate: result.approximate,
        manual: false,
        display: result.display
      })

      place(Number(result.lat), Number(result.lon), true)
      setLocationError(false)
      setStatus(
        result.approximate
          ? 'Localização aproximada da rua. Arraste o marcador até o ponto exato.'
          : 'Endereço localizado. Se necessário, arraste o marcador para o ponto exato.'
      )
    } catch (error) {
      if (requestId !== requestRef.current) return
      removeMarker()
      onChangeRef.current({ latitude: null, longitude: null, approximate: null, manual: false })
      setLocationError(true)
      setStatus(error?.message || 'Não foi possível localizar o endereço automaticamente.')
    }
  }

  useEffect(() => {
    const currentKey = addressKey(address)

    if (internalAddressUpdateRef.current) {
      internalAddressUpdateRef.current = false
      lastAddressKeyRef.current = currentKey
      return
    }

    if (lastAddressKeyRef.current && currentKey !== lastAddressKeyRef.current) {
      manualRef.current = false
      resolvedKeyRef.current = ''
      requestRef.current += 1
      removeMarker()
      setShowMap(true)
      onChangeRef.current({
        latitude: null,
        longitude: null,
        approximate: null,
        manual: false
      })
      setStatus('Endereço alterado. Clique em “Confirmar endereço” para atualizar a localização.')
      setLocationError(false)
    }

    lastAddressKeyRef.current = currentKey
  }, [address?.street, address?.number, address?.neighborhood, address?.city, address?.state])

  useEffect(() => {
    if (!showMap || !mapRef.current) return
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 100)
    return () => clearTimeout(timer)
  }, [showMap])

  const hasLocation = validCoordinate(latitude) && validCoordinate(longitude)

  return (
    <div className="address-location-picker">
      <div className="address-location-heading">
        <div>
          <strong>{title}</strong>
          <span>
            Seu endereço está salvo e sua localização já foi confirmada. Se alterar os dados do endereço, confirme novamente a localização no mapa.
          </span>
        </div>
        <IoLocationOutline />
      </div>

      <button
        type="button"
        className="address-map-search-button"
        onClick={searchAddress}
        disabled={!String(address?.street || '').trim() || !String(address?.city || '').trim() || !String(address?.state || '').trim()}
        style={{ display: hasLocation ? 'none' : 'flex' }}
      >
        📍 Confirmar endereço
      </button>

      <div ref={containerRef} className="store-location-map" style={{ display: 'block' }} aria-label="Mapa do endereço" />

      <div className={`store-location-status ${hasLocation ? 'is-set' : ''} ${locationError ? 'is-error' : ''}`}>
        <span>{hasLocation ? '✓ Endereço confirmado' : locationError ? '⚠ Não foi possível marcar a localização' : '○ Localização ainda não confirmada'}</span>
        <div>{status}</div>
        {hasLocation && (
          <div>
            <b>Latitude:</b> {Number(latitude).toFixed(7)} &nbsp; • &nbsp;
            <b>Longitude:</b> {Number(longitude).toFixed(7)}
          </div>
        )}
      </div>
    </div>
  )
}
