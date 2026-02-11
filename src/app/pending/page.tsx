'use client';

import React from 'react';
import Link from 'next/link';
import { FaClock, FaInfoCircle } from 'react-icons/fa';

export default function PendingPage() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-2xl border border-gray-100 text-center animate-fade-in">
                <div className="flex justify-center mb-6">
                    <FaClock className="text-yellow-500 text-7xl animate-pulse" />
                </div>

                <h1 className="text-3xl font-extrabold text-blue-900 mb-4">
                    Pago Pendiente
                </h1>

                <p className="text-gray-600 mb-8 leading-relaxed">
                    Tu pago está siendo procesado por Mercado Pago. Esto puede demorar unos minutos dependiendo del medio de pago elegido.
                </p>

                <div className="bg-yellow-50 p-4 rounded-2xl flex items-start gap-4 border border-yellow-100 text-left mb-8">
                    <FaInfoCircle className="text-yellow-600 text-2xl mt-1 shrink-0" />
                    <div>
                        <p className="font-bold text-yellow-900 text-sm">¿Qué sigue?</p>
                        <p className="text-yellow-700 text-xs">Apenas se acredite el pago, activaremos el proceso de envío de tus leads automáticamente.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <Link
                        href="/"
                        className="block w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition transform hover:scale-105"
                    >
                        Volver al Inicio
                    </Link>
                </div>
            </div>
        </main>
    );
}
