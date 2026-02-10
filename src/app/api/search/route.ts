import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import axios from 'axios';
import { maskEmail, maskPhone } from '@/lib/utils';

// Simple in-memory fallback for rate limiting if DB fails
// Map<IP, { count: number, resetTime: number }>
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

async function checkRateLimit(ip: string): Promise<boolean> {
    const ONE_DAY = 24 * 60 * 60 * 1000;

    try {
        // Supabase way: Use a table 'search_logs'
        // First, try to insert. If table doesn't exist, this will fail.
        // In a real Supabase setup, tables should be created via Dashboard or Migration.
        // We will assume it might fail and fallback.

        // Clean old logs (optional, or rely on RLS/Cron)
        // await supabase.from('search_logs').delete().lt('timestamp', new Date(Date.now() - ONE_DAY).toISOString());

        const { count, error } = await supabase
            .from('search_logs')
            .select('*', { count: 'exact', head: true })
            .eq('ip', ip)
            .gt('timestamp', new Date(Date.now() - ONE_DAY).toISOString());

        if (error) throw error;

        if ((count || 0) >= 3) {
            return false;
        }

        await supabase.from('search_logs').insert({ ip });
        return true;

    } catch (error) {
        console.warn('Rate limit DB check failed (table might not exist), falling back to memory.', error);

        const entry = rateLimitMap.get(ip);
        const now = Date.now();

        if (entry && now < entry.resetTime) {
            if (entry.count >= 3) return false;
            entry.count++;
            return true;
        }

        rateLimitMap.set(ip, { count: 1, resetTime: now + ONE_DAY });
        return true;
    }
}

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
        const body = await req.json();
        const { rubro, provincia, localidades } = body;

        if (!rubro || !localidades || !Array.isArray(localidades) || localidades.length === 0) {
            return NextResponse.json({ error: 'Missing required fields: rubro, localidades[]' }, { status: 400 });
        }

        // Rate Limit Check
        const allowed = await checkRateLimit(ip);
        if (!allowed) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 24 hours.' }, { status: 429 });
        }


        console.log(`Searching for preview: rubro: "${rubro}" in localities:`, localidades);

        // Step A: Call n8n for Preview (Count and Names only)
        let leads: any[] = [];
        let totalCount = 0;

        try {
            const webhookUrl = process.env.N8N_WEBHOOK_URL;
            if (webhookUrl) {
                console.log('Triggering n8n search for preview...');
                const n8nResponse = await axios.post(webhookUrl, {
                    tipo: 'preview_search', // Indicate this is just for preview
                    rubro,
                    provincia,
                    localidades
                });

                const data = n8nResponse.data;

                // Handle response format
                let newLeads = [];
                if (Array.isArray(data)) {
                    newLeads = data;
                    totalCount = data.length;
                } else if (data && data.leads) {
                    newLeads = data.leads;
                    totalCount = data.cantidad_leads || data.leads.length;
                }

                if (newLeads.length > 0) {
                    // Map names only for preview (sanitize as per user request "sin datos de contacto")
                    leads = newLeads.map((l: any) => ({
                        id: l.id || `preview-${Math.random().toString(36).substring(2, 9)}`,
                        nombre: l.Nombre || l.nombre || 'Nombre Reservado',
                        rubro: l.Rubro || l.rubro || rubro,
                        localidad: l.Localidad || l.localidad || '',
                        provincia: l.Provincia || l.provincia || provincia,
                        // Contact data is empty in this phase
                        direccion: null,
                        email: null,
                        whatsapp: null,
                        telefono2: null,
                        'whatssap secundario': null,
                        web: null,
                        instagram: null
                    }));
                }
            }
        } catch (error) {
            console.error('n8n preview search error:', error);
            return NextResponse.json({ error: 'Error al conectar con el servicio de búsqueda' }, { status: 500 });
        }

        // Return top 3 as preview
        const previewLeads = leads.slice(0, 3);
        const maskedLeads = previewLeads.map((lead: any) => ({
            ...lead,
            isWhatsappValid: false // Placeholder for preview
        }));

        // Send webhook notification for free search (with totalCount)
        try {
            const searchNotification = {
                tipo: 'consulta_gratis',
                rubro,
                provincia,
                localidades,
                resultados_encontrados: totalCount,
                timestamp: new Date().toISOString()
            };

            await fetch('https://n8n-n8n.3htcbh.easypanel.host/webhook-test/lead', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(searchNotification),
            });
        } catch (webhookError) {
            console.error('Error sending search notification webhook:', webhookError);
        }

        return NextResponse.json({
            count: totalCount,
            leads: maskedLeads
        });

    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
