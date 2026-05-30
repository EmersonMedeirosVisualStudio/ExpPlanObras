function extractLatLng(link: string) {
  const v = String(link || '').trim()
  const atMatch = v.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (atMatch) return { lat: atMatch[1], lon: atMatch[2] }
  const bangMatch = v.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (bangMatch) return { lat: bangMatch[1], lon: bangMatch[2] }
  return null
}

function extractQuery(link: string) {
  const v = String(link || '').trim()
  const queryMatch = v.match(/[?&](?:query|q)=([^&]+)/i)
  if (queryMatch) {
    try { return decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')).trim() } catch { return String(queryMatch[1] || '').trim() }
  }
  const placeMatch = v.match(/\/place\/([^/]+)/i)
  if (placeMatch) {
    try { return decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim() } catch { return String(placeMatch[1] || '').trim() }
  }
  return null
}

async function fetchJson(url: string) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ExpPlanObras/1.0 (admin maps resolve)', Accept: 'application/json' },
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, data }
  } finally {
    clearTimeout(id)
  }
}

function mapNominatimAddress(addr: Record<string, unknown>) {
  const str = (k: string) => (typeof addr?.[k] === 'string' ? (addr[k] as string) : '')
  return {
    street: str('road'),
    neighborhood: str('suburb') || str('neighbourhood') || str('city_district'),
    city: str('city') || str('town') || str('village'),
    state: str('state'),
    cep: str('postcode').replace(/\D+/g, ''),
  }
}

export async function resolveMapLink(link: string) {
  const latLng = extractLatLng(link)
  const q = extractQuery(link)

  if (latLng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(latLng.lat)}&lon=${encodeURIComponent(latLng.lon)}`
    const res = await fetchJson(url)
    if (!res.ok) throw new Error('Falha ao consultar endereço')
    const addr = (res.data as Record<string, unknown>)?.address as Record<string, unknown>
    return {
      ...mapNominatimAddress(addr),
      latitude: String((res.data as Record<string, unknown>)?.lat || latLng.lat),
      longitude: String((res.data as Record<string, unknown>)?.lon || latLng.lon),
    }
  }

  if (q && q.length > 0) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`
    const res = await fetchJson(url)
    if (!res.ok) throw new Error('Falha ao consultar endereço')
    const items = Array.isArray(res.data) ? res.data : []
    const item = items[0] as Record<string, unknown> | undefined
    if (!item) throw new Error('Endereço não encontrado')
    return {
      ...mapNominatimAddress((item?.address as Record<string, unknown>) || {}),
      latitude: String(item?.lat || ''),
      longitude: String(item?.lon || ''),
    }
  }

  throw new Error('Link inválido para busca')
}
