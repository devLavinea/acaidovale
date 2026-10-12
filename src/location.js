const DEFAULT_CENTER = [-9.4167, -40.5031]
const GEOCODE_CACHE = new Map()

export { DEFAULT_CENTER }

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8)
}

function cleanText(value) {
  return String(value || '').trim()
}

function normalize(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeHouseNumber(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '')
}

const STATE_NAMES = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara',
  DF: 'distrito federal', ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MT: 'mato grosso',
  MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'para', PB: 'paraiba', PR: 'parana',
  PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro', RN: 'rio grande do norte', RS: 'rio grande do sul',
  RO: 'rondonia', RR: 'roraima', SC: 'santa catarina', SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins'
}

function stateMatches(wanted, found) {
  const wantedValue = normalize(wanted)
  const foundValue = normalize(found)
  if (!wantedValue || !foundValue) return true

  const wantedFull = STATE_NAMES[String(wanted || '').trim().toUpperCase()] || wantedValue
  const foundFull = STATE_NAMES[String(found || '').trim().toUpperCase()] || foundValue

  return foundValue === wantedValue || foundFull === wantedFull || foundValue.includes(wantedFull) || wantedFull.includes(foundValue)
}

function sameRegion(properties, address) {
  const wantedCity = normalize(address.city)
  const city = normalize(properties?.city || properties?.town || properties?.municipality || properties?.locality || properties?.city_district)
  const state = properties?.state || properties?.state_district || properties?.ISO3166_2_lvl4 || properties?.state_code
  const country = normalize(properties?.country_code || properties?.countrycode || properties?.country)

  const cityOk = !wantedCity || !city || city === wantedCity || city.includes(wantedCity) || wantedCity.includes(city)
  const stateOk = stateMatches(address.state, state)
  const countryOk = !country || country === 'br' || country.includes('brasil') || country.includes('brazil')

  return cityOk && stateOk && countryOk
}

function scoreNominatimResult(result, address, mode = 'full') {
  const a = result?.address || {}
  const wantedStreet = normalize(address.street)
  const wantedNumber = normalizeHouseNumber(address.number)
  const wantedNeighborhood = normalize(address.neighborhood)
  const resultStreet = normalize(a.road || a.pedestrian || a.footway || a.path)
  const resultNumber = normalizeHouseNumber(a.house_number)
  const resultNeighborhood = normalize(a.neighbourhood || a.suburb || a.quarter || a.city_district)
  const type = normalize(result?.type)
  const addresstype = normalize(result?.addresstype)

  let score = Number(result?.importance || 0) * 10

  if (resultStreet && wantedStreet && resultStreet === wantedStreet) score += 220
  else if (resultStreet && wantedStreet && (resultStreet.includes(wantedStreet) || wantedStreet.includes(resultStreet))) score += 110
  if (resultNumber && wantedNumber && resultNumber === wantedNumber) score += 180
  if (resultNeighborhood && wantedNeighborhood && resultNeighborhood === wantedNeighborhood) score += 70

  if (type === 'house' || addresstype === 'house') score += mode === 'full' ? 160 : -30
  if (type === 'building' || addresstype === 'building') score += mode === 'full' ? 120 : -20
  if (type === 'residential') score += 60
  if (type === 'road' || addresstype === 'road') score += mode === 'street' ? 150 : 20
  if (type === 'street' || addresstype === 'street') score += mode === 'street' ? 140 : 20
  if (type === 'city' || addresstype === 'city') score -= 250
  if (type === 'neighbourhood' || addresstype === 'neighbourhood') score -= mode === 'street' ? 20 : 80

  return score
}

function scorePhotonResult(feature, address, mode = 'full') {
  const p = feature?.properties || {}
  const wantedNumber = normalizeHouseNumber(address.number)
  const wantedStreet = normalize(address.street)
  const wantedNeighborhood = normalize(address.neighborhood)
  const featureStreet = normalize(p.street)
  const featureNumber = normalizeHouseNumber(p.housenumber)
  const featureNeighborhood = normalize(p.neighbourhood || p.neighborhood || p.district)
  const layer = normalize(p.layer)
  const osmValue = normalize(p.osm_value)

  let score = Number(p.extent ? 1 : 0)

  if (featureStreet && wantedStreet && featureStreet === wantedStreet) score += 220
  else if (featureStreet && wantedStreet && (featureStreet.includes(wantedStreet) || wantedStreet.includes(featureStreet))) score += 110
  if (featureNumber && wantedNumber && featureNumber === wantedNumber) score += 180
  if (featureNeighborhood && wantedNeighborhood && featureNeighborhood === wantedNeighborhood) score += 70

  if (osmValue === 'house' || layer === 'house') score += mode === 'full' ? 160 : -30
  if (layer === 'building') score += mode === 'full' ? 120 : -20
  if (layer === 'street') score += mode === 'street' ? 150 : 20
  if (layer === 'locality' || layer === 'city') score -= 250

  return score
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Serviço de localização indisponível (${response.status}).`)
  }

  return response.json()
}

function buildNominatimUrl(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '8')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('accept-language', 'pt-BR')
  url.searchParams.set('dedupe', '1')
  return url.toString()
}

function validResultCoordinates(result) {
  return Number.isFinite(Number(result?.lat)) && Number.isFinite(Number(result?.lon))
}

function exactHouseResult(result, address) {
  const resultAddress = result?.address || {}
  const wantedNumber = normalizeHouseNumber(address.number)
  const resultNumber = normalizeHouseNumber(resultAddress.house_number)
  if (!wantedNumber || !resultNumber || wantedNumber !== resultNumber) return false

  const type = normalize(result?.type)
  const addresstype = normalize(result?.addresstype)
  return type === 'house' || addresstype === 'house' || type === 'building' || addresstype === 'building' || Boolean(resultNumber)
}

async function geocodeNominatim(address, signal, mode = 'full') {
  const street = cleanText(address.street)
  const number = cleanText(address.number)
  const neighborhood = cleanText(address.neighborhood)
  const city = cleanText(address.city)
  const state = cleanText(address.state)

  const query = mode === 'full'
    ? [street, number, neighborhood, city, state, 'Brasil'].filter(Boolean).join(', ')
    : [street, neighborhood, city, state, 'Brasil'].filter(Boolean).join(', ')

  const data = await fetchJson(buildNominatimUrl(query), signal)
  const candidates = (Array.isArray(data) ? data : [])
    .filter((result) => validResultCoordinates(result) && sameRegion(result.address, address))
    .sort((a, b) => scoreNominatimResult(b, address, mode) - scoreNominatimResult(a, address, mode))

  const best = candidates[0]
  if (!best) return null

  return {
    lat: Number(best.lat),
    lon: Number(best.lon),
    display: best.display_name || query,
    approximate: mode !== 'full' || !exactHouseResult(best, address),
    source: mode === 'full' ? 'nominatim' : 'nominatim-street'
  }
}

async function geocodePhoton(address, signal, mode = 'full') {
  const query = mode === 'full'
    ? [cleanText(address.street), cleanText(address.number), cleanText(address.neighborhood), cleanText(address.city), cleanText(address.state), 'Brasil'].filter(Boolean).join(', ')
    : [cleanText(address.street), cleanText(address.neighborhood), cleanText(address.city), cleanText(address.state), 'Brasil'].filter(Boolean).join(', ')

  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '10')
  url.searchParams.set('lang', 'pt')
  url.searchParams.set('countrycode', 'BR')

  const data = await fetchJson(url.toString(), signal)
  const features = Array.isArray(data?.features) ? data.features : []
  const candidates = features
    .filter((feature) => {
      const coordinates = feature?.geometry?.coordinates
      return Array.isArray(coordinates)
        && Number.isFinite(Number(coordinates[0]))
        && Number.isFinite(Number(coordinates[1]))
        && sameRegion(feature.properties, address)
    })
    .sort((a, b) => scorePhotonResult(b, address, mode) - scorePhotonResult(a, address, mode))

  const best = candidates[0]
  if (!best) return null

  const [lon, lat] = best.geometry.coordinates.map(Number)
  const p = best.properties || {}
  const exact = Boolean(p.housenumber && normalizeHouseNumber(p.housenumber) === normalizeHouseNumber(address.number))
    || p.osm_value === 'house'
    || p.layer === 'house'

  return {
    lat,
    lon,
    display: [p.street, p.housenumber, p.neighbourhood || p.neighborhood || p.district, p.city, p.state]
      .filter(Boolean).join(', ') || p.name || query,
    approximate: mode !== 'full' || !exact,
    source: mode === 'full' ? 'photon' : 'photon-street'
  }
}

async function geocodeNeighborhood(address, signal) {
  const query = [cleanText(address.neighborhood), cleanText(address.city), cleanText(address.state), 'Brasil']
    .filter(Boolean).join(', ')

  if (!cleanText(address.neighborhood)) return null

  const [nominatim, photon] = await Promise.allSettled([
    geocodeNominatim({ ...address, street: address.neighborhood, number: '' }, signal, 'street'),
    geocodePhoton({ ...address, street: address.neighborhood, number: '' }, signal, 'street')
  ])

  const results = [
    nominatim.status === 'fulfilled' ? nominatim.value : null,
    photon.status === 'fulfilled' ? photon.value : null
  ].filter(Boolean)

  if (!results.length) return null

  return results[0]
    ? { ...results[0], display: results[0].display || query, approximate: true, source: `${results[0].source}-neighborhood` }
    : null
}

export async function geocodeAddress(address = {}, options = {}) {
  const street = cleanText(address.street)
  const number = cleanText(address.number)
  const city = cleanText(address.city)
  const state = cleanText(address.state)

  if (!city || !state) throw new Error('Informe cidade e estado antes de localizar o endereço.')
  if (!street) throw new Error('Informe a rua para localizar o endereço.')

  const signal = options?.signal
  const cacheKey = [street, number, cleanText(address.neighborhood), city, state].map(normalize).join('|')
  if (GEOCODE_CACHE.has(cacheKey)) return GEOCODE_CACHE.get(cacheKey)

  const errors = []

  // 1. Consulta os dois serviços ao mesmo tempo. Assim o primeiro resultado
  // útil chega muito mais rápido do que a sequência Nominatim -> Photon.
  if (number) {
    const results = await Promise.allSettled([
      geocodeNominatim(address, signal, 'full'),
      geocodePhoton(address, signal, 'full')
    ])

    const values = results
      .filter((item) => item.status === 'fulfilled' && item.value)
      .map((item) => item.value)

    const exact = values.find((result) => !result.approximate)
    if (exact) {
      GEOCODE_CACHE.set(cacheKey, exact)
      return exact
    }
    values.forEach(() => errors.push('resultado aproximado no endereço completo'))
    results
      .filter((item) => item.status === 'rejected' && item.reason?.name !== 'AbortError')
      .forEach((item) => errors.push(item.reason?.message || 'erro na busca completa'))
  }

  // 2. Fallback obrigatório: somente rua + bairro + cidade + estado.
  // Isso permite localizar uma rua mesmo quando o número não está cadastrado.
  for (const service of [geocodePhoton, geocodeNominatim]) {
    try {
      const result = await service(address, signal, 'street')
      if (result) {
        GEOCODE_CACHE.set(cacheKey, result)
        return result
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      errors.push(error?.message || 'erro na busca da rua')
    }
  }

  // 3. Último recurso: centro do bairro, mantendo o marcador ajustável.
  try {
    const result = await geocodeNeighborhood(address, signal)
    if (result) {
      GEOCODE_CACHE.set(cacheKey, result)
      return result
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    errors.push(error?.message || 'erro na busca do bairro')
  }

  throw new Error('Não foi possível localizar automaticamente. Tente novamente ou clique no mapa/arraste o marcador para indicar o local.')
}


export async function reverseGeocode(latitude, longitude, options = {}) {
  const lat = Number(latitude)
  const lon = Number(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Coordenadas inválidas para identificar o endereço.')
  }

  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('zoom', '18')
  url.searchParams.set('accept-language', 'pt-BR')

  const result = await fetchJson(url.toString(), options?.signal)
  const a = result?.address || {}

  const city = a.city || a.town || a.municipality || a.village || a.locality || ''
  const stateCode = String(a['ISO3166-2-lvl4'] || '').replace(/^BR-/i, '').toUpperCase()
  const state = stateCode || a.state || ''
  const street = a.road || a.pedestrian || a.footway || a.path || ''
  const neighborhood = a.neighbourhood || a.suburb || a.quarter || a.city_district || ''
  const postcode = String(a.postcode || '').replace(/\D/g, '').slice(0, 8)

  if (!street && !neighborhood && !city) {
    throw new Error('O ponto selecionado não possui endereço identificável no mapa.')
  }

  return {
    street,
    neighborhood,
    city,
    state,
    cep: postcode ? `${postcode.slice(0, 5)}-${postcode.slice(5)}` : '',
    display: result?.display_name || ''
  }
}

export async function routeDistance(origin, destination) {
  const aLat = Number(origin?.lat), aLon = Number(origin?.lon)
  const bLat = Number(destination?.lat), bLon = Number(destination?.lon)

  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) {
    throw new Error('Não foi possível identificar corretamente os dois locais.')
  }

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${aLon},${aLat};${bLon},${bLat}?overview=false&steps=false`
  )

  if (!response.ok) throw new Error('Não foi possível calcular a rota pelas ruas.')

  const data = await response.json()
  const route = data?.routes?.[0]

  if (data.code !== 'Ok' || !route) {
    throw new Error('Não foi encontrada uma rota pelas ruas entre os dois locais.')
  }

  return {
    km: Number(route.distance) / 1000,
    routeMinutes: Math.ceil(Number(route.duration || 0) / 60)
  }
}
