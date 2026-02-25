import React, { useMemo, useState } from 'react';
import { FaSearch, FaTimes, FaCheck } from 'react-icons/fa';

interface LocalidadSelectorProps {
    localidadesPorZona: Record<string, string[]>;
    localidades: string[];
    onSave: (localidades: string[]) => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

const LocalidadSelector: React.FC<LocalidadSelectorProps> = ({
    localidadesPorZona,
    localidades,
    onSave,
    isOpen,
    onOpenChange
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [draftLocalidades, setDraftLocalidades] = useState<string[]>(localidades);

    const provinceEntries = useMemo(() => Object.entries(localidadesPorZona), [localidadesPorZona]);
    const allLocalidades = useMemo(() => provinceEntries.flatMap(([, locs]) => locs).filter(Boolean), [provinceEntries]);
    const totalAvailable = allLocalidades.length;

    const openModal = () => {
        setDraftLocalidades(localidades);
        setSearchTerm('');
        onOpenChange(true);
    };

    const closeModal = () => {
        setDraftLocalidades(localidades);
        setSearchTerm('');
        onOpenChange(false);
    };

    const saveSelection = () => {
        onSave(draftLocalidades);
        setSearchTerm('');
        onOpenChange(false);
    };

    const draftSet = useMemo(() => new Set(draftLocalidades), [draftLocalidades]);
    const normalizedSearch = normalizeText(searchTerm);

    const filteredByProvince = useMemo(() => {
        if (!normalizedSearch) return provinceEntries;

        return provinceEntries
            .map(([provinceName, locs]) => [
                provinceName,
                locs.filter((loc) => normalizeText(loc).includes(normalizedSearch))
            ] as [string, string[]])
            .filter(([, locs]) => locs.length > 0);
    }, [provinceEntries, normalizedSearch]);

    const toggleLocalidad = (loc: string) => {
        setDraftLocalidades((prev) => (
            prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]
        ));
    };

    return (
        <div className="w-full">
            <button
                type="button"
                onClick={openModal}
                className="w-full px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition"
            >
                Seleccionar localidades ({localidades.length} de {totalAvailable})
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Seleccionar Localidades</h3>
                                <p className="text-xs text-gray-500">
                                    Seleccioná las localidades que querés incluir en la búsqueda.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 rounded-full bg-gray-100 text-gray-500 hover:text-gray-700"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar localidad por nombre..."
                                    className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 outline-none focus:border-blue-400"
                                />
                            </div>

                            <div className="space-y-4">
                                {filteredByProvince.map(([provinceName, locs]) => (
                                    <div key={provinceName} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                                        <p className="text-xs font-black uppercase tracking-wide text-gray-600 mb-2">
                                            {provinceName}
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            {locs.map((loc) => {
                                                const isSelected = draftSet.has(loc);
                                                return (
                                                    <label
                                                        key={`${provinceName}-${loc}`}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                                            isSelected
                                                                ? 'border-blue-300 bg-blue-50 text-blue-900'
                                                                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleLocalidad(loc)}
                                                            className="h-4 w-4 cursor-pointer accent-blue-600"
                                                        />
                                                        <span className="text-sm">{loc}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {filteredByProvince.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                                    No encontramos localidades con ese nombre.
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-gray-700">
                                Seleccionadas: {draftLocalidades.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={saveSelection}
                                    className="px-5 py-2 rounded-lg bg-blue-600 text-white font-black hover:bg-blue-700 flex items-center gap-2"
                                >
                                    <FaCheck className="text-xs" />
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocalidadSelector;
