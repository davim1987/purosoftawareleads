'use client';

import React from 'react';
import Link from 'next/link';
import { FaTimesCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function FailurePage() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-2xl border border-gray-100 text-center animate-fade-in">
                <div className="flex justify-center mb-6">
                    <FaTimesCircle className="text-red-500 text-7xl" />
                </div>

                <h1 className="text-3xl font-extrabold text-red-900 mb-4">
                    Pago Cancelado
                </h1>

                <p className="text-gray-600 mb-8 leading-relaxed">
                    No se pudo completar el proceso de pago. Si tuviste algún problema con Mercado Pago, por favor intenta nuevamente.
                </p>

                <div className="bg-red-50 p-4 rounded-2xl flex items-start gap-4 border border-red-100 text-left mb-8">
                    <FaExclamationTriangle className="text-red-600 text-2xl mt-1 shrink-0" />
                    <div>
                        <p className="font-bold text-red-900 text-sm">¿Qué pasó?</p>
                        <p className="text-red-700 text-xs">Puede ser saldo insuficiente, tarjeta rechazada o simplemente cancelaste la operación.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <Link
                        href="/"
                        className="block w-full py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg transition transform hover:scale-105"
                    >
                        Reintentar Búsqueda
                    </Link>

                    <Link
                        href="/"
                        className="block text-sm font-semibold text-blue-600 hover:underline"
                    >
                        Volver al inicio
                    </Link>
                </div>
            </div>
        </main>
    );
}
