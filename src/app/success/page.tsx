'use client';

import React from 'react';
import Link from 'next/link';
import { FaCheckCircle, FaWhatsapp, FaEnvelope } from 'react-icons/fa';
import { BiCheckShield } from 'react-icons/bi';

export default function SuccessPage() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-2xl border border-gray-100 text-center animate-fade-in">
                <div className="flex justify-center mb-6">
                    <FaCheckCircle className="text-green-500 text-7xl animate-bounce" />
                </div>

                <h1 className="text-3xl font-extrabold text-blue-900 mb-4">
                    ¡Pago Confirmado!
                </h1>

                <p className="text-gray-600 mb-8 leading-relaxed">
                    Gracias por confiar en <strong>Purosoftware</strong>. Estamos procesando tu base de datos personalizada.
                </p>

                <div className="space-y-4 mb-10 text-left">
                    <div className="bg-blue-50 p-4 rounded-2xl flex items-start gap-4 border border-blue-100">
                        <FaWhatsapp className="text-green-600 text-2xl mt-1 shrink-0" />
                        <div>
                            <p className="font-bold text-blue-900 text-sm">Notificación por WhatsApp</p>
                            <p className="text-blue-700 text-xs">Te enviaremos el archivo Excel una vez que el deep scrape finalice.</p>
                        </div>
                    </div>

                    <div className="bg-orange-50 p-4 rounded-2xl flex items-start gap-4 border border-orange-100">
                        <FaEnvelope className="text-orange-600 text-2xl mt-1 shrink-0" />
                        <div>
                            <p className="font-bold text-orange-900 text-sm">Respaldo por Email</p>
                            <p className="text-orange-700 text-xs">También recibirás una copia en tu correo electrónico con los detalles.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <Link
                        href="/"
                        className="block w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transform transition hover:scale-105 active:scale-95"
                    >
                        Volver al Inicio
                    </Link>

                    <p className="text-xs text-gray-400">
                        Si tienes dudas, contáctanos a soporte@puro.software
                    </p>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-2 text-blue-500 font-semibold text-sm">
                    <BiCheckShield /> Seguridad Garantizada
                </div>
            </div>
        </main>
    );
}
