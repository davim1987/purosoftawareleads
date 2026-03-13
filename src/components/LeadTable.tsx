import React, { useState } from 'react';
import { FaWhatsapp, FaInstagram, FaFacebook, FaEnvelope, FaGlobe, FaCopy, FaCheck, FaBuilding } from 'react-icons/fa';

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
    isWhatsappValid?: boolean;
}

export default function LeadTable({ leads, remaining }: { leads: Lead[], remaining: number }) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (text: string, id: string) => {
        if (!text || text === 'null') return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getContactNumber = (lead: Lead) => {
        if (lead.whatsapp && lead.whatsapp !== 'null') return lead.whatsapp;
        if (lead.telefono2 && lead.telefono2 !== 'null') return lead.telefono2;
        return null;
    };

    const truncate = (str: string | null | undefined, length: number) => {
        if (!str || str === 'null') return '—';
        return str.length > length ? str.substring(0, length) + '...' : str;
    };

    const cleanWeb = (web: string | null | undefined) => {
        if (!web || web === 'null') return '—';
        return web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    };

    return (
        <div className="w-full bg-white dark:bg-[#0B0F19] rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800/50 flex flex-col font-sans">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-[#111827] border-b border-gray-200 dark:border-gray-800 text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
                            <th className="px-5 py-4 font-semibold">#</th>
                            <th className="px-5 py-4 font-semibold">Negocio</th>
                            <th className="px-5 py-4 font-semibold">Ciudad</th>
                            <th className="px-5 py-4 font-semibold">Categoría</th>
                            <th className="px-5 py-4 font-semibold">Contacto</th>
                            <th className="px-5 py-4 font-semibold">Correo</th>
                            <th className="px-5 py-4 font-semibold">Web</th>
                            <th className="px-5 py-4 font-semibold text-center">Redes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50 text-sm">
                        {leads.map((lead, index) => {
                            const contact = getContactNumber(lead);
                            const copyIdContact = `${lead.id}-contact`;
                            const copyIdEmail = `${lead.id}-email`;
                            const copyIdWeb = `${lead.id}-web`;

                            return (
                                <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-[#1A2234] transition-colors duration-150 group">
                                    <td className="px-5 py-3.5 text-gray-400 dark:text-gray-500 font-medium text-xs">
                                        {index + 1}
                                    </td>

                                    {/* NEGOCIO */}
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-2 max-w-[200px]">
                                            <span className="text-gray-800 dark:text-gray-200 font-semibold truncate" title={lead.nombre}>
                                                {lead.nombre || 'Desconocido'}
                                            </span>
                                            {contact && <FaCheck className="text-emerald-500 text-[10px] shrink-0" title="Verificado" />}
                                        </div>
                                    </td>

                                    {/* CIUDAD */}
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#132A20] dark:text-emerald-400 dark:border-emerald-900/30">
                                            {truncate(lead.localidad, 20)}
                                        </span>
                                    </td>

                                    {/* CATEGORÍA */}
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#2A1313] dark:text-rose-400 dark:border-rose-900/30">
                                            {truncate(lead.rubro, 20)}
                                        </span>
                                    </td>

                                    {/* CONTACTO */}
                                    <td className="px-5 py-3.5">
                                        {contact ? (
                                            <div className="flex items-center gap-2 text-teal-600 dark:text-cyan-400 group/item cursor-pointer" onClick={() => handleCopy(contact, copyIdContact)}>
                                                <FaWhatsapp className="text-sm" />
                                                <span className="font-medium hover:text-teal-700 dark:hover:text-cyan-300 transition-colors">+{contact}</span>
                                                <button className="opacity-0 group-hover/item:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-white">
                                                    {copiedId === copyIdContact ? <FaCheck className="text-emerald-500" /> : <FaCopy />}
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 dark:text-gray-600">No disponible</span>
                                        )}
                                    </td>

                                    {/* CORREO */}
                                    <td className="px-5 py-3.5">
                                        {(lead.email && lead.email !== 'null') ? (
                                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 group/item cursor-pointer" onClick={() => handleCopy(lead.email!, copyIdEmail)}>
                                                <span className="truncate max-w-[150px] hover:text-gray-900 dark:hover:text-white transition-colors" title={lead.email}>
                                                    {lead.email}
                                                </span>
                                                <button className="opacity-0 group-hover/item:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-white shrink-0">
                                                    {copiedId === copyIdEmail ? <FaCheck className="text-emerald-500" /> : <FaCopy />}
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 dark:text-gray-600">No disponible</span>
                                        )}
                                    </td>

                                    {/* WEB */}
                                    <td className="px-5 py-3.5">
                                        {(lead.web && lead.web !== 'null') ? (
                                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 group/item cursor-pointer" onClick={() => handleCopy(lead.web!, copyIdWeb)}>
                                                <FaGlobe className="text-xs shrink-0" />
                                                <span className="truncate max-w-[120px] hover:text-blue-700 dark:hover:text-blue-300 transition-colors" title={lead.web}>
                                                    {cleanWeb(lead.web)}
                                                </span>
                                                <button className="opacity-0 group-hover/item:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-white shrink-0">
                                                    {copiedId === copyIdWeb ? <FaCheck className="text-emerald-500" /> : <FaCopy />}
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 dark:text-gray-600">—</span>
                                        )}
                                    </td>

                                    {/* REDES */}
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${contact ? 'bg-emerald-100 text-emerald-600 dark:bg-[#1D3228] dark:text-emerald-500' : 'bg-gray-100 text-gray-400 dark:bg-[#1F2937] dark:text-gray-600'}`}>
                                                <FaWhatsapp className="text-[10px]" />
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${(lead.instagram && lead.instagram !== 'null') ? 'bg-pink-100 text-pink-600 dark:bg-[#3A1D2B] dark:text-pink-500' : 'bg-gray-100 text-gray-400 dark:bg-[#1F2937] dark:text-gray-600'}`}>
                                                <FaInstagram className="text-[10px]" />
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${(lead.facebook && lead.facebook !== 'null') ? 'bg-blue-100 text-blue-600 dark:bg-[#1D253A] dark:text-blue-500' : 'bg-gray-100 text-gray-400 dark:bg-[#1F2937] dark:text-gray-600'}`}>
                                                <FaFacebook className="text-[10px]" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="bg-white dark:bg-[#0B0F19] px-6 py-4 text-center border-t border-gray-200 dark:border-gray-800 font-medium">
                {remaining > 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        ... y <span className="text-cyan-600 dark:text-cyan-400">{remaining}</span> resultados más esperando por ti en el Excel completo.
                    </p>
                ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                        Estos son todos los resultados encontrados.
                    </p>
                )}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 8px;
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #d1d5db;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #9ca3af;
                }
                :global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1F2937;
                }
                :global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #374151;
                }
                :global(.dark) .custom-scrollbar::-webkit-scrollbar-track {
                    background: #0B0F19;
                }
            `}</style>
        </div>
    );
}
