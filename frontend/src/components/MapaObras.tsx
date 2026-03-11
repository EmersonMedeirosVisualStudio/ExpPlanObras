
'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
  address?: string;
  latitude?: string;
  longitude?: string;
  valorPrevisto?: number;
}

interface MapaObrasProps {
  obras: Obra[];
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

const createCustomIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

export default function MapaObras({ obras }: MapaObrasProps) {
  // Dynamic import in the page already avoids SSR issues for Leaflet.

  // Filter obras with valid coordinates
  const validObras = obras.filter(o => o.latitude && o.longitude && !isNaN(parseFloat(o.latitude)) && !isNaN(parseFloat(o.longitude)));

  // Default center (Brazil approx or first obra)
  const defaultCenter: [number, number] = validObras.length > 0 
    ? [parseFloat(validObras[0].latitude!), parseFloat(validObras[0].longitude!)]
    : [-15.7801, -47.9292]; // Brasilia

  return (
    <div className="h-[600px] w-full rounded-lg overflow-hidden border shadow-sm z-0 relative">
      <MapContainer center={defaultCenter} zoom={5} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validObras.map((obra) => {
            const lat = parseFloat(obra.latitude!);
            const lng = parseFloat(obra.longitude!);
            const color = STATUS_COLOR_MAP[obra.status] || "#3B82F6";

            return (
                <Marker 
                    key={obra.id} 
                    position={[lat, lng]}
                    icon={createCustomIcon(color)}
                >
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
                            
                            {obra.valorPrevisto && (
                                <div className="mb-3">
                                    <span className="text-sm font-medium text-gray-500">Valor Previsto:</span>
                                    <div className="text-sm font-bold text-gray-800">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(obra.valorPrevisto)}
                                    </div>
                                </div>
                            )}

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
