
'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ExternalLink } from 'lucide-react';

// Fix for default marker icon in Next.js
// @ts-expect-error Leaflet types do not expose _getIconUrl
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Obra {
  id: number;
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  enderecoObra?: {
    latitude?: string | null;
    longitude?: string | null;
  } | null;
  valorPrevisto?: number;
  contratoNumero?: string | null;
  valorMedido?: number;
  valorAMedir?: number;
  hoverTitle?: string | null;
}

interface MapaObrasProps {
  obras: Obra[];
  selectedObraId?: number | null;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: "#EAB308", // Yellow
  AGUARDANDO_CONTRATO: "#EAB308", // Yellow
  AGUARDANDO_OS: "#F97316", // Orange
  NAO_INICIADA: "#9CA3AF", // Gray
  EM_ANDAMENTO: "#22C55E", // Green
  PARADA: "#EF4444", // Red
  FINALIZADA: "#3B82F6" // Blue
};

const STATUS_LABEL_MAP: Record<string, string> = {
    AGUARDANDO_RECURSOS: "Aguardando recursos",
    AGUARDANDO_CONTRATO: "Aguardando assinatura",
    AGUARDANDO_OS: "Aguardando OS",
    NAO_INICIADA: "Não iniciada",
    EM_ANDAMENTO: "Em andamento",
    PARADA: "Parada",
    FINALIZADA: "Finalizada"
};

const createCustomIcon = (color: string, selected: boolean) => {
  return new L.DivIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: ${selected ? 30 : 24}px; height: ${selected ? 30 : 24}px; border-radius: 50%; border: ${selected ? 4 : 2}px solid ${selected ? '#111827' : 'white'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [selected ? 30 : 24, selected ? 30 : 24],
    iconAnchor: [selected ? 15 : 12, selected ? 15 : 12],
    popupAnchor: [0, selected ? -15 : -12]
  });
};

function fmtMoney(v: number | undefined | null) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
}

function FitBounds({ points, selectedPoint }: { points: Array<[number, number]>; selectedPoint?: [number, number] | null }) {
  const map = useMap();

  const pointsKey = JSON.stringify(points);
  const selectedKey = selectedPoint ? JSON.stringify(selectedPoint) : '';

  useEffect(() => {
    if (!map) return;
    if (selectedPoint) {
      map.setView(selectedPoint, Math.max(map.getZoom(), 14), { animate: true });
      return;
    }
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 13, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [30, 30], animate: true });
  }, [map, pointsKey, selectedKey]);

  return null;
}

export default function MapaObras({ obras, selectedObraId }: MapaObrasProps) {
  // Dynamic import in the page already avoids SSR issues for Leaflet.

  // Filter obras with valid coordinates
  const validObras = obras.filter(
    (o) =>
      o.enderecoObra?.latitude &&
      o.enderecoObra?.longitude &&
      !isNaN(parseFloat(o.enderecoObra.latitude)) &&
      !isNaN(parseFloat(o.enderecoObra.longitude))
  );

  // Default center (Brazil approx or first obra)
  const defaultCenter: [number, number] = validObras.length > 0 
    ? [parseFloat(validObras[0].enderecoObra!.latitude!), parseFloat(validObras[0].enderecoObra!.longitude!)]
    : [-15.7801, -47.9292]; // Brasilia

  const points = validObras.map((o) => [parseFloat(o.enderecoObra!.latitude!), parseFloat(o.enderecoObra!.longitude!)] as [number, number]);
  const selectedPoint = (() => {
    if (typeof selectedObraId !== 'number') return null;
    const o = validObras.find((x) => x.id === selectedObraId);
    if (!o?.enderecoObra?.latitude || !o?.enderecoObra?.longitude) return null;
    return [parseFloat(o.enderecoObra.latitude), parseFloat(o.enderecoObra.longitude)] as [number, number];
  })();

  return (
    <div className="h-[600px] w-full rounded-lg overflow-hidden border shadow-sm z-0 relative">
      <MapContainer center={defaultCenter} zoom={5} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} selectedPoint={selectedPoint} />
        {validObras.map((obra) => {
            const lat = parseFloat(obra.enderecoObra!.latitude!);
            const lng = parseFloat(obra.enderecoObra!.longitude!);
            const color = STATUS_COLOR_MAP[obra.status] || "#3B82F6";
            const selected = typeof selectedObraId === 'number' && selectedObraId === obra.id;
            const total = typeof obra.valorAMedir === 'number' || typeof obra.valorMedido === 'number' ? Number(obra.valorMedido || 0) + Number(obra.valorAMedir || 0) : obra.valorPrevisto;
            const medido = obra.valorMedido;
            const aMedir = typeof obra.valorAMedir === 'number' ? obra.valorAMedir : typeof total === 'number' && typeof medido === 'number' ? total - medido : undefined;

            return (
                <Marker 
                    key={obra.id} 
                    position={[lat, lng]}
                    icon={createCustomIcon(color, selected)}
                >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1} sticky>
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-900">{obra.contratoNumero ? `Contrato: ${obra.contratoNumero}` : "Contrato"}</div>
                        <div className="text-xs text-gray-900">{obra.hoverTitle ? obra.hoverTitle : `#${obra.id} - ${obra.name}`}</div>
                        <div className="text-xs text-gray-700">{`Valor total: ${fmtMoney(total as any)}`}</div>
                        <div className="text-xs text-gray-700">{`Valor medido: ${fmtMoney(medido as any)}`}</div>
                        <div className="text-xs text-gray-700">{`Valor a medir: ${fmtMoney(aMedir as any)}`}</div>
                      </div>
                    </Tooltip>
                    <Popup>
                        <div className="p-2 min-w-[200px]">
                            <h3 className="font-bold text-gray-900 text-lg mb-1">{obra.name}</h3>
                            <div className="space-y-1 mb-3">
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 mr-2">
                                    ID: {obra.id}
                                </span>
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                                    {obra.type === 'PUBLICA' ? 'Pública' : 'Particular'}
                                </span>
                            </div>
                            
                            <div className="mb-3">
                                <span className="text-sm font-medium text-gray-500">Status:</span>
                                <div className="flex items-center mt-1">
                                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }}></div>
                                    <span className="text-sm text-gray-800">{STATUS_LABEL_MAP[obra.status] || obra.status}</span>
                                </div>
                            </div>
                            
                            {typeof total === 'number' ? (
                                <div className="mb-3">
                                    <span className="text-sm font-medium text-gray-500">Valor Total:</span>
                                    <div className="text-sm font-bold text-gray-800">
                                        {fmtMoney(total)}
                                    </div>
                                </div>
                            ) : null}

                            <a 
                                href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Abrir rota no Google Maps
                            </a>
                        </div>
                    </Popup>
                </Marker>
            )
        })}
      </MapContainer>
    </div>
  );
}
