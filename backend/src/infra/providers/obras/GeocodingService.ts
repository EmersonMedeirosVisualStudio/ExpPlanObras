const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

const UF_BY_STATE: Record<string, string> = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', GOIAS: 'GO', MARANHAO: 'MA',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', PARA: 'PA',
  PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI', 'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
}

export interface AddressResult {
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

export interface CoordResult {
  latitude: string
  longitude: string
}

function normalizeCep(value: string): string {
  const d = String(value || '').replace(/\D/g, '')
  return d.length === 8 ? d : ''
}

function normalizeUf(candidate: unknown, iso: unknown, stateName: unknown): string | null {
  const uf = String(candidate || '').trim().toUpperCase()
  if (uf.length === 2 && UF_LIST.includes(uf)) return uf
  const isoStr = String(iso || '').trim().toUpperCase()
  if (isoStr.startsWith('BR-') && isoStr.length >= 5) {
    const s = isoStr.slice(-2)
    if (UF_LIST.includes(s)) return s
  }
  const normalized = String(stateName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return UF_BY_STATE[normalized] || null
}

function parseLatLng(value: string): CoordResult | null {
  const s = String(value || '').trim()
  const m = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { latitude: String(lat), longitude: String(lng) }
}

async function resolveUrl(input: string): Promise<string> {
  const raw = String(input || '').trim()
  if (!raw) return ''
  let url = raw
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const u = new URL(url)
    if (u.hostname.includes('maps.app.goo.gl') || u.hostname.includes('goo.gl')) {
      const r = await fetch(url, { redirect: 'follow' })
      return r.url || url
    }
    return url
  } catch {
    return ''
  }
}

export async function reverseGeocode(latitude: string, longitude: string): Promise<AddressResult | null> {
  if (String(process.env.GEOCODING_PROVIDER || 'NOMINATIM').toUpperCase() !== 'NOMINATIM') return null
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&addressdetails=1`
  const r = await fetch(url, { headers: { 'User-Agent': 'ExpPlanObras/1.0' } }).catch(() => null)
  if (!r?.ok) return null
  const json = await r.json().catch(() => null) as Record<string, unknown> | null
  const a = (json?.address ?? {}) as Record<string, unknown>
  if (!a) return null
  const uf = normalizeUf(a.state_code, a['ISO3166-2-lvl4'], a.state)
  return {
    logradouro: (a.road || a.pedestrian || a.highway || null) as string | null,
    numero: (a.house_number || null) as string | null,
    bairro: (a.suburb || a.neighbourhood || a.quarter || null) as string | null,
    cidade: (a.city || a.town || a.village || a.municipality || a.county || null) as string | null,
    uf,
    cep: a.postcode ? normalizeCep(String(a.postcode)) || null : null,
  }
}

export async function searchGeocode(query: string): Promise<(CoordResult & { cep: string | null }) | null> {
  if (String(process.env.GEOCODING_PROVIDER || 'NOMINATIM').toUpperCase() !== 'NOMINATIM') return null
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`
  const r = await fetch(url, { headers: { 'User-Agent': 'ExpPlanObras/1.0' } }).catch(() => null)
  if (!r?.ok) return null
  const json = await r.json().catch(() => null) as unknown[] | null
  const row = Array.isArray(json) ? json[0] as Record<string, unknown> : null
  if (!row) return null
  const lat = row?.lat != null ? String(row.lat) : null
  const lon = row?.lon != null ? String(row.lon) : null
  if (!lat || !lon) return null
  const a = (row?.address ?? {}) as Record<string, unknown>
  const cep = a?.postcode ? normalizeCep(String(a.postcode)) || null : null
  return { latitude: lat, longitude: lon, cep }
}

export async function lookupCep(cepDigits: string): Promise<{ cep: string; logradouro: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null } | null> {
  const cep = normalizeCep(cepDigits)
  if (!cep) return null
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).catch(() => null)
  if (!r?.ok) return null
  const json = await r.json().catch(() => null) as Record<string, unknown> | null
  if (!json || json.erro) return null
  return { cep, logradouro: (json.logradouro || null) as string | null, complemento: (json.complemento || null) as string | null, bairro: (json.bairro || null) as string | null, cidade: (json.localidade || null) as string | null, uf: (json.uf || null) as string | null }
}

export async function resolveCoords(input: { link?: string; cep?: string; latitude?: string; longitude?: string }): Promise<{ coords: CoordResult | null; addr: AddressResult | null }> {
  if (input.link) {
    const resolved = await resolveUrl(input.link)
    const coords = parseLatLng(resolved) || parseLatLng(input.link)
    if (coords) {
      const addr = await reverseGeocode(coords.latitude, coords.longitude)
      return { coords, addr }
    }
  }
  return { coords: null, addr: null }
}

export { normalizeCep, parseLatLng }
