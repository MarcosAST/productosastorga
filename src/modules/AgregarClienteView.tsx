import React, { useState } from 'react';
import { UserPlus, CheckCircle2, MapPin } from 'lucide-react';
import { BusinessDataset, Cliente } from '../types/business';
import { PendingMutation } from '../components/ConfirmMutationModal';
import { GoogleMapsLocationModal } from '../components/GoogleMapsLocationModal';

interface AgregarClienteViewProps {
  dataset: BusinessDataset;
  clientesTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onSaveCliente: (
    cliente: Omit<Cliente, 'id' | 'fechaRegistro'>,
    newRutaNombre?: string
  ) => Promise<Cliente>;
}

export const AgregarClienteView: React.FC<AgregarClienteViewProps> = ({
  dataset,
  clientesTabName,
  onRequestMutation,
  onSaveCliente,
}) => {
  const [nombre, setNombre] = useState('');
  const [useNewRuta, setUseNewRuta] = useState(dataset.rutas.length === 0);
  const [rutaSeleccionada, setRutaSeleccionada] = useState(dataset.rutas[0]?.nombre || '');
  const [nuevaRuta, setNuevaRuta] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [showMapsPicker, setShowMapsPicker] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rutaFinal = useNewRuta ? nuevaRuta.trim() : rutaSeleccionada.trim();
    if (!nombre.trim() || !rutaFinal) return;

    onRequestMutation({
      title: 'Registrar nuevo cliente',
      description: useNewRuta
        ? 'Se creará la nueva ruta y se guardará el cliente en Google Sheets.'
        : 'Se agregará el cliente a la hoja de Google Sheets.',
      sheetTab: clientesTabName,
      details: [
        { label: 'Nombre', value: nombre.trim() },
        { label: 'Ruta asignada', value: rutaFinal },
        { label: 'Teléfono', value: telefono.trim() || 'No especificado' },
      ],
      confirmLabel: 'Guardar cliente',
      onConfirm: async () => {
        const created = await onSaveCliente(
          {
            nombre: nombre.trim(),
            ruta: rutaFinal,
            telefono: telefono.trim(),
            direccion: direccion.trim(),
            notas: notas.trim(),
          },
          useNewRuta ? rutaFinal : undefined
        );
        setSavedNotice(`Cliente "${created.nombre}" registrado en ${created.ruta}.`);
        setNombre('');
        setTelefono('');
        setDireccion('');
        setNotas('');
        if (useNewRuta) {
          setRutaSeleccionada(rutaFinal);
          setNuevaRuta('');
          setUseNewRuta(false);
        }
      },
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F1A17]">Agregar clientes</h1>
        <p className="text-sm text-[#6E6259]">
          Registra nuevos clientes y asígnalos a una ruta existente o crea una ruta nueva al instante.
        </p>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white border border-[#E7E3DC] p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-[#6E6259] mb-1.5">
            Nombre del cliente o tienda *
          </label>
          <input
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Abarrotes La Guadalupana / Don José"
            className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[#6E6259]">Ruta *</label>
            <button
              type="button"
              onClick={() => setUseNewRuta((v) => !v)}
              className="text-xs font-semibold text-[#D98218] hover:underline"
            >
              {useNewRuta ? 'Usar ruta existente' : '+ Crear ruta nueva'}
            </button>
          </div>
          {useNewRuta ? (
            <input
              type="text"
              required
              value={nuevaRuta}
              onChange={(e) => setNuevaRuta(e.target.value)}
              placeholder="Nombre de la nueva ruta"
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            />
          ) : (
            <select
              required
              value={rutaSeleccionada}
              onChange={(e) => setRutaSeleccionada(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            >
              <option value="">Selecciona una ruta...</option>
              {dataset.rutas.map((r) => (
                <option key={r.id} value={r.nombre}>
                  {r.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1.5">
              Teléfono / WhatsApp
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej. 222 123 4567"
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#6E6259]">
                Dirección o ubicación
              </label>
              <button
                type="button"
                onClick={() => setShowMapsPicker(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-primary)] hover:underline"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Tomar de Google Maps</span>
              </button>
            </div>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, colonia o ubicación de Maps"
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#6E6259] mb-1.5">
            Notas (opcional)
          </label>
          <textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Días de visita, preferencia de empaque..."
            className="w-full rounded-xl border border-[#D8D1C7] p-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-6 py-2.5 text-sm font-bold text-white hover:bg-[var(--theme-primary-hover)] transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Guardar cliente en Google Sheets</span>
          </button>
        </div>
      </form>

      <GoogleMapsLocationModal
        isOpen={showMapsPicker}
        clientName={nombre.trim() || 'Nuevo cliente'}
        initialAddress={direccion}
        onClose={() => setShowMapsPicker(false)}
        onConfirmLocation={(chosen) => {
          setDireccion(chosen);
          setShowMapsPicker(false);
        }}
      />
    </div>
  );
};
