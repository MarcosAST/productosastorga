import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMapView,
  MapMouseEvent,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { extractLatLngFromText } from '../utils/ticketShare';

interface GoogleMapsLocationModalProps {
  isOpen: boolean;
  clientName: string;
  initialAddress?: string;
  onClose: () => void;
  onConfirmLocation: (formattedLocation: string) => void;
}

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };

function getMapsApiKey(): string {
  const viteKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof viteKey === 'string' && viteKey.trim()) return viteKey.trim();
  if (typeof __GOOGLE_MAPS_API_KEY__ === 'string' && __GOOGLE_MAPS_API_KEY__.trim()) {
    return __GOOGLE_MAPS_API_KEY__.trim();
  }
  return '';
}

function isQuotaError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err || '');
  return (
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('429') ||
    text.includes('QuotaExceeded') ||
    text.includes('OverQuotaMapError')
  );
}

function formatCoordsString(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

interface PlaceSearchProps {
  onSelectPlace: (info: {
    coords: { lat: number; lng: number };
    address: string;
    label: string;
    viewport?: google.maps.LatLngBounds | null;
  }) => void;
}

const PlaceAutocompleteBar: React.FC<PlaceSearchProps> = ({ onSelectPlace }) => {
  const placesLib = useMapsLibrary('places');
  const map = useMap();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        setSearchError('');
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        const res =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: sessionTokenRef.current,
          });
        setSuggestions(res.suggestions || []);
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSearchError('No se pudieron cargar sugerencias de Google Maps.');
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [placesLib, query]);

  const handlePickSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    try {
      setIsSearching(true);
      setSearchError('');
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'formattedAddress', 'displayName', 'viewport'],
      });

      const loc = place.location;
      if (!loc) {
        setSearchError('Este lugar no tiene coordenadas disponibles.');
        return;
      }

      const coords = { lat: loc.lat(), lng: loc.lng() };
      const address =
        place.formattedAddress ||
        place.displayName ||
        suggestion.placePrediction.text.text;

      if (map) {
        if (place.viewport) {
          map.fitBounds(place.viewport);
        } else {
          map.panTo(coords);
          map.setZoom(17);
        }
      }

      onSelectPlace({
        coords,
        address,
        label: place.displayName || address,
        viewport: place.viewport,
      });
      setQuery('');
      resetSession();
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setSearchError('No se pudo obtener la ubicación del lugar seleccionado.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-[#8C7E73] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tienda, calle o lugar en Google Maps..."
          className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white pl-10 pr-10 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-[var(--theme-primary)] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
        )}
      </div>

      {searchError && (
        <p className="text-xs text-red-700 mt-1.5">{searchError}</p>
      )}

      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-[#D8D1C7] bg-white shadow-xl z-20 divide-y divide-[#EFECE6]">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => handlePickSuggestion(s)}
                className="w-full px-3.5 py-2.5 text-left text-xs text-[#1F1A17] hover:bg-[var(--theme-tint)] flex items-start gap-2.5"
              >
                <MapPin className="w-4 h-4 text-[var(--theme-accent)] shrink-0 mt-0.5" />
                <span className="leading-snug">
                  {s.placePrediction?.text.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface InteractiveMapContentProps {
  selectedCoords: { lat: number; lng: number } | null;
  onCoordsSelected: (coords: { lat: number; lng: number }) => void;
  onPlaceSelected: (info: {
    coords: { lat: number; lng: number };
    address: string;
    label: string;
  }) => void;
  centerRequest: { coords: { lat: number; lng: number }; nonce: number } | null;
}

const InteractiveMapContent: React.FC<InteractiveMapContentProps> = ({
  selectedCoords,
  onCoordsSelected,
  onPlaceSelected,
  centerRequest,
}) => {
  const status = useApiLoadingStatus();
  const map = useMap();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [status]);

  useEffect(() => {
    if (!map || !centerRequest) return;
    map.panTo(centerRequest.coords);
    map.setZoom(17);
  }, [map, centerRequest]);

  const handleMapClick = (ev: MapMouseEvent) => {
    const latLng = ev.detail?.latLng;
    if (!latLng) return;
    onCoordsSelected({ lat: latLng.lat, lng: latLng.lng });
  };

  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
        <span>
          No se pudo cargar el mapa interactivo en este momento. Puedes usar el botón de <strong>Mi ubicación (GPS)</strong> o escribir la dirección manualmente abajo.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PlaceAutocompleteBar
        onSelectPlace={(info) =>
          onPlaceSelected({
            coords: info.coords,
            address: info.address,
            label: info.label,
          })
        }
      />

      <div className="w-full h-[300px] sm:h-[360px] rounded-xl overflow-hidden border border-[#D8D1C7] relative bg-[#F5F2EC]">
        <GoogleMapView
          mapId="DEMO_MAP_ID"
          defaultCenter={selectedCoords || DEFAULT_CENTER}
          defaultZoom={selectedCoords ? 16 : 5}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          {selectedCoords && (
            <AdvancedMarker
              position={selectedCoords}
              draggable
              onDragEnd={(e) => {
                const pos = e.latLng;
                if (pos) {
                  onCoordsSelected({ lat: pos.lat(), lng: pos.lng() });
                }
              }}
            >
              <Pin
                background="#D98218"
                borderColor="#4A2511"
                glyphColor="#FFFFFF"
              />
            </AdvancedMarker>
          )}
        </GoogleMapView>
      </div>
      <p className="text-[11px] text-[#8C7E73]">
        Toca el mapa, arrastra el pin o busca arriba para fijar el punto exacto en Google Maps.
      </p>
    </div>
  );
};

export const GoogleMapsLocationModal: React.FC<GoogleMapsLocationModalProps> = ({
  isOpen,
  clientName,
  initialAddress = '',
  onClose,
  onConfirmLocation,
}) => {
  const apiKey = getMapsApiKey();
  const initialParsedCoords = extractLatLngFromText(initialAddress);

  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(initialParsedCoords);
  const [placeAddress, setPlaceAddress] = useState<string>(() => {
    if (!initialAddress) return '';
    return initialAddress.replace(/\s*\(-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\)\s*$/, '').trim();
  });
  const [saveMode, setSaveMode] = useState<'combined' | 'coords' | 'address'>(
    'combined'
  );
  const [customLocationText, setCustomLocationText] = useState(initialAddress);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [centerRequest, setCenterRequest] = useState<{
    coords: { lat: number; lng: number };
    nonce: number;
  } | null>(null);

  // Sync state whenever modal opens for a different client
  useEffect(() => {
    if (!isOpen) return;
    const parsed = extractLatLngFromText(initialAddress);
    const cleanedAddr = initialAddress
      ? initialAddress
          .replace(/\s*\(-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\)\s*$/, '')
          .trim()
      : '';
    setSelectedCoords(parsed);
    setPlaceAddress(cleanedAddr === formatCoordsString(parsed?.lat ?? 0, parsed?.lng ?? 0) ? '' : cleanedAddr);
    setCustomLocationText(initialAddress);
    setSaveMode(cleanedAddr && parsed ? 'combined' : parsed ? 'coords' : 'combined');
    setGpsError('');
    if (parsed) {
      setCenterRequest({ coords: parsed, nonce: Date.now() });
    } else {
      setCenterRequest(null);
    }
  }, [isOpen, initialAddress]);

  const computeFormattedOutput = useCallback(
    (
      coords: { lat: number; lng: number } | null,
      address: string,
      mode: 'combined' | 'coords' | 'address'
    ): string => {
      const coordStr = coords ? formatCoordsString(coords.lat, coords.lng) : '';
      const cleanAddr = address.trim();
      if (mode === 'coords') return coordStr || cleanAddr;
      if (mode === 'address') return cleanAddr || coordStr;
      if (cleanAddr && coordStr) {
        return `${cleanAddr} (${coordStr})`;
      }
      return coordStr || cleanAddr;
    },
    []
  );

  const handleCoordsSelected = (coords: { lat: number; lng: number }) => {
    setSelectedCoords(coords);
    setGpsError('');
    const nextMode = placeAddress ? saveMode : 'coords';
    setSaveMode(nextMode);
    setCustomLocationText(computeFormattedOutput(coords, placeAddress, nextMode));
  };

  const handlePlaceSelected = (info: {
    coords: { lat: number; lng: number };
    address: string;
    label: string;
  }) => {
    setSelectedCoords(info.coords);
    setPlaceAddress(info.address);
    setSaveMode('combined');
    setGpsError('');
    setCustomLocationText(
      computeFormattedOutput(info.coords, info.address, 'combined')
    );
  };

  const handleChangeSaveMode = (nextMode: 'combined' | 'coords' | 'address') => {
    setSaveMode(nextMode);
    setCustomLocationText(
      computeFormattedOutput(selectedCoords, placeAddress, nextMode)
    );
  };

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Tu dispositivo o navegador no soporta geolocalización GPS.');
      return;
    }
    setIsLocatingGps(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setSelectedCoords(coords);
        setCenterRequest({ coords, nonce: Date.now() });
        const nextMode = placeAddress ? saveMode : 'coords';
        setSaveMode(nextMode);
        setCustomLocationText(
          computeFormattedOutput(coords, placeAddress, nextMode)
        );
        setIsLocatingGps(false);
      },
      (err) => {
        setIsLocatingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(
            'Permiso de ubicación denegado. Activa el GPS para este sitio en los ajustes del navegador.'
          );
        } else {
          setGpsError('No se pudo obtener tu ubicación actual. Intenta de nuevo.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  if (!isOpen) return null;

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#EFECE6]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-tint)] text-[var(--theme-primary)]">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-[#1F1A17] truncate">
                Ubicación en Google Maps
              </h3>
              <p className="text-xs text-[#6E6259] truncate">
                Cliente: <strong className="text-[#1F1A17]">{clientName || 'Nuevo cliente'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={isLocatingGps}
              onClick={handleUseCurrentGps}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-[var(--theme-primary)]/30 bg-[var(--theme-tint)] px-3.5 py-2 text-xs font-bold text-[var(--theme-primary)] hover:opacity-90 disabled:opacity-60"
            >
              {isLocatingGps ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              <span>
                {isLocatingGps ? 'Obteniendo GPS...' : 'Usar mi ubicación actual (GPS)'}
              </span>
            </button>

            {selectedCoords && (
              <span className="text-xs font-mono text-[#6E6259] bg-[#FAF8F5] border border-[#E7E3DC] px-2.5 py-1.5 rounded-lg">
                {formatCoordsString(selectedCoords.lat, selectedCoords.lng)}
              </span>
            )}
          </div>

          {gpsError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{gpsError}</span>
            </div>
          )}

          {apiKey && isOnline ? (
            <APIProvider
              apiKey={apiKey}
              language="es"
              region="MX"
              libraries={['places', 'marker']}
            >
              <InteractiveMapContent
                selectedCoords={selectedCoords}
                onCoordsSelected={handleCoordsSelected}
                onPlaceSelected={handlePlaceSelected}
                centerRequest={centerRequest}
              />
            </APIProvider>
          ) : (
            <div className="rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#6E6259] space-y-1">
              <p className="font-semibold text-[#1F1A17]">
                {!isOnline
                  ? 'Sin conexión a internet para cargar el mapa visual.'
                  : 'Mapa interactivo pendiente de clave de API.'}
              </p>
              <p>
                Puedes capturar las coordenadas exactas tocando <strong>Usar mi ubicación actual (GPS)</strong> o escribir la referencia abajo.
              </p>
            </div>
          )}

          {selectedCoords && placeAddress && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#6E6259] mr-1">
                Formato a guardar:
              </span>
              <button
                type="button"
                onClick={() => handleChangeSaveMode('combined')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  saveMode === 'combined'
                    ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                    : 'bg-white text-[#49403A] border-[#D8D1C7]'
                }`}
              >
                Dirección + GPS
              </button>
              <button
                type="button"
                onClick={() => handleChangeSaveMode('coords')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  saveMode === 'coords'
                    ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                    : 'bg-white text-[#49403A] border-[#D8D1C7]'
                }`}
              >
                Solo coordenadas
              </button>
              <button
                type="button"
                onClick={() => handleChangeSaveMode('address')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  saveMode === 'address'
                    ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                    : 'bg-white text-[#49403A] border-[#D8D1C7]'
                }`}
              >
                Solo dirección
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1">
              Ubicación que se guardará en el cliente
            </label>
            <input
              type="text"
              value={customLocationText}
              onChange={(e) => setCustomLocationText(e.target.value)}
              placeholder="Selecciona en Google Maps, usa GPS o escribe la dirección..."
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-[#8C7E73]">
            Ubicación integrada con Google Maps
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!customLocationText.trim()}
              onClick={() => {
                if (!customLocationText.trim()) return;
                onConfirmLocation(customLocationText.trim());
              }}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-5 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Guardar ubicación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
