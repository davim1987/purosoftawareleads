"use client";

import { initMercadoPago } from '@mercadopago/sdk-react';
import { useState } from 'react';

// Initialize Mercado Pago with Public Key
initMercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!);

interface MercadoPagoButtonProps {
    amount: number;
    searchId: string;
    clientPhone: string;
    clientEmail: string;
    quantity: number;
    rubro: string;
    provincia: string;
    localidades: string[];
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
    className = "",
    disabled = false,
    children
}: MercadoPagoButtonProps) {
    const [loading, setLoading] = useState(false);

    const handlePayment = async () => {
        setLoading(true);
        try {
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
                    localidades
                }),
            });

            const data = await response.json();

            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                console.error('No init_point returned from API');
            }

        } catch (error) {
            console.error('Error initiating checkout:', error);
            alert('Error al iniciar el pago. Por favor revisa la consola o intenta nuevamente.');
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
