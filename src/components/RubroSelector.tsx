'use client';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    FaPizzaSlice, FaHamburger, FaUtensils, FaWrench, FaCut,
    FaBuilding, FaPaw, FaBalanceScale, FaCalculator, FaPills,
    FaTooth, FaDumbbell, FaBolt, FaEllipsisH, FaChevronLeft,
    FaChevronRight, FaTimes, FaCheck, FaFaucet,
} from 'react-icons/fa';
import { GiSlicedBread } from 'react-icons/gi';

const RUBROS = [
    { id: 'panaderia', label: 'Panaderia', icon: GiSlicedBread },
    { id: 'pizzeria', label: 'Pizzeria', icon: FaPizzaSlice },
    { id: 'hamburgueseria', label: 'Hamburguesas', icon: FaHamburger },
    { id: 'restaurante', label: 'Restaurante', icon: FaUtensils },
    { id: 'mecanico', label: 'Mecanico', icon: FaWrench },
    { id: 'peluqueria', label: 'Peluqueria', icon: FaCut },
    { id: 'inmobiliaria', label: 'Inmobiliaria', icon: FaBuilding },
    { id: 'veterinaria', label: 'Veterinaria', icon: FaPaw },
    { id: 'abogados', label: 'Abogados', icon: FaBalanceScale },
    { id: 'contador', label: 'Contador', icon: FaCalculator },
    { id: 'farmacia', label: 'Farmacia', icon: FaPills },
    { id: 'dentista', label: 'Dentista', icon: FaTooth },
    { id: 'gimnasio', label: 'Gimnasio', icon: FaDumbbell },
    { id: 'electricista', label: 'Electricista', icon: FaBolt },
    { id: 'plomero', label: 'Plomero', icon: FaFaucet },
    { id: 'otro', label: 'Otro', icon: FaEllipsisH },
];

interface RubroSelectorProps {
    value: string;
    onChange: (rubro: string) => void;
}

export default function RubroSelector({ value, onChange }: RubroSelectorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [centerIndex, setCenterIndex] = useState(0);
    const [showOtroModal, setShowOtroModal] = useState(false);
    const [otroText, setOtroText] = useState('');
    const prevCenterRef = useRef(0);

    // Find the selected rubro index
    const selectedIndex = RUBROS.findIndex(r => r.id === value || r.label.toLowerCase() === value.toLowerCase());
    const isCustomRubro = !!value && selectedIndex === -1;

    // Scroll to selected rubro on mount
    useEffect(() => {
        if (!containerRef.current) return;
        const targetIdx = selectedIndex >= 0 ? selectedIndex : (isCustomRubro ? RUBROS.length - 1 : 0);
        const items = containerRef.current.querySelectorAll<HTMLElement>('[data-rubro-item]');
        const target = items[targetIdx];
        if (target) {
            setTimeout(() => {
                target.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
            }, 100);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle scroll to detect center item
    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const center = container.scrollLeft + container.offsetWidth / 2;
        const items = container.querySelectorAll<HTMLElement>('[data-rubro-item]');
        let closest = 0;
        let minDist = Infinity;
        items.forEach((item, i) => {
            const itemCenter = item.offsetLeft + item.offsetWidth / 2;
            const dist = Math.abs(center - itemCenter);
            if (dist < minDist) { minDist = dist; closest = i; }
        });
        if (closest !== prevCenterRef.current) {
            prevCenterRef.current = closest;
            setCenterIndex(closest);
        }
    }, []);

    // Arrow scroll
    const scrollTo = (direction: 'left' | 'right') => {
        const newIndex = direction === 'left'
            ? Math.max(0, centerIndex - 1)
            : Math.min(RUBROS.length - 1, centerIndex + 1);
        const container = containerRef.current;
        if (!container) return;
        const items = container.querySelectorAll<HTMLElement>('[data-rubro-item]');
        const target = items[newIndex];
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    };

    // Select a rubro
    const selectRubro = (rubro: typeof RUBROS[number], index: number) => {
        if (rubro.id === 'otro') {
            setOtroText(isCustomRubro ? value : '');
            setShowOtroModal(true);
            return;
        }
        onChange(rubro.id);
        localStorage.setItem('selected_rubro', rubro.id);
        const container = containerRef.current;
        if (container) {
            const items = container.querySelectorAll<HTMLElement>('[data-rubro-item]');
            items[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    };

    // Confirm custom rubro
    const confirmOtro = () => {
        if (!otroText.trim()) return;
        onChange(otroText.trim());
        localStorage.setItem('selected_rubro', otroText.trim());
        setShowOtroModal(false);
    };

    // Check if item is selected
    const isSelected = (rubro: typeof RUBROS[number]) => {
        if (rubro.id === 'otro') return isCustomRubro;
        return rubro.id === value || rubro.label.toLowerCase() === value.toLowerCase();
    };

    return (
        <div className="text-center">
            <label className="block text-sm font-black tracking-wide text-gray-700 dark:text-gray-300 uppercase mb-4">
                Rubro
            </label>

            <div className="relative flex items-center justify-center">
                {/* Left Arrow - desktop only */}
                <button
                    onClick={() => scrollTo('left')}
                    className="hidden md:flex absolute left-0 z-20 w-10 h-10 items-center justify-center rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-90"
                    aria-label="Anterior rubro"
                >
                    <FaChevronLeft className="text-sm" />
                </button>

                {/* Carousel */}
                <div
                    ref={containerRef}
                    onScroll={handleScroll}
                    className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide touch-pan-x py-6 w-full md:mx-12"
                    style={{ paddingLeft: 'calc(50% - 3rem)', paddingRight: 'calc(50% - 3rem)' }}
                >
                    {RUBROS.map((rubro, i) => {
                        const Icon = rubro.icon;
                        const isCentered = centerIndex === i;
                        const selected = isSelected(rubro);

                        return (
                            <div
                                key={rubro.id}
                                data-rubro-item=""
                                data-index={i}
                                onClick={() => selectRubro(rubro, i)}
                                className={`
                                    snap-center shrink-0 flex flex-col items-center justify-center cursor-pointer
                                    w-20 h-24 md:w-24 md:h-28 rounded-2xl
                                    transition-all duration-300 ease-out select-none
                                    ${isCentered
                                        ? 'scale-125 opacity-100'
                                        : Math.abs(centerIndex - i) === 1
                                            ? 'scale-100 opacity-70'
                                            : 'scale-85 opacity-40'
                                    }
                                    ${selected
                                        ? 'bg-gradient-to-b from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-300 dark:ring-amber-400'
                                        : 'bg-white dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 shadow-md border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'
                                    }
                                `}
                            >
                                <Icon className={`text-2xl md:text-3xl mb-1 transition-all duration-300 ${isCentered ? 'scale-110' : ''}`} />
                                <span className={`text-[10px] md:text-xs font-bold leading-tight text-center px-1 ${selected ? 'text-white' : ''}`}>
                                    {rubro.id === 'otro' && isCustomRubro ? value : rubro.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Right Arrow - desktop only */}
                <button
                    onClick={() => scrollTo('right')}
                    className="hidden md:flex absolute right-0 z-20 w-10 h-10 items-center justify-center rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-90"
                    aria-label="Siguiente rubro"
                >
                    <FaChevronRight className="text-sm" />
                </button>
            </div>

            {/* Helper text */}
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-500">
                {value
                    ? <>Rubro seleccionado: <span className="text-amber-600 dark:text-amber-400 font-bold">{value}</span></>
                    : 'Desliza y selecciona un rubro'
                }
            </p>

            {/* Modal "Otro" */}
            {showOtroModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowOtroModal(false)}>
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">Rubro personalizado</h3>
                            <button
                                onClick={() => setShowOtroModal(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                <FaTimes className="text-gray-400" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={otroText}
                            onChange={(e) => setOtroText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmOtro()}
                            placeholder="Ej: lavadero, floreria, cerrajeria..."
                            autoFocus
                            className="w-full rounded-2xl border-2 border-blue-200 dark:border-gray-700 bg-blue-50/50 dark:bg-[#0B0F19] px-5 py-4 text-center text-lg font-bold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:border-amber-500 dark:focus:border-amber-500 focus:ring-4 focus:ring-amber-100 dark:focus:ring-amber-900/30"
                        />
                        <button
                            onClick={confirmOtro}
                            disabled={!otroText.trim()}
                            className="mt-4 w-full py-3 rounded-2xl font-black text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
                        >
                            <FaCheck /> Confirmar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
