'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { PROVINCIAS, LOCALIDADES } from '@/lib/data';
import { FaWhatsapp, FaEnvelope, FaSearch, FaCheck, FaExclamationTriangle, FaCreditCard } from 'react-icons/fa';
import { BiCheckShield } from 'react-icons/bi';
import MercadoPagoButton from '@/components/MercadoPagoButton';

interface Lead {
    id: string;
    nombre: string;
    rubro: string;
    direccion: string | null;
    email: string | null;
    whatsapp: string | null;
    web: string | null;
    localidad: string;
    instagram?: string;
    facebook?: string;
    telefono2?: string;
    isWhatsappValid: boolean;
}

// Payment Modal Component
function PaymentModal({ totalAvailable, onClose, onPay }: { totalAvailable: number, onClose: () => void, onPay: (email: string, quantity: number) => void }) {
    const [email, setEmail] = useState('');
    const [quantity, setQuantity] = useState(totalAvailable);

    const pricePerContact = 100;
    const total = quantity * pricePerContact;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold transition"
                >
                    &times;
                </button>

                <h3 className="text-2xl font-extrabold text-gray-900 mb-2 text-center">Configurar Compra</h3>
                <p className="text-gray-500 mb-6 text-center text-sm">
                    Selecciona la cantidad de contactos que deseas descargar.
                </p>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Cantidad de contactos (Máx: {totalAvailable})</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="1"
                                max={totalAvailable}
                                value={quantity}
                                onChange={(e) => {
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 1;
                                    if (val > totalAvailable) val = totalAvailable;
                                    if (val < 1) val = 1;
                                    setQuantity(val);
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button
                                onClick={() => setQuantity(totalAvailable)}
                                className="text-xs text-blue-600 underline whitespace-nowrap"
                            >
                                Todos
                            </button>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                        <span className="text-blue-900 font-medium">Total a pagar:</span>
                        <span className="text-2xl font-bold text-blue-700">$ {total.toLocaleString()}</span>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tu Email o WhatsApp</label>
                        <input
                            type="text"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="contacto@tuempresa.com"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                <button
                    onClick={() => onPay(email, quantity)}
                    disabled={!email}
                    className={`
                        w-full py-3.5 rounded-xl font-bold text-lg shadow-lg transition flex justify-center items-center gap-2
                        ${email ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                    `}
                >
                    <FaCreditCard /> Ir a Pagar
                </button>

                <p className="text-center text-xs text-gray-400 mt-4">
                    Pago seguro procesado por Mercado Pago.
                </p>
            </div>
        </div>
    );
}

export default function Home() {
    const [rubro, setRubro] = useState('');
    const [provincia, setProvincia] = useState('');
    const [localidades, setLocalidades] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<Lead[]>([]);
    const [count, setCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPayment, setShowPayment] = useState(false);
    const [customerEmail, setCustomerEmail] = useState('');
    const [localidadSearch, setLocalidadSearch] = useState(''); // New search state

    // Inline Purchase State
    const [purchaseEmail, setPurchaseEmail] = useState('');
    const [purchaseWhatsapp, setPurchaseWhatsapp] = useState('');
    const [purchaseQuantity, setPurchaseQuantity] = useState(1);
    const [emailError, setEmailError] = useState('');

    const handleProvinciaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setProvincia(e.target.value);
        setLocalidades([]); // Reset localities on province change
    };

    const handleLocalidadToggle = (loc: string) => {
        setLocalidades(prev => {
            if (prev.includes(loc)) {
                // Remove if already selected
                return prev.filter(l => l !== loc);
            } else {
                // Check if already at max
                if (prev.length >= 10) {
                    alert('Solo puedes seleccionar un máximo de 10 localidades');
                    return prev;
                }
                // Add new selection
                return [...prev, loc];
            }
        });
    };

    const handleSearch = async () => {
        if (!rubro || !provincia || localidades.length === 0) {
            setError('Por favor complete todos los campos.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults([]);
        setCount(null);

        try {
            const response = await axios.post('/api/search-n8n', {
                rubro,
                provincia,
                localidades
            });

            setResults(response.data.leads || []);
            setCount(response.data.count || 0);

            // Set quantity to max available
            const totalAvailable = response.data.count || 0;
            setPurchaseQuantity(totalAvailable > 0 ? totalAvailable : 1);

            if (response.data.count === 0) {
                setError('Espere un momento, tendrá sus resultados');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Error al buscar. Intente nuevamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const verifyPayment = async () => {
        // This would be the actual MercadoPago redirection logic
        // For demo purposes, we'll simulate a success
        alert('Para pagar usa el formulario de abaja, este modal es legacy.');
        setShowPayment(false);
    };

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl w-full space-y-8">

                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold text-blue-900 sm:text-5xl md:text-6xl flex items-center justify-center gap-3">
                        <BiCheckShield className="text-blue-500" /> Purosoftware Leads B2B
                    </h1>
                    <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                        Potencia tu negocio con nuestra base de datos verificada y actualizada.
                    </p>
                </div>

                {/* Search Box */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Rubro */}
                        <div className="flex flex-col">
                            <label htmlFor="rubro" className="text-sm font-semibold text-gray-700 mb-2">Rubro</label>
                            <input
                                type="text"
                                id="rubro"
                                value={rubro}
                                onChange={(e) => setRubro(e.target.value)}
                                placeholder="Ej: Abogados, Gimnasios..."
                                className="input-base"
                                style={{ color: 'black', backgroundColor: 'white', opacity: 1 }}
                            />
                        </div>

                        {/* Provincia */}
                        <div className="flex flex-col">
                            <label htmlFor="provincia" className="text-sm font-semibold text-gray-700 mb-2">Provincia</label>
                            <select
                                id="provincia"
                                value={provincia}
                                onChange={handleProvinciaChange}
                                className="input-base"
                                style={{ color: 'black', backgroundColor: 'white', opacity: 1 }}
                            >
                                <option value="">Selecciona una provincia</option>
                                {PROVINCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Localidades */}
                    {provincia && (
                        <div className="mt-6">
                            <label className="text-sm font-semibold text-gray-700 mb-2 block">
                                Seleccioná las localidades (máximo 10)
                            </label>

                            {/* Search Filter */}
                            <div className="mb-3 relative">
                                <input
                                    type="text"
                                    placeholder="Buscar localidad..."
                                    value={localidadSearch}
                                    onChange={(e) => setLocalidadSearch(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ color: 'black', backgroundColor: 'white' }}
                                />
                                <FaSearch className="absolute right-3 top-3 text-gray-400 text-xs" />
                            </div>

                            <div className="max-h-64 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                                {(() => {
                                    const rawData = LOCALIDADES[provincia] || [];
                                    const isZoned = !Array.isArray(rawData);
                                    const search = localidadSearch.toLowerCase();
                                    const MAX_SELECTION = 10;

                                    const renderCheckbox = (loc: string) => (
                                        <label key={loc} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded transition">
                                            <input
                                                type="checkbox"
                                                checked={localidades.includes(loc)}
                                                onChange={() => handleLocalidadToggle(loc)}
                                                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                            />
                                            <span className="text-sm text-gray-700">{loc}</span>
                                        </label>
                                    );

                                    if (isZoned) {
                                        // Render Zones
                                        return Object.entries(rawData as Record<string, string[]>).map(([zoneName, locs]) => {
                                            const filteredLocs = locs.filter(l => l.toLowerCase().includes(search));
                                            if (filteredLocs.length === 0) return null;

                                            const allZoneSelected = filteredLocs.every(loc => localidades.includes(loc));
                                            const someZoneSelected = filteredLocs.some(loc => localidades.includes(loc));

                                            const handleSelectAllZone = () => {
                                                if (allZoneSelected) {
                                                    // Deselect all from this zone
                                                    setLocalidades(prev => prev.filter(loc => !filteredLocs.includes(loc)));
                                                } else {
                                                    // Select all from this zone (up to max limit)
                                                    const notSelected = filteredLocs.filter(loc => !localidades.includes(loc));
                                                    const canAdd = Math.min(notSelected.length, MAX_SELECTION - localidades.length);

                                                    if (canAdd < notSelected.length) {
                                                        alert('Solo puedes seleccionar un máximo de 10 localidades');
                                                    }

                                                    setLocalidades(prev => [...prev, ...notSelected.slice(0, canAdd)]);
                                                }
                                            };

                                            return (
                                                <div key={zoneName} className="mb-4">
                                                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-gray-50 z-10 pb-1 border-b border-blue-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={allZoneSelected}
                                                            ref={input => {
                                                                if (input) input.indeterminate = someZoneSelected && !allZoneSelected;
                                                            }}
                                                            onChange={handleSelectAllZone}
                                                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                                        />
                                                        <h4 className="font-bold text-blue-800 text-xs uppercase">
                                                            {zoneName}
                                                        </h4>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {filteredLocs.map(renderCheckbox)}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    } else {
                                        // Render Flat List
                                        const filteredLocs = (rawData as string[]).filter(l => l.toLowerCase().includes(search));
                                        if (filteredLocs.length === 0) return <p className="text-xs text-center text-gray-400 py-4">No se encontraron localidades.</p>;

                                        return (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {filteredLocs.map(renderCheckbox)}
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                            <p className="text-xs text-right text-gray-500 mt-1">
                                Seleccionados: {localidades.length} / 10
                            </p>
                        </div>
                    )}

                    {/* Search Button */}
                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={handleSearch}
                            disabled={isLoading}
                            className={`
                w-full md:w-auto px-8 py-3 rounded-full text-white font-bold text-lg shadow-lg transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3
                ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}
              `}
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Buscando negocios...
                                </>
                            ) : (
                                <>
                                    <FaSearch /> Buscar Negocios
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-2 border border-red-200">
                            <FaExclamationTriangle /> {error}
                        </div>
                    )}
                </div>

                {/* Context for sorting */}
                {(() => {
                    // Helper to count potential data points
                    const scoreLead = (l: Lead) => {
                        let score = 0;
                        if (l.email && l.email !== 'null') score++;
                        if (l.whatsapp && l.whatsapp !== 'null') score++;
                        if (l.instagram && l.instagram !== 'null') score++;
                        if (l.facebook && l.facebook !== 'null') score++;
                        if (l.telefono2 && l.telefono2 !== 'null') score++;
                        return score;
                    };

                    // Sort by completeness
                    const sortedResults = [...results].sort((a, b) => scoreLead(b) - scoreLead(a));
                    const top3 = sortedResults.slice(0, 3);
                    const totalAvailable = results.length;

                    return (
                        <>
                            {/* Results Section (Teaser) */}
                            {results.length > 0 && (
                                <div className="animate-fade-in-up">
                                    <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-blue-900 font-bold text-lg">
                                                    ¡Encontramos {count} potenciales clientes!
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 mb-8">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rubro</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contactos</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {top3.map((lead) => (
                                                        <tr key={lead.id} className="hover:bg-gray-50 transition">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                                {lead.nombre || 'Nombre no disponible'}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                                {lead.rubro}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                                {lead.localidad}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-gray-500 space-y-1">
                                                                {/* Whatsapp */}
                                                                <div className="flex items-center gap-2">
                                                                    <FaWhatsapp className={lead.whatsapp && lead.whatsapp !== 'null' ? "text-green-500" : "text-gray-300"} />
                                                                    <span className={lead.whatsapp && lead.whatsapp !== 'null' ? "text-gray-900 font-medium" : "text-gray-400 italic"}>
                                                                        {(lead.whatsapp && lead.whatsapp !== 'null') ? lead.whatsapp : 'No disponible'}
                                                                    </span>
                                                                    {lead.isWhatsappValid && lead.whatsapp && lead.whatsapp !== 'null' && <FaCheck className="text-blue-500 text-xs" title="Validado" />}
                                                                </div>
                                                                {/* Email */}
                                                                <div className="flex items-center gap-2">
                                                                    <FaEnvelope className={lead.email && lead.email !== 'null' ? "text-orange-500" : "text-gray-300"} />
                                                                    <span className={lead.email && lead.email !== 'null' ? "text-gray-900" : "text-gray-400 italic"}>
                                                                        {(lead.email && lead.email !== 'null') ? lead.email : 'No disponible'}
                                                                    </span>
                                                                </div>
                                                                {/* IG/FB placeholder logic for clean UI */}
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className={`px-2 py-0.5 rounded ${lead.instagram && lead.instagram !== 'null' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-400'}`}>
                                                                        IG: {(lead.instagram && lead.instagram !== 'null') ? 'Sí' : 'No'}
                                                                    </span>
                                                                    <span className={`px-2 py-0.5 rounded ${lead.facebook && lead.facebook !== 'null' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                                                                        FB: {(lead.facebook && lead.facebook !== 'null') ? 'Sí' : 'No'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="bg-gray-50 px-6 py-3 text-center border-t border-gray-200">
                                            <p className="text-sm text-gray-500 italic">
                                                ... y {totalAvailable - 3} resultados más esperando por ti.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Conversion / Payment Section (Redesigned) */}
                                    <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8 text-center mt-12 mb-12 transform transition duration-500 hover:shadow-2xl">
                                        <div className="max-w-2xl mx-auto">
                                            <h3 className="text-3xl font-extrabold text-gray-900 mb-2">
                                                🚀 ¡Potencia tus ventas hoy!
                                            </h3>
                                            <p className="text-gray-600 mb-8 text-lg">
                                                Adquiere la base de datos completa y empieza a contactar ahora mismo. <br />
                                                <span className="text-sm bg-blue-50 text-blue-800 px-2 py-1 rounded mt-2 inline-block font-semibold">
                                                    Precio por contacto: $100 ARS
                                                </span>
                                            </p>

                                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 shadow-inner text-left space-y-4">

                                                {/* Quantity Input */}
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-1">
                                                        1. Elije la cantidad de contactos ({totalAvailable} disponibles)
                                                    </label>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={totalAvailable}
                                                            value={purchaseQuantity}
                                                            onChange={(e) => {
                                                                let val = parseInt(e.target.value);
                                                                if (isNaN(val)) val = 1;
                                                                if (val > totalAvailable) val = totalAvailable;
                                                                if (val < 1) val = 1;
                                                                setPurchaseQuantity(val);
                                                            }}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-black font-bold outline-none ring-2 focus:ring-blue-500 transition"
                                                        />
                                                        <button
                                                            onClick={() => setPurchaseQuantity(totalAvailable)}
                                                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                                                        >
                                                            Todos
                                                        </button>
                                                    </div>
                                                    <p className="text-right text-lg font-bold text-blue-600 mt-1">
                                                        Total: ${(purchaseQuantity * 100).toLocaleString()}
                                                    </p>
                                                </div>

                                                {/* Contact Inputs */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-bold text-gray-700 mb-1">2. Tu Email</label>
                                                        <input
                                                            type="email"
                                                            placeholder="ejemplo@empresa.com"
                                                            value={purchaseEmail}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                setPurchaseEmail(value);

                                                                // Validate email format
                                                                if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                                                                    setEmailError('Por favor ingresa un email válido (ejemplo: usuario@dominio.com)');
                                                                } else {
                                                                    setEmailError('');
                                                                }
                                                            }}
                                                            className={`w-full px-4 py-3 border rounded-lg text-black outline-none focus:ring-2 transition input-base text-gray-900 ${emailError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                                                                }`}
                                                            style={{ color: 'black', backgroundColor: 'white' }}
                                                        />
                                                        {emailError && (
                                                            <p className="text-red-600 text-xs mt-1">{emailError}</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-gray-700 mb-1">3. Tu WhatsApp</label>
                                                        <input
                                                            type="tel"
                                                            placeholder="11 1234-5678"
                                                            value={purchaseWhatsapp}
                                                            onChange={(e) => {
                                                                // Only allow numbers
                                                                const value = e.target.value.replace(/\D/g, '');
                                                                setPurchaseWhatsapp(value);
                                                            }}
                                                            maxLength={10}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-black outline-none focus:ring-2 focus:ring-blue-500 transition input-base text-gray-900"
                                                            style={{ color: 'black', backgroundColor: 'white' }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Disclaimer */}
                                                <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2 text-xs text-yellow-800 text-left">
                                                    <FaExclamationTriangle className="mt-0.5 text-yellow-600 shrink-0" />
                                                    <p>
                                                        <strong>Importante:</strong> Una vez realizado el pago, te enviaremos la base de datos descargable a tu <u>Email</u> y también por <u>WhatsApp</u>.
                                                    </p>
                                                </div>

                                                {/* Checkout Button */}
                                                <MercadoPagoButton
                                                    amount={purchaseQuantity * 100}
                                                    searchId="" // Will be generated server-side
                                                    clientPhone={`+549${purchaseWhatsapp}`}
                                                    clientEmail={purchaseEmail}
                                                    quantity={purchaseQuantity}
                                                    disabled={(!purchaseEmail && !purchaseWhatsapp) || !!emailError || (!!purchaseWhatsapp && purchaseWhatsapp.length < 10)}
                                                    className={`w-full py-4 rounded-xl font-extrabold text-xl shadow-lg transition flex items-center justify-center gap-3 text-white
                                                    ${(purchaseEmail || purchaseWhatsapp) && !emailError && (purchaseWhatsapp.length >= 10 || !purchaseWhatsapp)
                                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transform hover:-translate-y-1'
                                                            : 'bg-gray-400 cursor-not-allowed'}
                                                `}
                                                >
                                                    <>PAGAR CON MERCADO PAGO</>
                                                </MercadoPagoButton>

                                            </div>
                                            <p className="mt-4 text-xs text-gray-400">
                                                Pago procesado de forma segura. Tus datos están protegidos.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Payment Modal Refined */}
                            {showPayment && (
                                <PaymentModal
                                    totalAvailable={results.length}
                                    onClose={() => setShowPayment(false)}
                                    onPay={verifyPayment}
                                />
                            )}
                        </>
                    );
                })()}

                {/* Legal Disclaimer */}
                <div className="text-center text-xs text-gray-400 mt-12 pt-8 border-t border-gray-200">
                    <p>
                        La información mostrada proviene de fuentes públicas (Google Maps).
                        Purosoftware no es propietario de los datos y solo facilita su visualización.
                    </p>
                </div>

            </div>

            <style jsx global>{`
        .input-base {
          @apply w-full px-4 py-2 border border-gray-300 rounded-lg text-black bg-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition duration-150 ease-in-out;
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
        }
      `}</style>
        </main>
    );
}
