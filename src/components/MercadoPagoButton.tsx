"use client";

import { initMercadoPago } from '@mercadopago/sdk-react';
import { useState } from 'react';

// Initialize Mercado Pago with Public Key
const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
if (publicKey) {
    initMercadoPago(publicKey);
} else {
    console.warn('Missing NEXT_PUBLIC_MP_PUBLIC_KEY. Mercado Pago checkout will be unavailable.');
}

interface MercadoPagoButtonProps {
    amount: number;
    searchId: string;
    clientPhone: string;
    clientEmail: string;
    quantity: number;
    rubro: string;
    provincia: string;
    localidades: string[];
    coords?: Record<string, { lat: number, lon: number }>;
    className?: string;
    disabled?: boolean;
    children?: React.ReactNode;
}

export default function MercadoPagoButton({
    amount,
    searchId,
    clientPhone,
    clientEmail,
    quantity,
    rubro,
    provincia,
    localidades,
    coords,
    className = "",
    disabled = false,
    children
}: MercadoPagoButtonProps) {
    const [loading, setLoading] = useState(false);

    const handlePayment = async () => {
        setLoading(true);
        try {
            // Persist purchase summary to rehydrate on return from Mercado Pago.
            try {
                localStorage.setItem(
                    `pending_purchase_${searchId}`,
                    JSON.stringify({
                        email: clientEmail || '',
                        whatsapp: clientPhone || '',
                        quantity,
                        amount,
                        rubro,
                        provincia,
                        localidades
                    })
                );
            } catch (storageError) {
                console.warn('Could not persist purchase summary:', storageError);
            }

            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    searchId,
                    amount,
                    clientPhone,
                    clientEmail,
                    quantity,
                    rubro,
                    provincia,
                    localidades,
                    coords
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const message = typeof data?.error === 'string' ? data.error : 'Error en checkout';
                throw new Error(message);
            }

            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                throw new Error(typeof data?.error === 'string' ? data.error : 'No init_point returned from API');
            }

        } catch (error) {
            console.error('Error initiating checkout:', error);
            const message = error instanceof Error ? error.message : 'Error al iniciar el pago';
            alert(`Error al iniciar el pago: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handlePayment}
            disabled={loading || disabled}
            className={className || "bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"}
        >
            {loading ? 'Procesando...' : (children || 'Pagar con Mercado Pago')}
        </button>
    );
}
