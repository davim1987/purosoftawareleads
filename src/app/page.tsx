'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
    provincia?: string;
    instagram?: string;
    facebook?: string;
    telefono2?: string;
    horario?: string | null;
    isWhatsappValid: boolean;
}

// Payment Modal Component
function PaymentModal({
    totalAvailable,
    onClose,
    searchId,
    rubro,
    provincia,
    localidades
}: {
    totalAvailable: number,
    onClose: () => void,
    searchId: string,
    rubro: string,
    provincia: string,
    localidades: string[]
}) {
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [quantity, setQuantity] = useState(totalAvailable);
    const [emailError, setEmailError] = useState('');

    const pricePerContact = 100;
    const total = quantity * pricePerContact;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full relative border border-gray-100 animate-scale-up overflow-hidden">
                {/* Decorative background */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-gray-300 hover:text-gray-500 text-3xl font-light transition cursor-pointer"
                >
                    &times;
                </button>

                <div className="text-center mb-6">
                    <h3 className="text-3xl font-black text-gray-900 mb-2">¡LO QUIERO! 🚀</h3>
                    <p className="text-gray-500 text-sm">
                        Completá tus datos para recibir la base de datos completa.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black border border-blue-100 shadow-sm">
                        <span>1 CONTACTO X $100 ARS</span>
                    </div>
                </div>

                <div className="space-y-5">
                    {/* Quantity */}
                    <div>
                        <div className="flex justify-between items-end mb-1.5">
                            <label className="text-sm font-bold text-gray-700">1. Cantidad de contactos</label>
                            <span className="text-xs text-blue-500 font-bold">{totalAvailable} disponibles</span>
                        </div>
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
                                className="flex-1 px-5 py-3 border-2 border-gray-100 rounded-2xl text-black font-black text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                            />
                            <button
                                onClick={() => setQuantity(totalAvailable)}
                                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-2xl transition-colors text-sm"
                            >
                                Todos
                            </button>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">2. Tu Email</label>
                            <input
                                type="email"
                                placeholder="ejemplo@empresa.com"
                                value={email}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setEmail(value);
                                    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                                        setEmailError('Email inválido');
                                    } else {
                                        setEmailError('');
                                    }
                                }}
                                className={`w-full px-5 py-3 border-2 rounded-2xl text-black font-medium focus:ring-4 transition-all outline-none ${emailError ? 'border-red-100 bg-red-50 focus:ring-red-100 focus:border-red-400' : 'border-gray-100 focus:border-blue-500 focus:ring-blue-500/10'
                                    }`}
                            />
                            {emailError && <p className="text-red-500 text-[10px] mt-1 font-bold">{emailError}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">3. Tu WhatsApp</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3 text-xl" title="Argentina">🇦🇷</span>
                                <input
                                    type="tel"
                                    placeholder="11 1234-5678"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                                    maxLength={10}
                                    className="w-full pl-14 pr-5 py-3 border-2 border-gray-100 rounded-2xl text-black font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Total Summary */}
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-500/20">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Total a pagar</p>
                                <p className="text-3xl font-black">$ {total.toLocaleString()}</p>
                            </div>
                            <BiCheckShield className="text-4xl text-blue-200/50" />
                        </div>
                    </div>

                    {/* MP Button */}
                    <div className="relative">
                        <MercadoPagoButton
                            amount={total}
                            searchId={searchId}
                            clientPhone={`+549${whatsapp}`}
                            clientEmail={email}
                            quantity={quantity}
                            rubro={rubro}
                            provincia={provincia}
                            localidades={localidades}
                            disabled={!email || !!emailError || (whatsapp.length > 0 && whatsapp.length < 10)}
                            className={`w-full py-4.5 rounded-2xl font-black text-xl shadow-2xl transition-all flex justify-center items-center gap-3 text-white transform active:scale-95 ${email && !emailError && (whatsapp.length === 10 || whatsapp.length === 0)
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:shadow-blue-500/40 hover:-translate-y-1'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            PAGAR CON MERCADO PAGO
                        </MercadoPagoButton>
                    </div>
                </div>

                <div className="mt-6 flex items-start gap-2 text-[10px] text-gray-400 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <FaExclamationTriangle className="text-yellow-500 shrink-0 mt-0.5" />
                    <p>Entrega inmediata: te enviaremos el Excel descargable a tu Email y WhatsApp al confirmar el pago.</p>
                </div>
            </div>
        </div>
    );
}

// Sample Data
const sampleLeads: Lead[] = [
    {
        id: 'sample-1',
        nombre: 'Gimnasio Fitness Real',
        rubro: 'Gimnasios',
        direccion: 'Av. Santa Fe 1234, CABA',
        email: 'contacto@fitnessreal.com',
        whatsapp: '11 2233-4455',
        web: 'www.fitnessreal.com',
        localidad: 'Palermo',
        provincia: 'CABA',
        instagram: '@fitnessreal',
        facebook: 'FitnessRealOficial',
        isWhatsappValid: true
    },
    {
        id: 'sample-2',
        nombre: 'Abogados Asociados MZ',
        rubro: 'Abogados',
        direccion: 'Calle Lavalle 567, CABA',
        email: 'info@abogadosmz.com',
        whatsapp: '11 6677-8899',
        web: 'www.abogadosmz.com.ar',
        localidad: 'San Nicolas',
        provincia: 'CABA',
        instagram: undefined,
        facebook: undefined,
        isWhatsappValid: true
    },
    {
        id: 'sample-3',
        nombre: 'Panadería La Ideal',
        rubro: 'Panaderías',
        direccion: 'Rivadavia 8900, Liniers',
        email: null,
        whatsapp: '11 9988-7766',
        web: null,
        localidad: 'Liniers',
        provincia: 'CABA',
        instagram: '@laideal_panaderia',
        facebook: 'LaIdealPanaderia',
        isWhatsappValid: true
    }
];

function SampleResultsModal({ onClose }: { onClose: () => void }) {
    React.useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-md animate-fade-in cursor-pointer"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl p-8 max-w-5xl w-full relative border border-gray-100 animate-scale-up overflow-hidden max-h-[90vh] flex flex-col cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-gray-300 hover:text-gray-500 text-3xl font-light transition cursor-pointer z-10"
                >
                    &times;
                </button>

                <div className="text-center mb-6">
                    <h3 className="text-3xl font-black text-gray-900 mb-1">Modo demostración</h3>
                    <p className="text-gray-500 text-sm font-medium">
                        Todos los datos son de conocimiento público
                    </p>
                </div>

                <div className="overflow-x-auto flex-1 bg-gray-50 rounded-2xl border border-gray-100 mb-4 p-2">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Nombre</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Rubro</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Localidad</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">WhatsApp</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Instagram</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Facebook</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Dirección</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sampleLeads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-gray-50 transition text-[13px]">
                                    <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{lead.nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-medium">{lead.rubro}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{lead.localidad}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-black">
                                        <div className="flex items-center gap-1">
                                            {lead.whatsapp}
                                            <FaCheck className="text-green-500 text-[10px]" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-pink-600 font-bold">
                                        {lead.instagram || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-blue-800 font-bold">
                                        {lead.facebook || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        <div className="max-w-[150px] truncate" title={lead.direccion || ''}>{lead.direccion}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="text-center pt-4">
                    <button
                        onClick={onClose}
                        className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black rounded-2xl shadow-xl hover:shadow-blue-500/30 transition-all transform hover:-translate-y-1"
                    >
                        ¡ENTENDIDO, QUIERO BUSCAR! 🚀
                    </button>
                </div>
            </div>
        </div>
    );
}

function LeadsApp() {
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
    const [showSampleModal, setShowSampleModal] = useState(false);

    // Search-specific states
    const [searchId, setSearchId] = useState<string | null>(null);
    const [searchStatus, setSearchStatus] = useState<string>('idle');
    const [isProcessing, setIsProcessing] = useState(false); // Polling for bot or MP
    const [isInitialSearch, setIsInitialSearch] = useState(false); // Polling for bot
    const [pollCount, setPollCount] = useState(0);
    const [expandedZones, setExpandedZones] = useState<string[]>([]); // To toggle zone visibility

    // Purchase states
    const [purchaseEmail, setPurchaseEmail] = useState('');
    const [purchaseWhatsapp, setPurchaseWhatsapp] = useState('');
    const [purchaseQuantity, setPurchaseQuantity] = useState(1);
    const [emailError, setEmailError] = useState('');

    const searchParams = useSearchParams();
    const router = useRouter();

    // 1. Rehydration: Load active search from localStorage or URL
    useEffect(() => {
        const urlSearchId = searchParams.get('searchId');
        const paymentStatus = searchParams.get('payment');
        const savedSearchStr = localStorage.getItem('active_search');
        const savedSearch = savedSearchStr ? JSON.parse(savedSearchStr) : null;

        // Restore metadata if available and relevant
        if (savedSearch) {
            const { id, rubro: sRubro, provincia: sProv, localidades: sLocs, timestamp } = savedSearch;
            // If ID matches or no ID in URL, restore
            if (!urlSearchId || urlSearchId === id) {
                if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                    setRubro(sRubro);
                    setProvincia(sProv);
                    setLocalidades(sLocs);
                    if (!urlSearchId) setSearchId(id);
                }
            }
        }

        if (urlSearchId) {
            setSearchId(urlSearchId);

            if (paymentStatus === 'success') {
                setIsProcessing(true);
                setSearchStatus('processing_deep');
                setIsInitialSearch(false);
            } else {
                setIsInitialSearch(true);
                setSearchStatus('scraping');
            }
        }
    }, [searchParams]);

    // 2. Initial Search Polling (Direct Bot Integration)
    React.useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isInitialSearch && searchId) {
            timer = setInterval(async () => {
                console.log('Polling for bot progress...', searchId);
                try {
                    const response = await axios.get(`/api/search/status?id=${searchId}`);
                    const { status, error_message, results: polledResults, count: polledCount, bot_job_id } = response.data;

                    if (bot_job_id && !searchParams.get('searchId')) {
                        // Sync with URL for recovery
                        const params = new URLSearchParams(searchParams.toString());
                        params.set('searchId', searchId);
                        router.replace(`/?${params.toString()}`);
                    }

                    if (status === 'completed') {
                        setIsInitialSearch(false);
                        setIsLoading(false);
                        localStorage.removeItem('active_search');

                        // Use results directly from Status API for free search
                        if (polledResults) {
                            setResults(polledResults);
                            setCount(polledCount || 0);
                            setPurchaseQuantity(polledCount > 0 ? polledCount : 1);
                            setSearchStatus('completed');
                        } else {
                            handleSearch(true); // Fallback to DB if no results in status
                        }
                    } else if (status === 'error') {
                        setIsInitialSearch(false);
                        setIsLoading(false);
                        setSearchStatus('error');
                        setError(error_message || 'Error en el bot de búsqueda.');
                        clearInterval(timer);
                    } else {
                        setSearchStatus(status as any);
                    }
                } catch (err) {
                    console.error('Bot polling error:', err);
                }
            }, 2000); // Every 2 seconds
        }
        return () => { if (timer) clearInterval(timer); };
    }, [isInitialSearch, searchId, rubro, provincia, localidades]);

    // 3. Post-Payment Polling (Polling for full results)
    React.useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isProcessing) {
            timer = setInterval(async () => {
                console.log('Polling for full results...');
                try {
                    const response = await axios.post(`/api/search?full=true`, {
                        rubro,
                        provincia,
                        localidades
                    });

                    const leads = response.data.leads || [];
                    const hasFullData = leads.some((l: Lead) => l.email || l.whatsapp || l.telefono2);

                    if (hasFullData) {
                        setResults(leads);
                        setIsProcessing(false);
                        setIsLoading(false);
                        setError(null);
                        clearInterval(timer);
                    } else {
                        setPollCount(prev => prev + 1);
                        if (pollCount > 60) { // Timeout after 5 minutes (5s * 60)
                            setIsProcessing(false);
                            setIsLoading(false);
                            setError('El procesamiento está tardando más de lo esperado. Te avisaremos por WhatsApp.');
                            clearInterval(timer);
                        }
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 5000); // Every 5 seconds
        }

        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isProcessing, rubro, provincia, localidades, pollCount]);

    const calculateProgress = (status: string) => {
        if (status === 'completed') return 100;
        if (status === 'error' || status === 'idle') return 0;
        if (status === 'geolocating') return 5;
        if (status === 'scraping') return 10;
        if (status === 'processing_deep') return 95; // High progress for post-payment wait

        // Parse "Procesando X (1/5)..."
        const match = status.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            // Map 1/5 to a range between 10 and 95
            const progress = 10 + ((current / total) * 85);
            return Math.min(Math.floor(progress), 95);
        }
        return 0;
    };

    // 4. Cancel Search Logic
    const handleCancelSearch = () => {
        setIsInitialSearch(false);
        setIsLoading(false);
        setSearchId(null);
        setSearchStatus('idle');
        setError(null);
        localStorage.removeItem('active_search');

        // Clear URL
        const params = new URLSearchParams(searchParams.toString());
        params.delete('searchId');
        router.replace(`/?${params.toString()}`);
    };

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

    const handleSearch = async (fromPolling = false) => {
        if (!rubro || !provincia || localidades.length === 0) {
            setError('Por favor complete todos los campos.');
            return;
        }

        setIsLoading(true);
        setError(null);
        if (!fromPolling) {
            setResults([]);
            setCount(null);
        }

        try {
            const response = await axios.post('/api/search', {
                rubro,
                provincia,
                localidades
            });

            // Extract the searchId (which is the bot jobId) from the response
            const serverSearchId = response.data.searchId;

            if (response.data.status === 'processing') {
                setSearchId(serverSearchId);
                setIsInitialSearch(true);
                setSearchStatus('scraping');

                // Update URL for recovery and CLEAR payment status
                const params = new URLSearchParams();
                params.set('searchId', serverSearchId);
                router.replace(`/?${params.toString()}`);

                // Save to localStorage for resilience
                localStorage.setItem('active_search', JSON.stringify({
                    id: serverSearchId,
                    rubro,
                    provincia,
                    localidades,
                    timestamp: Date.now()
                }));
                return;
            }

            setResults(response.data.leads || []);
            setCount(response.data.count || 0);
            setSearchStatus('completed');

            // Set quantity to max available
            const totalAvailable = response.data.count || 0;
            setPurchaseQuantity(totalAvailable > 0 ? totalAvailable : 1);

            if (response.data.count === 0) {
                setError('No encontramos resultados para esta búsqueda.');
            } else if (fromPolling) {
                // If we come from polling, explicitly stop the loading and maybe show a brief success state
                setIsLoading(false);
                setIsInitialSearch(false);
                console.log('Search finished successfully after polling.');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Error al buscar. Intente nuevamente.');
            setSearchStatus('error');
        } finally {
            // Only stop loading if NOT waiting for initial search background process
            if (!isInitialSearch && searchStatus !== 'geolocating' && searchStatus !== 'scraping') {
                setIsLoading(false);
            }
        }
    };

    // This will be called when the user starts the payment process
    const handlePayInitiated = () => {
        setIsProcessing(true);
        setPollCount(0);
        setError('Estamos procesando tus resultados... Esto puede demorar unos minutos.');
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
                            <div className="input-base group">
                                <span className="pl-6 pr-3 font-bold text-gray-400 text-sm whitespace-nowrap">Rubro:</span>
                                <input
                                    type="text"
                                    id="rubro"
                                    value={rubro}
                                    onChange={(e) => setRubro(e.target.value)}
                                    placeholder="Ej: Abogados, Gimnasios..."
                                    className="input-field"
                                />
                            </div>
                        </div>

                        {/* Provincia */}
                        <div className="flex flex-col">
                            <div className="input-base group">
                                <span className="pl-6 pr-3 font-bold text-gray-400 text-sm whitespace-nowrap">Provincia:</span>
                                <select
                                    id="provincia"
                                    value={provincia}
                                    onChange={handleProvinciaChange}
                                    className="input-field cursor-pointer"
                                >
                                    <option value="">Seleccione...</option>
                                    {PROVINCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
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
                                    className="w-full px-6 py-3 border border-gray-300 rounded-xl text-sm text-black bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all"
                                />
                                <FaSearch className="absolute right-4 top-4 text-gray-400 text-xs" />
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
                                        return (
                                            <div className="space-y-2">
                                                {/* Selected Chips Section */}
                                                {localidades.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-4 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                                        {localidades.map(loc => (
                                                            <span key={loc} className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 text-xs font-bold rounded-full border border-blue-200 shadow-sm">
                                                                {loc}
                                                                <button
                                                                    onClick={() => handleLocalidadToggle(loc)}
                                                                    className="hover:text-red-500 transition"
                                                                >
                                                                    &times;
                                                                </button>
                                                            </span>
                                                        ))}
                                                        <button
                                                            onClick={() => setLocalidades([])}
                                                            className="text-[10px] text-blue-400 hover:text-blue-600 underline ml-auto"
                                                        >
                                                            Limpiar todo
                                                        </button>
                                                    </div>
                                                )}

                                                {Object.entries(rawData as Record<string, string[]>).map(([zoneName, locs]) => {
                                                    const filteredLocs = locs.filter(l => l.toLowerCase().includes(search));
                                                    if (filteredLocs.length === 0) return null;

                                                    const isExpanded = expandedZones.includes(zoneName) || search.length > 0;
                                                    const allZoneSelected = filteredLocs.every(loc => localidades.includes(loc));
                                                    const someZoneSelected = filteredLocs.some(loc => localidades.includes(loc));

                                                    const toggleZone = () => {
                                                        setExpandedZones(prev =>
                                                            prev.includes(zoneName) ? prev.filter(z => z !== zoneName) : [...prev, zoneName]
                                                        );
                                                    };

                                                    const handleSelectAllZone = (e: React.MouseEvent) => {
                                                        e.stopPropagation(); // Avoid toggling the zone
                                                        if (allZoneSelected) {
                                                            setLocalidades(prev => prev.filter(loc => !filteredLocs.includes(loc)));
                                                        } else {
                                                            const notSelected = filteredLocs.filter(loc => !localidades.includes(loc));
                                                            const canAdd = Math.min(notSelected.length, MAX_SELECTION - localidades.length);
                                                            if (canAdd < notSelected.length && canAdd === 0) {
                                                                alert('Solo puedes seleccionar un máximo de 10 localidades');
                                                            } else {
                                                                setLocalidades(prev => [...prev, ...notSelected.slice(0, canAdd)]);
                                                            }
                                                        }
                                                    };

                                                    return (
                                                        <div key={zoneName} className="border border-gray-100 rounded-lg overflow-hidden transition-all">
                                                            <div
                                                                onClick={toggleZone}
                                                                className={`
                                                                    flex items-center justify-between px-4 py-2 cursor-pointer transition
                                                                    ${isExpanded ? 'bg-blue-50 border-b border-blue-100' : 'bg-white hover:bg-gray-50'}
                                                                `}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={allZoneSelected}
                                                                        ref={input => {
                                                                            if (input) input.indeterminate = someZoneSelected && !allZoneSelected;
                                                                        }}
                                                                        onClick={handleSelectAllZone}
                                                                        onChange={() => { }} // Controlled by onClick
                                                                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                                                    />
                                                                    <h4 className="font-bold text-blue-900 text-xs uppercase tracking-tight">
                                                                        {zoneName}
                                                                    </h4>
                                                                    <span className="text-[10px] text-gray-400">({filteredLocs.length})</span>
                                                                </div>
                                                                <span className={`text-blue-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                                    ▼
                                                                </span>
                                                            </div>
                                                            {isExpanded && (
                                                                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white animate-fade-in">
                                                                    {filteredLocs.map(renderCheckbox)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
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

                    {/* Search Button & Muestra */}
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                        <button
                            onClick={() => handleSearch()}
                            disabled={isLoading || isInitialSearch}
                            className={`
                                w-full md:w-auto px-10 py-4 rounded-full text-white font-black text-xl shadow-2xl transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3
                                ${(isLoading || isInitialSearch) ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}
                            `}
                        >
                            {(isLoading || isInitialSearch) ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Buscando negocios...
                                </>
                            ) : (
                                <>
                                    <FaSearch /> BUSCAR NEGOCIOS
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setShowSampleModal(true)}
                            className="px-8 py-3.5 border-2 border-gray-100 text-gray-400 hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50/30 font-bold rounded-full transition-all flex items-center gap-2 text-sm bg-white shadow-sm transform hover:-translate-y-1"
                        >
                            <span className="text-lg">👀</span> Muestra
                        </button>
                    </div>

                    {/* Progress Bar & Status */}
                    {(isLoading || isInitialSearch || isProcessing) && searchStatus !== 'idle' && (
                        <div className="mt-8 space-y-6">
                            <div className="flex flex-col items-center">
                                <div className="h-16 flex items-center justify-center overflow-hidden w-full relative">
                                    {searchStatus === 'processing_deep' ? (
                                        <div className="flex flex-col items-center animate-pulse">
                                            <span className="text-xl font-black text-blue-600 tracking-tighter uppercase italic">
                                                Buscando Leads...
                                            </span>
                                            <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest mt-1">
                                                Extrayendo información de contacto completa
                                            </span>
                                        </div>
                                    ) : searchStatus.startsWith('Procesando') ? (
                                        <div key={searchStatus} className="flex flex-col items-center animate-locality-ticker">
                                            <span className="text-2xl font-black text-blue-600 tracking-tighter uppercase italic">
                                                {searchStatus.split('Procesando ')[1]?.split(' (')[0]}
                                            </span>
                                            <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest mt-1">
                                                PROCESANDO ZONA {searchStatus.match(/\d+\/\d+/)?.[0]}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-lg font-bold text-blue-900 animate-pulse">
                                            {searchStatus === 'completed' ? '✅ ¡BÚSQUEDA FINALIZADA!' :
                                                searchStatus === 'error' ? '❌ ERROR EN EL PROCESO' :
                                                    searchStatus === 'geolocating' ? '⚙️ GEOLOCALIZANDO...' : '⌛ INICIANDO SCRAPER...'}
                                        </span>
                                    )}
                                </div>

                                <div className="w-full mt-4 flex items-center gap-4">
                                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200 shadow-inner">
                                        <div
                                            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                            style={{ width: `${calculateProgress(searchStatus)}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-black text-blue-500 w-8">{calculateProgress(searchStatus)}%</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-3">
                                <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest">
                                    {searchStatus === 'geolocating' ? 'Estamos preparando el mapa de búsqueda...' :
                                        'No cierres esta pestaña. Los resultados aparecerán abajo automáticamente.'}
                                </p>
                                <button
                                    onClick={handleCancelSearch}
                                    className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-red-600"
                                >
                                    Cancelar Búsqueda
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 flex flex-col items-center gap-4">
                            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-2 border border-red-200 w-full">
                                <FaExclamationTriangle /> {error}
                            </div>
                            {searchStatus === 'error' && (
                                <button
                                    onClick={handleCancelSearch}
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-full font-bold hover:bg-gray-300 transition"
                                >
                                    Intentar de nuevo
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Context for sorting */}
                {(() => {
                    // Helper to count potential data points
                    // The API already returns the top 3 leads sorted by quality
                    const top3 = results;
                    const totalAvailable = count || 0;

                    return (
                        <>
                            {/* Results Section (Teaser) */}
                            {results.length > 0 && (
                                <div className="animate-fade-in-up">
                                    <div className="mb-8 p-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-blue-800 animate-fade-in-up">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                                                <FaCheck className="text-white text-2xl" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-black text-2xl">¡Encontramos {count} clientes!</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-white/20 text-blue-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Búsqueda Exitosa</span>
                                                    <span className="text-[10px] bg-orange-400 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">1 contacto x $100</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShowPayment(true)}
                                            className="w-full md:w-auto px-10 py-4 bg-white text-blue-700 hover:bg-blue-50 font-black text-xl rounded-2xl shadow-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            ¡LO QUIERO! 🚀
                                        </button>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 mb-8">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rubro</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localidad</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instagram</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facebook</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirección</th>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {top3.map((lead) => (
                                                        <tr key={lead.id} className="hover:bg-gray-50 transition">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                                <div className="flex flex-col">
                                                                    <span>{lead.nombre || 'Nombre no disponible'}</span>
                                                                    {lead.horario && lead.horario !== 'No disponible' && (
                                                                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                                                                            🕒 {lead.horario}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                                {lead.rubro}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                                                                {lead.localidad || 'N/A'}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                                                <div className="flex items-center gap-1.5">
                                                                    {lead.whatsapp && lead.whatsapp !== 'null' ? lead.whatsapp : (lead.telefono2 && lead.telefono2 !== 'null' ? lead.telefono2 : 'No disponible')}
                                                                    {(lead.whatsapp || lead.telefono2) && (
                                                                        <FaCheck className="text-green-500 text-[10px]" title="Número verificado" />
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                                                                <span className={`px-2 py-1 rounded-full border flex items-center justify-center gap-1 font-bold ${lead.instagram && lead.instagram !== 'null' ? 'bg-pink-50 text-pink-700 border-pink-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                                    {(lead.instagram && lead.instagram !== 'null') ? lead.instagram : 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                                                                <span className={`px-2 py-1 rounded-full border flex items-center justify-center gap-1 font-bold ${lead.facebook && lead.facebook !== 'null' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                                    {(lead.facebook && lead.facebook !== 'null') ? lead.facebook : 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                                <div className="flex items-center gap-2">
                                                                    <FaEnvelope className={lead.email && lead.email !== 'null' ? "text-orange-500" : "text-gray-300"} />
                                                                    <span className={lead.email && lead.email !== 'null' ? "text-gray-900 font-medium" : "text-gray-400 italic"}>
                                                                        {(lead.email && lead.email !== 'null') ? lead.email : 'No disponible'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                                <div className="max-w-[150px] truncate" title={lead.direccion || 'No disponible'}>
                                                                    {lead.direccion && lead.direccion !== 'null' ? lead.direccion : 'No disponible'}
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

                                    {/* Removed old bottom payment section to prevent scroll */}
                                </div>
                            )}

                            {/* Payment Modal Refined */}
                            {showPayment && (
                                <PaymentModal
                                    totalAvailable={count || results.length}
                                    onClose={() => setShowPayment(false)}
                                    searchId={searchId || ''}
                                    rubro={rubro}
                                    provincia={provincia}
                                    localidades={localidades}
                                />
                            )}

                            {/* Sample Modal */}
                            {showSampleModal && (
                                <SampleResultsModal
                                    onClose={() => setShowSampleModal(false)}
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
          @apply w-full flex items-center border-2 border-gray-100 rounded-xl bg-white shadow-sm focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all duration-200 overflow-hidden;
        }
        .input-field {
          @apply flex-1 px-4 py-3 bg-transparent text-black outline-none placeholder-gray-400 font-medium;
        }
        .animate-scale-up {
          animation: scale-up 0.3s ease-out forwards;
        }
        @keyframes scale-up {
          0% { opacity: 0; transform: scale(0.95) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
        }
        .animate-locality-ticker {
          animation: locality-ticker 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }
        @keyframes locality-ticker {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </main>
    );
}
export default function Home() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                    <p className="font-bold text-gray-500">Cargando aplicativo...</p>
                </div>
            </div>
        }>
            <LeadsApp />
        </Suspense>
    );
}
