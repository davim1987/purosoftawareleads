import React, { useState, useMemo } from 'react';
import { FaSearch, FaMapMarkerAlt, FaTimes, FaCheck, FaLayerGroup } from 'react-icons/fa';

interface LocalidadSelectorProps {
    localidadesPorZona: Record<string, string[]>;
    localidades: string[]; // Seleccionadas
    onToggle: (loc: string) => void;
    onClearAll?: () => void;
}

const LocalidadSelector: React.FC<LocalidadSelectorProps> = ({
    localidadesPorZona,
    localidades,
    onToggle,
    onClearAll
}) => {
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const MAX_SELECTION = 10;
    const isLimitReached = localidades.length >= MAX_SELECTION;

    // Helper to get selected count per zone
    const getCountInZone = (zoneLocs: string[]) => {
        return zoneLocs.filter(loc => localidades.includes(loc)).length;
    };

    // Filtered localities in the open bottom sheet
    const filteredLocalities = useMemo(() => {
        if (!selectedZone) return [];
        const zoneLocs = localidadesPorZona[selectedZone] || [];
        if (!searchTerm) return zoneLocs;
        return zoneLocs.filter(loc => loc.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [selectedZone, searchTerm, localidadesPorZona]);

    const handleSelectAllZone = () => {
        if (!selectedZone) return;
        const zoneLocs = localidadesPorZona[selectedZone] || [];
        const notSelected = zoneLocs.filter(loc => !localidades.includes(loc));

        // Add as many as possible up to 10
        const availableSlots = MAX_SELECTION - localidades.length;
        const toAdd = notSelected.slice(0, availableSlots);

        toAdd.forEach(loc => onToggle(loc));
    };

    const isAllZoneSelected = useMemo(() => {
        if (!selectedZone) return false;
        const zoneLocs = localidadesPorZona[selectedZone] || [];
        return zoneLocs.every(loc => localidades.includes(loc));
    }, [selectedZone, localidadesPorZona, localidades]);

    return (
        <div className="w-full space-y-4">
            {/* STEP 1: ZONE GRID */}
            <div className="grid grid-cols-2 gap-3">
                {Object.entries(localidadesPorZona).map(([zoneName, zoneLocs]) => {
                    const selectedCount = getCountInZone(zoneLocs);
                    const hasSelection = selectedCount > 0;

                    return (
                        <button
                            key={zoneName}
                            onClick={() => setSelectedZone(zoneName)}
                            className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-200 min-h-[110px] active:scale-95 ${hasSelection
                                ? 'bg-blue-50 border-blue-500 shadow-md'
                                : 'bg-white border-gray-100 hover:border-blue-200'
                                }`}
                        >
                            {hasSelection && (
                                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-scale-up">
                                    {selectedCount}
                                </span>
                            )}
                            <div className="p-3 rounded-full bg-gray-50 mb-2">
                                <FaLayerGroup className={`text-xl ${hasSelection ? 'text-blue-600' : 'text-gray-400'}`} />
                            </div>
                            <span className={`text-[11px] font-black uppercase tracking-tighter text-center leading-tight ${hasSelection ? 'text-blue-900' : 'text-gray-600'}`}>
                                {zoneName}
                            </span>
                            <span className="text-[9px] text-gray-400 mt-1 font-medium italic">
                                {zoneLocs.length} localidades
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* STEP 2: BOTTOM SHEET */}
            {selectedZone && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm animate-fade-in"
                        onClick={() => setSelectedZone(null)}
                    />

                    {/* Sheet Content */}
                    <div className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-[32px] shadow-2xl flex flex-col transition-transform duration-300 animate-slide-up max-h-[85vh]">
                        {/* Drag Handle Indicator */}
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3" />

                        {/* Header */}
                        <div className="px-6 pb-4 border-b border-gray-50">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">{selectedZone}</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{localidadesPorZona[selectedZone].length} LOCALIDADES DISPONIBLES</p>
                                </div>
                                <button
                                    onClick={() => setSelectedZone(null)}
                                    className="p-3 bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 active:scale-90 transition"
                                >
                                    <FaTimes />
                                </button>
                            </div>

                            {/* Internal Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={`Buscar en ${selectedZone}...`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500/30 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all"
                                />
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                            </div>

                            {/* Select All Action */}
                            <div className="mt-4 flex items-center justify-between">
                                {(() => {
                                    const zoneLocs = localidadesPorZona[selectedZone] || [];
                                    const notSelected = zoneLocs.filter(loc => !localidades.includes(loc));
                                    const willExceedLimit = !isAllZoneSelected && (localidades.length + notSelected.length > MAX_SELECTION);
                                    const isDisabled = willExceedLimit || (isLimitReached && !isAllZoneSelected);

                                    return (
                                        <button
                                            onClick={handleSelectAllZone}
                                            disabled={isDisabled}
                                            className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors ${isAllZoneSelected
                                                ? 'text-blue-600'
                                                : (isDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-blue-600')
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isAllZoneSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200'
                                                }`}>
                                                {isAllZoneSelected && <FaCheck className="text-[10px]" />}
                                            </div>
                                            Seleccionar toda la zona
                                        </button>
                                    );
                                })()}
                                <span className="text-[10px] font-black text-gray-300 italic">MÁX 10 TOTAL</span>
                            </div>
                        </div>

                        {/* Localities Chips Area */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                            <div className="flex flex-wrap gap-2.5">
                                {filteredLocalities.map(loc => {
                                    const isSelected = localidades.includes(loc);
                                    const disabled = !isSelected && isLimitReached;

                                    return (
                                        <button
                                            key={loc}
                                            onClick={() => onToggle(loc)}
                                            disabled={disabled}
                                            className={`px-5 py-3 rounded-2xl text-xs font-bold transition-all duration-200 flex items-center gap-2 border-2 active:scale-95 ${isSelected
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30'
                                                : (disabled ? 'bg-gray-50 border-gray-50 text-gray-300 opacity-50' : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/50')
                                                }`}
                                        >
                                            {isSelected && <FaCheck className="animate-scale-up" />}
                                            {loc}
                                        </button>
                                    );
                                })}
                                {filteredLocalities.length === 0 && (
                                    <div className="w-full text-center py-10">
                                        <p className="text-sm font-bold text-gray-400 italic">No se encontraron localidades.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sticky Footer */}
                        <div className="p-6 pb-10 bg-white border-t border-gray-50 flex items-center gap-4">
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] mb-1">Tu selección</p>
                                <p className="text-lg font-black text-blue-900">
                                    {localidades.length} <span className="text-gray-300">/ 10</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedZone(null)}
                                className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-transform"
                            >
                                LISTO
                            </button>
                        </div>
                    </div>
                </>
            )}

            <style jsx>{`
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default LocalidadSelector;
