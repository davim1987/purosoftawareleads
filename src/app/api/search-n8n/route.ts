import { NextRequest, NextResponse } from 'next/server';
import { maskEmail, maskPhone } from '@/lib/utils';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { rubro, provincia, localidades } = body;

        if (!rubro || !localidades || !Array.isArray(localidades) || localidades.length === 0) {
            return NextResponse.json({ error: 'Missing required fields: rubro, localidades[]' }, { status: 400 });
        }

        const n8nUrl = process.env.N8N_SEARCH_ENDPOINT;
        if (!n8nUrl) {
            return NextResponse.json({ error: 'N8N endpoint not configured' }, { status: 500 });
        }

        console.log(`Calling n8n for rubro: "${rubro}" in localities:`, localidades);

        // Call n8n endpoint
        const response = await fetch(n8nUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rubro,
                provincia,
                localidades
            }),
        });

        if (!response.ok) {
            console.error('N8N request failed:', response.statusText);
            return NextResponse.json({ error: 'Failed to fetch leads from n8n' }, { status: 500 });
        }

        const data = await response.json();

        // Expected format from n8n:
        // {
        //   "cantidad_leads": 100,
        //   "mensaje": "Se encontraron 100 leads",
        //   "leads": [...]
        // }

        const totalLeads = data.cantidad_leads || 0;
        const allLeads = data.leads || [];

        // Take only first 3 for preview
        const previewLeads = allLeads.slice(0, 3);

        // Map n8n format to app format and mask data
        const maskedLeads = previewLeads.map((lead: any) => ({
            id: `n8n-${Math.random().toString(36).substring(2, 9)}`, // Generate temp ID
            rubro: lead.Rubro || rubro,
            nombre: lead.Nombre || '',
            razon_social: lead.Nombre || '',
            direccion: lead.Direccion || '',
            localidad: lead.Localidad || '',
            provincia: lead.Provincia || provincia,
            email: maskEmail(lead.Email || ''),
            whatsapp: maskPhone(lead.Whatssap || ''),
            telefono2: maskPhone(lead.Telefono2 || ''),
            'whatssap secundario': maskPhone(lead.WhatssapSecundario || ''),
            instagram: lead.instagram || null,
            web: lead.Web || null,
            isWhatsappValid: !!lead.Whatssap
        }));

        // Send webhook notification for free search
        try {
            const searchNotification = {
                tipo: 'consulta_gratis',
                rubro,
                provincia,
                localidades,
                resultados_encontrados: totalLeads,
                timestamp: new Date().toISOString(),
                fuente: 'n8n'
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
            // Don't fail the request if webhook fails
        }

        return NextResponse.json({
            count: totalLeads,
            leads: maskedLeads,
            mensaje: data.mensaje || `Se encontraron ${totalLeads} leads`
        });

    } catch (error) {
        console.error('N8N Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
