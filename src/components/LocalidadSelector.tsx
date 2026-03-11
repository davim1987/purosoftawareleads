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

    const selectAllLocalidades = () => {
        setDraftLocalidades(allLocalidades);
    };

    const clearAllLocalidades = () => {
        setDraftLocalidades([]);
    };

    return (
        <div className="w-full">
            <button
                type="button"
                onClick={openModal}
                className="w-full px-4 py-3 rounded-2xl bg-blue-50/50 dark:bg-transparent text-blue-700 dark:text-gray-300 font-bold hover:bg-blue-100 dark:hover:bg-[#111827] transition-all border-none"
            >
                Seleccionar localidades ({localidades.length} de {totalAvailable})
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#0B0F19] rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
                        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">Seleccionar Localidades</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Seleccioná las localidades que querés incluir en la búsqueda.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="relative">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-base" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar localidad por nombre..."
                                    className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-100 dark:border-gray-800 bg-transparent text-base text-black dark:text-white font-medium placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                />
                            </div>

                            <div className="space-y-6">
                                {filteredByProvince.map(([provinceName, locs]) => (
                                    <div key={provinceName} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-transparent p-4">
                                        <p className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-400 mb-3">
                                            {provinceName}
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            {locs.map((loc) => {
                                                const isSelected = draftSet.has(loc);
                                                return (
                                                    <label
                                                        key={`${provinceName}-${loc}`}
                                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                                            ? 'border-blue-300 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200'
                                                            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 hover:border-blue-200 dark:hover:border-gray-600'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleLocalidad(loc)}
                                                            className="h-4 w-4 cursor-pointer accent-blue-600 dark:accent-blue-500 rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:checked:bg-blue-500"
                                                        />
                                                        <span className="text-sm font-medium">{loc}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {filteredByProvince.length === 0 && (
                                <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 font-medium">
                                    No encontramos localidades con ese nombre.
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#111827]/50 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                Seleccionadas: <span className="text-blue-600 dark:text-blue-400">{draftLocalidades.length}</span>
                            </p>
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-end overflow-x-auto pb-1 sm:pb-0 hide-scrollbar shrink-0">
                                <button
                                    type="button"
                                    onClick={selectAllLocalidades}
                                    className="px-4 py-2.5 rounded-xl border-2 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 whitespace-nowrap transition-colors"
                                >
                                    Seleccionar todas
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAllLocalidades}
                                    className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap transition-colors"
                                >
                                    Limpiar
                                </button>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={saveSelection}
                                    className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2 whitespace-nowrap transition-all"
                                >
                                    <FaCheck className="text-sm" />
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
