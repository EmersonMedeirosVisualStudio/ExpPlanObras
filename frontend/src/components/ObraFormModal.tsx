
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface ObraFormData {
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  latitude?: string;
  longitude?: string;
  description?: string;
  valorPrevisto?: number;
  link?: string;
}

interface ObraFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ObraFormData) => Promise<void>;
  initialData?: ObraFormData;
  title: string;
}

export function ObraFormModal({ isOpen, onClose, onSubmit, initialData, title }: ObraFormModalProps) {
  const [formData, setFormData] = useState<ObraFormData>({
    name: '',
    type: 'PARTICULAR',
    status: 'NAO_INICIADA',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    latitude: '',
    longitude: '',
    description: '',
    valorPrevisto: 0,
    link: ''
  });
  const [loading, setLoading] = useState(false);

  const handleLinkParse = async () => {
    if (!formData.link) return;
    
    // Try to extract coordinates from URL (Google Maps style)
    // Regex for @lat,long
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = formData.link.match(regex);
    
    let lat = '';
    let lon = '';

    if (match) {
        lat = match[1];
        lon = match[2];
    } else {
        // Fallback: try searching "lat=" or "q="
        // This is heuristic and might not work for all links
        // If we can't find coords, we can't do much without a backend proxy or API key
        // For now, let's assume if we can't parse, we alert user
        
        // Try searching for generic coordinate pattern anywhere
        const broadRegex = /(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/;
        const broadMatch = formData.link.match(broadRegex);
        if (broadMatch) {
            lat = broadMatch[1];
            lon = broadMatch[2];
        }
    }

    if (lat && lon) {
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));
        
        // Fetch address from Nominatim (OpenStreetMap)
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            
            if (data && data.address) {
                setFormData(prev => ({
                    ...prev,
                    logradouro: data.address.road || data.address.street || '',
                    numero: data.address.house_number || '',
                    bairro: data.address.suburb || data.address.neighbourhood || '',
                    cidade: data.address.city || data.address.town || data.address.village || '',
                    uf: data.address.state || '',
                    // Keep existing values if API returns empty
                    latitude: lat,
                    longitude: lon
                }));
            }
        } catch (err) {
            console.error("Error fetching address details", err);
            // Non-blocking error, user can fill manually
        }
    } else {
        alert("Não foi possível identificar as coordenadas no link. Tente inserir manualmente.");
    }
  };

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        name: '',
        type: 'PARTICULAR',
        status: 'NAO_INICIADA',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        latitude: '',
        longitude: ''
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar obra');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Obra *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Obra *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as ObraFormData['type'] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PUBLICA">Pública</option>
              <option value="PARTICULAR">Particular</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status da Obra *</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as ObraFormData['status'] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="AGUARDANDO_RECURSOS">Aguardando recursos</option>
              <option value="AGUARDANDO_CONTRATO">Aguardando assinatura do contrato</option>
              <option value="AGUARDANDO_OS">Aguardando OS</option>
              <option value="NAO_INICIADA">Não iniciada</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="PARADA">Parada</option>
              <option value="FINALIZADA">Finalizada</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link da Localização (Google Maps)</label>
            <div className="flex gap-2">
                <input
                type="text"
                value={formData.link || ''}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="Cole o link aqui para buscar endereço"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="button"
                    onClick={handleLinkParse}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium"
                >
                    Buscar
                </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Busca automática de Rua, Bairro, Cidade e Coordenadas.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Detalhado</label>
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Rua</label>
                    <input
                        type="text"
                        value={formData.logradouro || ''}
                        onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Número</label>
                    <input
                        type="text"
                        value={formData.numero || ''}
                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bairro</label>
                    <input
                        type="text"
                        value={formData.bairro || ''}
                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cidade</label>
                    <input
                        type="text"
                        value={formData.cidade || ''}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                    <input
                        type="text"
                        value={formData.uf || ''}
                        onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                <input
                    type="text"
                    value={formData.latitude || ''}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="-23.550520"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                <input
                    type="text"
                    value={formData.longitude || ''}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="-46.633308"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
