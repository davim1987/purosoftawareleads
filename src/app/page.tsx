'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { FaSearch, FaWhatsapp, FaInstagram, FaFacebook, FaEnvelope, FaMapMarkerAlt, FaCheck, FaExclamationTriangle, FaMousePointer } from 'react-icons/fa';
import { BiCheckShield } from 'react-icons/bi';
import MercadoPagoButton from '@/components/MercadoPagoButton';
import LocalidadSelector from '@/components/LocalidadSelector';
import LeadTable from '@/components/LeadTable';
import { ThemeToggle } from '@/components/ThemeToggle';

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

interface PurchaseSummary {
    email: string;
    whatsapp: string;
    quantity: number;
    amount: number;
    rubro: string;
    provincia: string;
    localidades: string[];
}

// Payment Modal Component
function PaymentModal({
    totalAvailable,
    onClose,
    searchId,
    rubro,
    provincia,
    localidades,
    coords,
    detectedPaymentId
}: {
    totalAvailable: number,
    onClose: () => void,
    searchId: string,
    rubro: string,
    provincia: string,
    localidades: string[],
    coords?: Record<string, { lat: number, lon: number }>,
    detectedPaymentId?: string | null
}) {
    const CONTACT_CACHE_KEY = 'checkout_contact_cache_v1';
    const getCachedContact = () => {
        if (typeof window === 'undefined') return { email: '', whatsapp: '' };
        try {
            const cached = localStorage.getItem(CONTACT_CACHE_KEY);
            if (!cached) return { email: '', whatsapp: '' };
            const parsed = JSON.parse(cached) as { email?: string; whatsapp?: string };
            return {
                email: parsed.email || '',
                whatsapp: parsed.whatsapp || ''
            };
        } catch {
            return { email: '', whatsapp: '' };
        }
    };

    const cachedContact = getCachedContact();
    const [email, setEmail] = useState(cachedContact.email);
    const [whatsapp, setWhatsapp] = useState(cachedContact.whatsapp);
    const [quantity, setQuantity] = useState<number | string>(totalAvailable);
    const [emailError, setEmailError] = useState('');
    const [paymentIdInput, setPaymentIdInput] = useState(detectedPaymentId || '');

    // Auto-fill from localStorage if available
    useEffect(() => {
        if (!paymentIdInput) {
            const savedId = searchId ? localStorage.getItem(`last_payment_id_${searchId}`) : null;
            const globalId = localStorage.getItem('last_global_payment_id');
            if (savedId) setPaymentIdInput(savedId);
            else if (globalId) setPaymentIdInput(globalId);
        }
    }, [searchId, paymentIdInput]);

    // Save manually entered ID globally
    const handlePaymentIdChange = (val: string) => {
        setPaymentIdInput(val);
        if (val.trim()) {
            localStorage.setItem('last_global_payment_id', val.trim());
            if (searchId) {
                localStorage.setItem(`last_payment_id_${searchId}`, val.trim());
            }
        }
    };

    // Auto-fill from prop if it changes
    useEffect(() => {
        if (detectedPaymentId) {
            setPaymentIdInput(detectedPaymentId);
        }
    }, [detectedPaymentId]);

    const pricePerContact = 100;
    const numericQuantity = typeof quantity === 'string' ? (parseInt(quantity) || 0) : quantity;
    const total = numericQuantity * pricePerContact;

    const isEmailValid = email && !emailError;
    const isWhatsappValid = whatsapp.length === 10;

    useEffect(() => {
        try {
            localStorage.setItem(
                CONTACT_CACHE_KEY,
                JSON.stringify({
                    email,
                    whatsapp
                })
            );
        } catch (err) {
            console.error('Could not write contact cache:', err);
        }
    }, [email, whatsapp]);
    const isQuantityValid = numericQuantity > 0;
    const canProceedToPay = (isEmailValid || isWhatsappValid) && isQuantityValid;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-[#0B0F19] rounded-3xl shadow-2xl p-6 md:p-8 max-w-lg w-full relative border border-gray-100 dark:border-gray-800 animate-scale-up overflow-y-auto max-h-[95vh] custom-scrollbar">
                {/* Decorative background */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-100 text-3xl font-light transition cursor-pointer"
                >
                    &times;
                </button>

                <div className="text-center mb-6">
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">¡LO QUIERO! 🚀</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Completá tus datos para recibir la base de datos completa.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-1.5 rounded-full text-xs font-black border border-blue-100 dark:border-blue-800 shadow-sm">
                        <span>1 CONTACTO X $100 ARS</span>
                    </div>
                </div>

                <div className="space-y-5">
                    {/* Quantity */}
                    <div>
                        <div className="flex justify-between items-end mb-1.5">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">1. Cantidad de contactos</label>
                            <span className="text-xs text-blue-500 font-bold">{totalAvailable} disponibles</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={quantity}
                                onChange={(e) => {
                                    const valStr = e.target.value.replace(/\D/g, '');
                                    if (valStr === '') {
                                        setQuantity('');
                                        return;
                                    }
                                    let val = parseInt(valStr);
                                    if (val > totalAvailable) val = totalAvailable;
                                    setQuantity(val);
                                }}
                                className="flex-1 px-5 py-3 border-2 border-gray-100 dark:border-gray-800 bg-transparent rounded-2xl text-black dark:text-white font-black text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                            />
                            <button
                                onClick={() => setQuantity(totalAvailable)}
                                className="px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl transition-colors text-sm"
                            >
                                Todos
                            </button>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">2. Tu Email</label>
                            <input
                                type="email"
                                name="checkout_email"
                                autoComplete="email"
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
                                className={`w-full px-5 py-3 border-2 bg-transparent rounded-2xl text-black dark:text-white font-medium focus:ring-4 transition-all outline-none ${emailError ? 'border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 focus:ring-red-100 dark:focus:ring-red-900/20 focus:border-red-400' : 'border-gray-100 dark:border-gray-800 focus:border-blue-500 focus:ring-blue-500/10'
                                    }`}
                            />
                            {emailError && <p className="text-red-500 text-[10px] mt-1 font-bold">{emailError}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">3. Tu WhatsApp</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3 text-xl" title="Argentina">🇦🇷</span>
                                <input
                                    type="tel"
                                    name="checkout_phone"
                                    autoComplete="tel"
                                    placeholder="11 1234-5678"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                                    maxLength={10}
                                    className="w-full pl-14 pr-5 py-3 border-2 bg-transparent border-gray-100 dark:border-gray-800 rounded-2xl text-black dark:text-white font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
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
                    <div className="relative space-y-3">
                        <MercadoPagoButton
                            amount={total}
                            searchId={searchId}
                            clientPhone={`+549${whatsapp}`}
                            clientEmail={email}
                            quantity={numericQuantity}
                            rubro={rubro}
                            provincia={provincia}
                            localidades={localidades}
                            coords={coords}
                            disabled={!canProceedToPay}
                            className={`w-full py-4.5 rounded-2xl font-black text-xl shadow-2xl transition-all flex justify-center items-center gap-3 text-white transform active:scale-95 ${canProceedToPay
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
                    <div>
                        <p className="font-bold">Entrega inmediata:</p>
                        <p>Te enviaremos el Excel descargable a tu Email y WhatsApp al confirmar el pago.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Localities Modal Component
function LocalitiesModal({
    localidades,
    onClose
}: {
    localidades: string[],
    onClose: () => void
}) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60] backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-[#0B0F19] rounded-3xl shadow-2xl p-8 max-w-md w-full relative border border-gray-100 dark:border-gray-800 animate-scale-up">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-100 text-3xl font-light transition cursor-pointer"
                >
                    &times;
                </button>

                <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">Regiones Seleccionadas 📍</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Estas son las localidades incluidas en tu búsqueda.</p>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {localidades.length > 0 ? (
                        localidades.map((loc, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl border border-blue-100/50 dark:border-blue-800/30 text-blue-900 dark:text-blue-200 font-bold text-sm">
                                <span className="w-6 h-6 bg-blue-600 text-white rounded-lg flex items-center justify-center text-[10px] shrink-0 font-black">{idx + 1}</span>
                                {loc}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-400 font-bold">
                            Cargando datos de regiones...
                        </div>
                    )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-gray-900 dark:bg-blue-600 text-white font-black rounded-2xl hover:bg-black dark:hover:bg-blue-700 transition-colors shadow-lg"
                    >
                        CERRAR LISTADO
                    </button>
                </div>
            </div>
        </div>
    );
}



function normalizeLocalidad(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildDiversePreview(leads: Lead[], selectedLocalidades: string[], limit = 5): Lead[] {
    if (leads.length <= limit) return leads;

    const selectedIds = new Set<string>();
    const preview: Lead[] = [];
    const preferredKeys = Array.from(
        new Set(
            selectedLocalidades
                .map((loc) => normalizeLocalidad(loc))
                .filter(Boolean)
        )
    );

    const localidadMatches = (leadLocalidad: string | null | undefined, key: string) => {
        const leadKey = normalizeLocalidad(leadLocalidad);
        if (!leadKey || !key) return false;
        return leadKey === key || leadKey.includes(key) || key.includes(leadKey);
    };

    // First pass: one lead per selected locality (if available)
    for (const key of preferredKeys) {
        if (preview.length >= limit) break;
        const candidate = leads.find(
            (lead) => !selectedIds.has(lead.id) && localidadMatches(lead.localidad, key)
        );
        if (candidate) {
            preview.push(candidate);
            selectedIds.add(candidate.id);
        }
    }

    // Second pass: keep filling with selected localities (second round, third round...)
    if (preview.length < limit && preferredKeys.length > 0) {
        let added = true;
        while (preview.length < limit && added) {
            added = false;
            for (const key of preferredKeys) {
                if (preview.length >= limit) break;
                const candidate = leads.find(
                    (lead) => !selectedIds.has(lead.id) && localidadMatches(lead.localidad, key)
                );
                if (candidate) {
                    preview.push(candidate);
                    selectedIds.add(candidate.id);
                    added = true;
                }
            }
        }
    }

    // Final fallback: complete with whatever remains
    if (preview.length < limit) {
        for (const lead of leads) {
            if (preview.length >= limit) break;
            if (selectedIds.has(lead.id)) continue;
            preview.push(lead);
            selectedIds.add(lead.id);
        }
    }

    return preview;
}

function normalizeLocalidadLabel(localidad: string) {
    const trimmed = localidad.trim();
    if (trimmed.toLowerCase() === 'el tala') return 'El Talar';
    return trimmed;
}

// Detect email provider for smart redirect - uses authuser param for Gmail to open correct account
function getEmailProvider(email: string): { name: string; url: string; icon: string } {
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (domain.includes('gmail'))
        return { name: 'Abrir Gmail', url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`, icon: 'gmail' };
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live'))
        return { name: 'Abrir Outlook', url: `https://outlook.live.com/mail/0/?login_hint=${encodeURIComponent(email)}`, icon: 'outlook' };
    if (domain.includes('yahoo'))
        return { name: 'Abrir Yahoo Mail', url: 'https://mail.yahoo.com', icon: 'yahoo' };
    if (domain.includes('icloud') || domain.includes('me.com'))
        return { name: 'Abrir iCloud Mail', url: 'https://www.icloud.com/mail', icon: 'icloud' };
    if (domain.includes('proton'))
        return { name: 'Abrir ProtonMail', url: 'https://mail.proton.me', icon: 'proton' };
    return { name: 'Revisar mi Email', url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`, icon: 'generic' };
}

// Confetti colors
const CONFETTI_COLORS = ['#3B82F6', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

function SuccessModal({
    quantity,
    email,
    rubro,
    localidades,
    onNewSearch,
    onClose
}: {
    quantity: number;
    email: string;
    rubro: string;
    localidades: string[];
    onNewSearch: () => void;
    onClose: () => void;
}) {
    const provider = getEmailProvider(email);

    // Generate confetti pieces
    const confettiPieces = React.useMemo(() =>
        Array.from({ length: 40 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 2,
            duration: 2 + Math.random() * 2,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            size: 4 + Math.random() * 8,
            rotation: Math.random() * 360,
        })),
    []);

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

            {/* Confetti layer */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-[71]">
                {confettiPieces.map((piece) => (
                    <div
                        key={piece.id}
                        className="absolute animate-confetti-fall"
                        style={{
                            left: `${piece.left}%`,
                            top: '-20px',
                            width: `${piece.size}px`,
                            height: `${piece.size * 1.5}px`,
                            backgroundColor: piece.color,
                            borderRadius: piece.size > 8 ? '2px' : '50%',
                            animationDelay: `${piece.delay}s`,
                            animationDuration: `${piece.duration}s`,
                            transform: `rotate(${piece.rotation}deg)`,
                        }}
                    />
                ))}
            </div>

            {/* Modal */}
            <div className="relative z-[72] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-scale-up border border-gray-100 dark:border-gray-800">
                {/* Close X */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-100 text-2xl font-light transition cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                    &times;
                </button>

                {/* Success icon with glow */}
                <div className="mx-auto w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20 animate-bounce-once">
                    <BiCheckShield className="text-emerald-500 text-4xl" />
                </div>

                <h2 className="text-2xl font-black text-center text-gray-900 dark:text-white mb-1 tracking-tight">
                    Felicitaciones!
                </h2>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-5">
                    Tu compra fue procesada con exito
                </p>

                {/* Purchase details card */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-6 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contactos</span>
                        <span className="text-lg font-black text-blue-600 dark:text-blue-400">{quantity}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rubro</span>
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{rubro}</span>
                    </div>
                    {localidades.length > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zona</span>
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 text-right max-w-[200px] truncate">
                                {localidades.slice(0, 3).join(', ')}{localidades.length > 3 ? ` +${localidades.length - 3}` : ''}
                            </span>
                        </div>
                    )}
                </div>

                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Enviamos tus <span className="font-bold text-blue-600 dark:text-blue-400">{quantity} contactos</span> a{' '}
                    <span className="font-bold text-gray-900 dark:text-white">{email}</span>
                </p>

                <div className="flex flex-col gap-3">
                    <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-center rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                        <FaEnvelope /> {provider.name}
                    </a>
                    <button
                        onClick={() => { onClose(); onNewSearch(); }}
                        className="w-full px-6 py-3.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-center rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                    >
                        <FaSearch /> Nueva Busqueda
                    </button>
                </div>
            </div>
        </div>
    );
}

function LeadsApp() {
    const [rubro, setRubro] = useState('');
    const [provincia, setProvincia] = useState('Argentina');
    const [localidades, setLocalidades] = useState<string[]>([]);
    const [dynamicLocalidades, setDynamicLocalidades] = useState<Record<string, string[]>>({});
    const [isLoadingGeo, setIsLoadingGeo] = useState({ localities: false });
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<Lead[]>([]);
    const [count, setCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPayment, setShowPayment] = useState(false);
    const [showLocsModal, setShowLocsModal] = useState(false);
    const [isLocalidadModalOpen, setIsLocalidadModalOpen] = useState(false);
    const [purchaseSummary, setPurchaseSummary] = useState<PurchaseSummary | null>(null);

    // Search-specific states
    const [searchId, setSearchId] = useState<string | null>(null);
    const [searchStatus, setSearchStatus] = useState<string>('idle');
    const [isProcessing, setIsProcessing] = useState(false); // Polling for bot or MP
    const [isInitialSearch, setIsInitialSearch] = useState(false); // Polling for bot
    const [pollCount, setPollCount] = useState(0);
    const [currentLocIndex, setCurrentLocIndex] = useState(0);
    const [displayProgress, setDisplayProgress] = useState(0);
    const [searchCoords, setSearchCoords] = useState<Record<string, { lat: number, lon: number }>>({});
    const [downloadToken, setDownloadToken] = useState<string | null>(null);
    const [currentBusinessName, setCurrentBusinessName] = useState<string | null>(null);
    const [detectedPaymentId, setDetectedPaymentId] = useState<string | null>(null);
    const [deliveryStatus, setDeliveryStatus] = useState<string | null>('pending');
    const [visualProgress, setVisualProgress] = useState(0);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successModalReady, setSuccessModalReady] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();
    const hasVerifiedPayment = React.useRef(false);
    const progressSectionRef = React.useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const loadLocalidades = async () => {
            setIsLoadingGeo(prev => ({ ...prev, localities: true }));
            try {
                const provincesRes = await axios.get('/api/geo/provincias');
                const provincias = (provincesRes.data || []) as Array<{ id: number; provincia: string }>;

                const localityResponses = await Promise.all(
                    provincias.map((prov) =>
                        axios.get(`/api/geo/localidades?provincia_id=${prov.id}`).then((res) => ({
                            provincia: prov.provincia,
                            rows: (res.data || []) as Array<{ localidad: string }>
                        }))
                    )
                );

                const groupedByProvincia: Record<string, string[]> = {};
                localityResponses.forEach(({ provincia: provName, rows }) => {
                    const normalizedList = Array.from(
                        new Set(
                            rows
                                .map((item) => item.localidad)
                                .filter((item): item is string => Boolean(item))
                                .map((item) => normalizeLocalidadLabel(item))
                                .filter((item): item is string => Boolean(item))
                        )
                    ).sort((a, b) => a.localeCompare(b, 'es'));

                    if (normalizedList.length > 0) {
                        groupedByProvincia[provName] = normalizedList;
                    }
                });

                setDynamicLocalidades(groupedByProvincia);
            } catch (error) {
                console.error('Error loading localities:', error);
            } finally {
                setIsLoadingGeo(prev => ({ ...prev, localities: false }));
            }
        };
        loadLocalidades();
    }, []);

    // 1. Rehydration: Load active search from localStorage or URL
    useEffect(() => {
        const urlSearchId = searchParams.get('searchId');
        const paymentStatus = searchParams.get('payment');
        const savedSearchStr = localStorage.getItem('active_search');
        const savedSearch = savedSearchStr ? JSON.parse(savedSearchStr) : null;

        // Restore metadata if available and relevant
        if (savedSearch) {
            const { id, rubro: sRubro, localidades: sLocs, timestamp } = savedSearch;
            // If ID matches or no ID in URL, restore
            if (!urlSearchId || urlSearchId === id) {
                if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                    setRubro(sRubro);
                    setProvincia('Argentina');
                    setLocalidades(sLocs);
                    if (!urlSearchId) setSearchId(id);
                }
            }
        }

        if (urlSearchId) {
            setSearchId(urlSearchId);

            const purchaseSummaryRaw = localStorage.getItem(`pending_purchase_${urlSearchId}`);
            if (purchaseSummaryRaw) {
                try {
                    const parsed = JSON.parse(purchaseSummaryRaw) as PurchaseSummary;
                    setPurchaseSummary(parsed);
                } catch (parseError) {
                    console.error('Could not parse pending purchase summary:', parseError);
                }
            }

            if (paymentStatus === 'success') {
                setIsProcessing(true);
                setSearchStatus('processing_deep');
                setIsInitialSearch(false);

                // FALLBACK: Auto-verify payment if webhook is delayed
                const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
                if (paymentId) {
                    setDetectedPaymentId(paymentId);
                    localStorage.setItem(`last_payment_id_${urlSearchId}`, paymentId);
                }

                if (paymentId && !hasVerifiedPayment.current) {
                    hasVerifiedPayment.current = true;
                    setSearchStatus('verifying_payment');
                    console.log('Payment success detected in URL, triggering manual verification fallback...');
                    axios.post('/api/payment/verify', {
                        paymentId,
                        searchId: urlSearchId
                    }).then(res => {
                        console.log('Manual payment verification result:', res.data);
                        if (res.data.status === 'delivery_triggered_no_enrichment') {
                            setSearchStatus('completed');
                            setDisplayProgress(100);
                            setIsProcessing(false);
                            // Refresh results to show 0 if that's the case
                            axios.get(`/api/search/status?id=${urlSearchId}`).then(sRes => {
                                if (sRes.data.results) {
                                    setResults(sRes.data.results);
                                    setCount(sRes.data.count || 0);
                                }
                            });
                        } else {
                            setSearchStatus('processing_deep');
                        }
                    }).catch(err => {
                        console.error('Manual payment verification failed:', err);
                        setSearchStatus('processing_deep');
                    });
                }
            } else {
                setIsInitialSearch(true);
                setSearchStatus('scraping');
            }
        }
    }, [searchParams]);

    React.useEffect(() => {
        let timer: NodeJS.Timeout;
        let ticker: NodeJS.Timeout;
        let progressInterval: NodeJS.Timeout;

        if (isInitialSearch && searchId) {
            setDisplayProgress(5); // Start at 5%

            // Ticker for localities
            ticker = setInterval(() => {
                setCurrentLocIndex(prev => (prev + 1) % (localidades.length || 1));
            }, 3000);

            // Slow fake progress: only crawls to 20% max, then real bot status takes over
            progressInterval = setInterval(() => {
                setDisplayProgress(prev => {
                    if (prev >= 20) return prev; // Cap fake progress at 20% - real bot status takes over from here

                    const increment = prev < 10 ? 0.8 : 0.3;
                    return Math.min(prev + increment, 20);
                });
            }, 600);

            const pollStatus = async () => {
                if (!searchId) return;
                console.log(`[Frontend] Polling status for searchId: ${searchId}`);
                try {
                    const response = await axios.get(`/api/search/status?id=${searchId}`);
                    const { status, results: polledResults, count: polledCount, bot_job_id, error: serverError } = response.data;

                    console.log(`[Frontend] Server response for ${searchId}:`, { status, count: polledCount, bot_job_id, hasResults: !!polledResults, error: serverError });

                    if (bot_job_id && !searchParams.get('searchId')) {
                        console.log(`[Search Link] Internal ID: ${searchId} -> Bot Job ID: ${bot_job_id}`);
                        // Sync with URL for recovery without full re-render
                        const params = new URLSearchParams(window.location.search);
                        params.set('searchId', searchId);
                        window.history.replaceState(null, '', `?${params.toString()}`);
                    }

                    if (response.data.deliveryStatus) {
                        setDeliveryStatus(response.data.deliveryStatus);
                    }

                    if (status) {
                        setSearchStatus(status);
                        // Rehydrate metadata if missing (CRITICAL for the LocsModal)
                        if (!rubro && response.data.rubro) setRubro(response.data.rubro);
                        if ((!localidades || localidades.length === 0) && response.data.localidades) {
                            setLocalidades(response.data.localidades);
                        }

                        // Parse real bot progress from status like "Procesando (2/4)..."
                        const botMatch = status.match(/\((\d+)\/(\d+)\)/);
                        if (botMatch) {
                            const done = parseInt(botMatch[1]);
                            const total = parseInt(botMatch[2]);
                            if (total > 0) {
                                // Map bot progress 0-100% to display 20-90%
                                const botPct = (done / total) * 100;
                                const mapped = Math.floor(20 + (botPct * 0.70));
                                setDisplayProgress(prev => Math.max(prev, mapped));
                            }
                        }
                    }

                    if (status === 'completed') {
                        setIsInitialSearch(false);
                        setIsLoading(false);
                        setDisplayProgress(100); // Jump to 100%
                        localStorage.removeItem('active_search');

                        if (polledResults && polledResults.length > 0) {
                            setResults(polledResults);
                            setCount(polledCount || 0);
                            setSearchStatus('completed');
                        } else {
                            // Fallback to DB if no results in tracking row
                            const fallbackResponse = await axios.post('/api/search', {
                                rubro: response.data.rubro || rubro,
                                provincia: provincia || 'Argentina',
                                localidades: response.data.localidades || localidades
                            });
                            setResults(fallbackResponse.data.leads || []);
                            setCount(fallbackResponse.data.count || 0);
                            setSearchStatus('completed');
                        }
                    } else if (status === 'error') {
                        setIsInitialSearch(false);
                        setIsLoading(false);
                        setSearchStatus('error');
                        setDisplayProgress(0);
                        setError('Ocurrió un error en la búsqueda paralela.');
                    }
                } catch (err) {
                    console.error('Bot polling error:', err);
                }
            };

            // Immediate check
            pollStatus();
            timer = setInterval(pollStatus, 1500); // Optimized to 1.5s
        }
        return () => {
            if (timer) clearInterval(timer);
            if (ticker) clearInterval(ticker);
            if (progressInterval) clearInterval(progressInterval);
        };
    }, [isInitialSearch, searchId, localidades, searchParams, rubro, provincia, router]);

    // 3. Post-Payment Polling (enrichment progress + completion)
    React.useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isProcessing) {
            timer = setInterval(async () => {
                // GUARD: Only poll if we have the searchId (rehydration happens inside loop)
                if (!searchId) {
                    console.log('Skipping poll: No searchId found.');
                    return;
                }

                console.log('Polling status after payment...', { searchId, rubro });
                try {
                    // 1. Check enrichment progress
                    try {
                        const enrichRes = await axios.get(`/api/enrichment/status?searchId=${searchId}`);
                        const enrichData = enrichRes.data;

                        if (enrichData.status === 'processing' && enrichData.total > 0) {
                            const pct = Math.floor((enrichData.processed / enrichData.total) * 100);
                            setSearchStatus(`enriching_${pct}`);
                            // Don't set displayProgress directly - calculateProgress() maps
                            // enriching_XX to 60-90% range and visualProgress smooths the animation
                            if (enrichData.currentBusinessName) {
                                setCurrentBusinessName(enrichData.currentBusinessName);
                            }
                        }

                        if (enrichData.downloadToken) {
                            setDownloadToken(enrichData.downloadToken);
                        }
                    } catch {
                        // Enrichment status endpoint may not exist yet, continue with search status
                    }

                    // 2. Check search_tracking status for completion
                    if (searchId) {
                        const statusRes = await axios.get(`/api/search/status?id=${searchId}`);
                        const { status: currentStatus, rubro: sRubro, localidades: sLocs } = statusRes.data;

                        if (currentStatus && !currentStatus.startsWith?.('enriching_')) {
                            // Don't overwrite with 'completed' during post-payment -
                            // that's the initial search status, not the enrichment status
                            if (!(currentStatus === 'completed' && isProcessing)) {
                                setSearchStatus(currentStatus);
                            }
                        }

                        if (statusRes.data.deliveryStatus) {
                            setDeliveryStatus(statusRes.data.deliveryStatus);
                        }

                        // Rehydrate metadata if missing (happens on post-payment return)
                        if (!rubro && sRubro) setRubro(sRubro);
                        if ((!localidades || localidades.length === 0) && sLocs) {
                            setLocalidades(sLocs);
                        }

                        if (currentStatus === 'completed_deep' || currentStatus?.toLowerCase().includes('enviados')) {
                            const effectiveRubro = rubro || sRubro;
                            const effectiveLocalidades = (localidades && localidades.length > 0) ? localidades : (sLocs || []);

                            // Wait for metadata rehydration before fetching full leads.
                            if (!effectiveRubro || !effectiveLocalidades || effectiveLocalidades.length === 0) {
                                return;
                            }

                            // Fetch download token if we don't have it yet
                            if (!downloadToken) {
                                try {
                                    const enrichRes = await axios.get(`/api/enrichment/status?searchId=${searchId}`);
                                    if (enrichRes.data.downloadToken) {
                                        setDownloadToken(enrichRes.data.downloadToken);
                                    }
                                } catch { /* ignore */ }
                            }

                            // Fetch full results from DB.
                            const response = await axios.post(`/api/search?full=true`, {
                                rubro: effectiveRubro,
                                provincia,
                                localidades: effectiveLocalidades
                            });
                            const leads = response.data.leads || [];
                            setResults(leads);
                            setIsProcessing(false);
                            setIsLoading(false);
                            setError(null);

                            // Queue success modal - will show after progress bar reaches 100%
                            const finalDelivery = statusRes.data.deliveryStatus || deliveryStatus;
                            if (finalDelivery === 'sent') {
                                setSuccessModalReady(true);
                            }

                            clearInterval(timer);
                            return;
                        }
                    }

                    setPollCount(prev => prev + 1);
                    if (pollCount > 100) { // Extended timeout for enrichment
                        setIsProcessing(false);
                        setIsLoading(false);
                        setError('El procesamiento está tardando. Te avisaremos por email apenas terminen de enviarse.');
                        clearInterval(timer);
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 3000);
        }

        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isProcessing, searchId, rubro, provincia, localidades, pollCount, downloadToken]);

    // Queue success modal when delivery is confirmed - actual display waits for progress bar
    const hasShownSuccessRef = React.useRef(false);
    useEffect(() => {
        if (deliveryStatus === 'sent' && purchaseSummary && !hasShownSuccessRef.current) {
            hasShownSuccessRef.current = true;
            setSuccessModalReady(true);
        }
    }, [deliveryStatus, purchaseSummary]);

    // Only show success modal AFTER the progress bar visually reaches 100%
    useEffect(() => {
        if (successModalReady && visualProgress >= 100 && !showSuccessModal) {
            // Small delay so the user sees 100% before the modal pops
            const timeout = setTimeout(() => setShowSuccessModal(true), 800);
            return () => clearTimeout(timeout);
        }
    }, [successModalReady, visualProgress, showSuccessModal]);

    useEffect(() => {
        // Auto-scroll during initial search AND post-payment processing
        const shouldShowProgress = (isLoading || isInitialSearch || isProcessing) && searchStatus !== 'idle';
        if (!shouldShowProgress || !searchId) return;

        // One-time scroll guard per search phase (separate keys for search vs post-payment)
        const scrollKey = isProcessing
            ? `scrolled_${searchId}_postpayment`
            : `scrolled_${searchId}_search`;
        if (sessionStorage.getItem(scrollKey)) return;

        const section = progressSectionRef.current;
        if (!section) return;

        const rect = section.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if (!isVisible) {
            const timeoutId = setTimeout(() => {
                const absoluteTop = window.scrollY + section.getBoundingClientRect().top - 24;
                window.scrollTo({
                    top: Math.max(absoluteTop, 0),
                    behavior: 'smooth'
                });
                sessionStorage.setItem(scrollKey, 'true');
            }, 150);
            return () => clearTimeout(timeoutId);
        }
    }, [isLoading, isInitialSearch, isProcessing, searchId, searchStatus]);

    // Unified Progress Side-Effect (Smooth Animation)
    const targetProgressRef = React.useRef(0);

    useEffect(() => {
        const target = calculateProgress(searchStatus);
        if (searchStatus === 'idle' || !searchId) {
            targetProgressRef.current = 0;
            setVisualProgress(0);
            return;
        }
        // Monotonic: only allow target to increase
        if (target > targetProgressRef.current) {
            targetProgressRef.current = target;
        }
    }, [searchStatus, deliveryStatus, displayProgress, searchId]);

    useEffect(() => {
        const interval = setInterval(() => {
            setVisualProgress(prev => {
                const target = targetProgressRef.current;
                // Instant reset
                if (target === 0) return 0;
                // Already at or past target
                if (prev >= target) return prev;
                // Very smooth increment: slow crawl to target
                const diff = target - prev;
                const step = Math.max(0.5, Math.ceil(diff / 25));
                return Math.min(prev + step, target);
            });
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const calculateProgress = (status: string) => {
        // Stop progress on failure
        if (deliveryStatus === 'failed') return 0;

        // 100% ONLY when email is actually delivered
        if (deliveryStatus === 'sent') return 100;

        // Initial search completed (pre-payment)
        if (status === 'completed' && !isProcessing) return 100;

        // Search completed but in post-payment: waiting for enrichment to start
        if (status === 'completed' && isProcessing) return 25;

        // Sending email phase -> 95%
        if (status === 'completed_deep' || status.toLowerCase().includes('enviados')) return 95;

        // Enrichment progress -> slow crawl from 30% to 88%
        if (status.startsWith('enriching_')) {
            const pct = parseInt(status.split('_')[1]) || 0;
            // Map 0-100 of enrichment to 30-88 of total progress
            return Math.floor(30 + (pct * 0.58));
        }

        // Base states
        if (status === 'error' || status === 'idle') return 0;
        if (status === 'geolocating') return 5;

        // Post-payment states (gradual start)
        if (status === 'verifying_payment') return 8;
        if (status === 'processing_deep') return 15;

        // Initial search progress - Use displayProgress directly up to 95%
        if (displayProgress > 0) {
            return Math.floor(displayProgress);
        }

        if (status === 'scraping') return 10;

        return 0;
    };

    const getSearchStatusLabel = (status: string) => {
        if (deliveryStatus === 'failed') return '❌ ERROR: NO SE ENCONTRARON LEADS';
        if (deliveryStatus === 'sent') return '✅ ¡LEADS ENVIADOS A TU EMAIL!';
        if (status === 'verifying_payment') return '🔒 VERIFICANDO PAGO...';
        if (status === 'completed_deep' || status.toLowerCase().includes('enviados')) return '✉️ ENVIANDO EMAIL...';
        if (status === 'completed') return '✅ ¡BUSQUEDA FINALIZADA!';
        if (status === 'error') return '❌ ERROR EN EL PROCESO';
        if (status.includes('Geolocalizando') || status === 'geolocating') return '⚙️ GEOLOCALIZANDO...';
        if (status.startsWith('enriching_')) return '⌛ ENRIQUECIENDO CONTACTOS...';
        return '⌛ INICIANDO SCRAPER...';
    };

    const getDeliveryChannelMessage = (summary: PurchaseSummary) => {
        const hasEmail = Boolean(summary.email);
        const hasWhatsapp = Boolean(summary.whatsapp);
        if (hasEmail && hasWhatsapp) return 'Pronto enviaremos todos los datos a tu Email y WhatsApp.';
        if (hasEmail) return 'Pronto enviaremos todos los datos a tu Email.';
        if (hasWhatsapp) return 'Pronto enviaremos todos los datos a tu WhatsApp.';
        return 'Pronto enviaremos todos los datos por el canal que registraste.';
    };

    // 4. Reset/Cancel Search Logic
    const handleResetSearch = () => {
        const currentSearchId = searchId;

        // Internal state resets
        setIsInitialSearch(false);
        setIsLoading(false);
        setIsProcessing(false);
        setSearchId(null);
        setSearchStatus('idle');
        setError(null);
        setResults([]);
        setCount(null);
        setDisplayProgress(0);
        setVisualProgress(0);
        setSearchCoords({});
        setPollCount(0);
        setCurrentLocIndex(0);
        setPurchaseSummary(null);
        setDetectedPaymentId(null);
        setDeliveryStatus('pending');
        setDownloadToken(null);
        setProvincia('Argentina');
        setRubro('');
        setLocalidades([]);

        setVisualProgress(0);

        // Persistent storage cleanup
        localStorage.removeItem('active_search');
        if (currentSearchId) {
            localStorage.removeItem(`pending_purchase_${currentSearchId}`);
            localStorage.removeItem(`last_payment_id_${currentSearchId}`);
        }

        // URL cleanup
        const params = new URLSearchParams();
        router.replace(`/?${params.toString()}`);
    };

    const handleRemoveLocalidad = (loc: string) => {
        setLocalidades((prev) => prev.filter((item) => item !== loc));
    };

    const handleClearLocalidades = () => {
        setLocalidades([]);
    };

    const handleLocalidadesSave = (selectedLocalidades: string[]) => {
        setLocalidades(selectedLocalidades);
        setIsLocalidadModalOpen(false);
    };

    const handleSearch = async (fromPolling = false) => {
        if (!rubro || !provincia || localidades.length === 0) {
            setError('Por favor complete todos los campos.');
            return;
        }

        if (!fromPolling) {
            const currentSearchId = searchId;
            // Limpieza inmediata y explícita para evitar "datos fantasma"
            setResults([]);
            setCount(null);
            setSearchId(null);
            setSearchStatus('idle');
            setDisplayProgress(0);
            setIsInitialSearch(false);
            setIsProcessing(false);
            setPollCount(0);
            setCurrentLocIndex(0);
            setSearchCoords({});
            setPurchaseSummary(null);
            setDetectedPaymentId(null);
            setDeliveryStatus('pending');
            setDownloadToken(null);
            setVisualProgress(0);

            localStorage.removeItem('active_search');
            if (currentSearchId) {
                localStorage.removeItem(`pending_purchase_${currentSearchId}`);
                localStorage.removeItem(`last_payment_id_${currentSearchId}`);
            }
        }

        setIsLoading(true);
        setSearchStatus('geolocating');
        setDisplayProgress(5);
        setError(null);

        try {
            const response = await axios.post('/api/search', {
                rubro,
                provincia,
                localidades
            });

            // Extract the searchId from the response (always present now)
            const serverSearchId = response.data.searchId;
            setSearchId(serverSearchId);

            if (response.data.status === 'processing') {
                setIsInitialSearch(true);
                setSearchStatus('scraping');
                if (response.data.coords) {
                    setSearchCoords(response.data.coords);
                }

                // Update URL for recovery and CLEAR payment status
                const params = new URLSearchParams();
                params.set('searchId', serverSearchId);
                window.history.replaceState(null, '', `?${params.toString()}`);

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

            // Also update URL for DB hits so return from MP works
            const params = new URLSearchParams();
            params.set('searchId', serverSearchId);
            window.history.replaceState(null, '', `?${params.toString()}`);

            if (response.data.count === 0) {
                setError('No encontramos resultados for esta búsqueda.');
            } else if (fromPolling) {
                // If we come from polling, explicitly stop the loading and maybe show a brief success state
                setIsLoading(false);
                setIsInitialSearch(false);
                console.log('Search finished successfully after polling.');
            }
        } catch (err: unknown) {
            console.error(err);
            const apiError = axios.isAxiosError(err) ? err.response?.data?.error : null;
            setError(typeof apiError === 'string' ? apiError : 'Error al buscar. Intente nuevamente.');
            setSearchStatus('error');
        } finally {
            // Only stop loading if NOT waiting for initial search background process
            if (!isInitialSearch && searchStatus !== 'geolocating' && searchStatus !== 'scraping') {
                setIsLoading(false);
            }
        }
    };

    return (
        <main className="min-h-screen bg-transparent flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="max-w-4xl w-full space-y-8 relative">

                {/* Header with Theme Toggle */}
                <div className="absolute -top-6 md:top-0 right-0 z-50">
                    <ThemeToggle />
                </div>

                <div className="text-center mt-8 md:mt-0">
                    <h1 className="text-4xl font-extrabold text-blue-900 dark:text-white sm:text-5xl md:text-6xl tracking-tight">
                        Purosoftware <span className="text-blue-600 dark:text-blue-500">Leads</span> B2B
                    </h1>
                    <p className="mt-3 max-w-md mx-auto text-base text-gray-500 dark:text-gray-400 font-medium sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                        Potencia tu negocio con nuestra base de datos verificada y actualizada.
                    </p>
                </div>

                {/* Search Box */}
                <div className="bg-white dark:bg-[#111827] p-8 rounded-3xl shadow-2xl shadow-blue-900/5 dark:shadow-none border border-gray-100 dark:border-gray-800">
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Rubro */}
                        <div className="text-center">
                            <label htmlFor="rubro" className="block text-sm font-black tracking-wide text-gray-700 dark:text-gray-300 uppercase mb-2">
                                Rubro
                            </label>
                            <input
                                type="text"
                                id="rubro"
                                value={rubro}
                                onChange={(e) => setRubro(e.target.value)}
                                placeholder="Ej: hamburguesería, abogados, panadería..."
                                className="w-full rounded-2xl border-2 border-blue-200 dark:border-gray-700 bg-blue-50/50 dark:bg-[#0B0F19] px-5 py-4 text-center text-xl font-black text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:border-blue-500 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-[#0B0F19] focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30"
                            />
                            <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-500">
                                Escribí el tipo de negocio que querés buscar.
                            </p>
                        </div>
                    </div>

                    {/* Localidades */}
                    {Object.keys(dynamicLocalidades).length > 0 && (
                        <div className="mt-8 max-w-2xl mx-auto">
                            <label className="text-sm font-black tracking-wide text-gray-700 dark:text-gray-300 uppercase mb-2 block text-center">
                                Seleccioná las localidades
                            </label>

                            <div className="p-3 bg-gray-50 dark:bg-[#0B0F19] rounded-2xl border-none">
                                {(() => {
                                    if (isLoadingGeo.localities) {
                                        return <p className="text-xs text-center text-gray-400 dark:text-gray-600 py-8 font-medium">Cargando localidades...</p>;
                                    }

                                    return (
                                        <LocalidadSelector
                                            localidadesPorZona={dynamicLocalidades}
                                            localidades={localidades}
                                            onSave={handleLocalidadesSave}
                                            isOpen={isLocalidadModalOpen}
                                            onOpenChange={setIsLocalidadModalOpen}
                                        />
                                    );
                                })()}
                            </div>
                            <p className="text-xs text-right text-gray-500 dark:text-gray-400 mt-2 font-semibold">
                                Seleccionados: <span className="text-blue-600 dark:text-blue-400">{localidades.length}</span>
                            </p>
                            {localidades.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleClearLocalidades}
                                            className="text-xs font-bold text-red-500 hover:text-red-700"
                                        >
                                            Quitar todas
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {localidades.map((loc) => (
                                            <button
                                                key={loc}
                                                type="button"
                                                onClick={() => handleRemoveLocalidad(loc)}
                                                className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold inline-flex items-center gap-2 hover:bg-blue-100"
                                                title={`Quitar ${loc}`}
                                            >
                                                <span>{loc}</span>
                                                <span className="text-blue-600 font-black">×</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Search Button & Cancel/New Search */}
                    <div className="mt-8 flex flex-col items-center gap-4">
                        {/* Main Search Button - only visible when NOT searching and NO results and NO error */}
                        {!isLoading && !isInitialSearch && !isProcessing && results.length === 0 && !error && (
                            <button
                                onClick={() => handleSearch()}
                                className="w-full md:w-auto px-8 py-3 rounded-full text-white font-black text-lg shadow-2xl transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                            >
                                <FaSearch /> BUSCAR LEADS
                            </button>
                        )}

                        {/* Cancel Search Button - visible while searching/loading and NO error yet */}
                        {(isLoading || isInitialSearch || isProcessing) && !error && (
                            <button
                                onClick={handleResetSearch}
                                className="w-full md:w-auto px-8 py-3 rounded-full text-white font-black text-base shadow-xl transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                            >
                                ✕ Cancelar Búsqueda
                            </button>
                        )}

                        {/* New Search Button - visible after results arrive OR search error OR timeout error */}
                        {(results.length > 0 || searchStatus === 'error' || !!error) && !isLoading && !isInitialSearch && !isProcessing && (
                            <button
                                onClick={handleResetSearch}
                                className="w-full md:w-auto px-8 py-3 rounded-full text-white font-black text-base shadow-xl transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                            >
                                <FaSearch /> Nueva Búsqueda
                            </button>
                        )}
                    </div>

                    {/* Progress Bar & Status */}
                    {(isLoading || isInitialSearch || isProcessing) && searchStatus !== 'idle' && (
                        <div ref={progressSectionRef} className="mt-8 space-y-6">
                            <div className="flex flex-col items-center">
                                <div className={`${((isInitialSearch || isProcessing) && searchStatus !== 'completed' && searchStatus !== 'error' && searchStatus !== 'idle') ? 'h-auto py-8' : 'h-16'} flex items-center justify-center overflow-hidden w-full relative`}>
                                    {/* Big animation hub during initial search AND enrichment */}
                                    {((isInitialSearch || isProcessing) && searchStatus !== 'completed' && searchStatus !== 'error' && searchStatus !== 'idle') ? (
                                        <div className="flex flex-col items-center w-full max-w-lg">
                                            {/* Immersive Animation Container */}
                                            <div className="relative h-72 w-full flex items-center justify-center mb-4 perspective-1000">
                                                {/* Central Hub (Localidades dinámicas) */}
                                                <div className="relative z-10 w-36 h-36 bg-white rounded-[2rem] shadow-2xl flex items-center justify-center border-4 border-blue-500 animate-float overflow-hidden">
                                                    <div className="absolute inset-0 bg-gradient-to-b from-blue-50 to-white animate-pulse"></div>
                                                    <div className="relative z-20 flex flex-col items-center px-4 transition-all duration-500">
                                                        <FaMapMarkerAlt className="text-4xl text-blue-600 mb-2 drop-shadow-sm" />
                                                        <span className="text-[11px] font-black text-blue-900 uppercase tracking-tighter text-center leading-tight break-words max-w-[100px] h-8 flex items-center justify-center">
                                                            {isProcessing && currentBusinessName
                                                                ? currentBusinessName
                                                                : (localidades.length > 0
                                                                    ? localidades[currentLocIndex % localidades.length]
                                                                    : (searchStatus.includes('Geolocalizando') ? 'Localizando...' : 'Buscando...'))}
                                                        </span>
                                                    </div>
                                                    {/* Scan Line effect */}
                                                    <div className="absolute inset-x-0 h-1 bg-blue-400/20 animate-scan z-30"></div>
                                                </div>

                                                {/* Flying Contact Icons */}
                                                {[
                                                    { Icon: FaWhatsapp, color: 'text-green-500', delay: '0s', tx: '150px', ty: '-100px' },
                                                    { Icon: FaEnvelope, color: 'text-blue-400', delay: '0.8s', tx: '-140px', ty: '80px' },
                                                    { Icon: FaInstagram, color: 'text-pink-500', delay: '1.5s', tx: '120px', ty: '120px' },
                                                    { Icon: FaFacebook, color: 'text-blue-700', delay: '2.3s', tx: '-160px', ty: '-120px' },
                                                ].map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="absolute animate-contact-fly flex items-center justify-center"
                                                        style={
                                                            {
                                                                '--tw-translate-x': item.tx,
                                                                '--tw-translate-y': item.ty,
                                                                animationDelay: item.delay
                                                            } as React.CSSProperties & Record<'--tw-translate-x' | '--tw-translate-y', string>
                                                        }
                                                    >
                                                        <div className="p-3 bg-white rounded-full shadow-lg border border-gray-100">
                                                            <item.Icon className={`text-2xl ${item.color}`} />
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Pulse Rings */}
                                                <div className="absolute w-56 h-56 border-4 border-blue-500/10 rounded-full animate-pulse-ring"></div>
                                                <div className="absolute w-72 h-72 border-2 border-blue-400/5 rounded-full animate-pulse-ring delay-700"></div>
                                            </div>

                                            <div className="text-center mt-2 px-4 w-full">
                                                <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-700 tracking-tighter italic uppercase">
                                                    {(searchStatus.includes('Geolocalizando') || searchStatus === 'geolocating') ? 'LOCALIZANDO...' : 'BUSCANDO LEADS...'}
                                                </h3>
                                                <div className="h-6 overflow-hidden mt-1">
                                                    <p className="text-[10px] font-bold text-blue-400/70 uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping"></span>
                                                        {(searchStatus.includes('Geolocalizando') || searchStatus === 'geolocating')
                                                            ? 'PROCESANDO COORDENADAS'
                                                            : `ESCANEANDO EN ${(localidades.length > 0
                                                                ? localidades[currentLocIndex % localidades.length]
                                                                : 'PROGRESO').toUpperCase()}`
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Calm static label for enrichment/post-payment and completed states */
                                        <span className="text-lg font-bold text-blue-900 animate-pulse text-center px-4">
                                            {getSearchStatusLabel(searchStatus)}
                                        </span>
                                    )}
                                </div>

                                <div className="w-full mt-4 flex items-center gap-4">
                                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200 shadow-inner">
                                        <div
                                            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-150 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                            style={{ width: `${visualProgress}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-black text-blue-500 w-10">{visualProgress}%</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-3">
                                <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest">
                                    {searchStatus === 'geolocating' ? 'Estamos preparando el mapa de búsqueda...' :
                                        'No cierres esta pestaña. Los resultados aparecerán abajo automáticamente.'}
                                </p>
                            </div>

                            {/* Purchase summary removed - now shown in SuccessModal popup */}
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 flex flex-col items-center gap-4">
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 border border-red-200 dark:border-red-900/50 w-full shadow-lg shadow-red-500/10 transition-all animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <FaExclamationTriangle className="text-xl shrink-0" />
                                    <p className="font-bold text-sm">{error}</p>
                                </div>
                                <button
                                    onClick={handleResetSearch}
                                    className="whitespace-nowrap px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-tight shadow-md transition-all active:scale-95"
                                >
                                    Nueva Búsqueda
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Context for sorting */}
                {(() => {
                    const previewLeads = buildDiversePreview(results, localidades, 5);
                    const totalAvailable = count || results.length;
                    const remaining = Math.max(totalAvailable - previewLeads.length, 0);

                    return (
                        <>
                            {/* Results Section (Teaser) */}
                            {results.length > 0 && !isLoading && !isInitialSearch && (
                                <div className="animate-fade-in-up">
                                    <div className="mb-8 p-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-blue-800 animate-fade-in-up">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                                                <FaCheck className="text-white text-2xl" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-black text-2xl">¡Encontramos {count} clientes!</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] bg-white/20 text-blue-50 px-3 py-1.5 rounded-2xl font-bold uppercase tracking-wider flex flex-col items-center justify-center text-center leading-tight">
                                                        <span>Búsqueda</span>
                                                        <span>Exitosa</span>
                                                    </span>
                                                    <span className="text-[9px] bg-orange-400 text-white px-3 py-1.5 rounded-2xl font-bold uppercase tracking-wider flex flex-col items-center justify-center text-center leading-tight">
                                                        <span>1 contacto</span>
                                                        <span>x $100</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                                            <button
                                                onClick={() => setShowLocsModal(true)}
                                                className="px-6 py-3 text-white/80 hover:text-white font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 border border-white/20 hover:border-white/40 rounded-xl"
                                            >
                                                <FaMapMarkerAlt className="text-[10px]" /> Localidades Seleccionadas
                                            </button>
                                            <button
                                                onClick={() => setShowPayment(true)}
                                                className="w-full md:w-auto px-10 py-4 bg-white text-blue-700 hover:bg-blue-50 font-black text-xl rounded-2xl shadow-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                ¡LO QUIERO! 🚀
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mb-8">
                                        <LeadTable leads={previewLeads} remaining={remaining} />
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
                                    coords={searchCoords}
                                    detectedPaymentId={detectedPaymentId}
                                />
                            )}

                            {/* Success Modal after delivery */}
                            {showSuccessModal && purchaseSummary && (
                                <SuccessModal
                                    quantity={purchaseSummary.quantity}
                                    email={purchaseSummary.email}
                                    rubro={purchaseSummary.rubro || rubro}
                                    localidades={purchaseSummary.localidades?.length ? purchaseSummary.localidades : localidades}
                                    onNewSearch={handleResetSearch}
                                    onClose={() => setShowSuccessModal(false)}
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
          @apply flex-1 px-4 py-3 bg-transparent outline-none placeholder-gray-400;
          color: #000000 !important;
          font-weight: 900 !important;
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
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-confetti-fall {
          animation: confetti-fall linear forwards;
          opacity: 0;
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; }
          25% { opacity: 1; }
          50% { transform: translateY(45vh) rotate(360deg) scale(0.9); opacity: 0.8; }
          100% { transform: translateY(100vh) rotate(720deg) scale(0.3); opacity: 0; }
        }
        .animate-bounce-once {
          animation: bounce-once 0.6s ease-out forwards;
        }
        @keyframes bounce-once {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
            {showLocsModal && (
                <LocalitiesModal
                    localidades={localidades}
                    onClose={() => setShowLocsModal(false)}
                />
            )}
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
