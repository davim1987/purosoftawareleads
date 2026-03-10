# Handoff técnico - Brave + Enrichment Worker

## 1) Objetivo del trabajo
Se robusteció la integración de enrichment para:
- usar contexto completo del negocio al consultar Brave Search,
- evitar que un `422` corte el flujo,
- mejorar trazabilidad en logs,
- mantener compatibilidad con el pipeline actual.

---

## 2) Archivos modificados

### A. `/Users/davidmorales/Creador de leads/src/lib/enrichment.ts`
Cambios:
- Se agregó `rubro` al tipo `Business` enviado al worker.
- En `fetchBusinessesForEnrichment(searchId)`, cada business ahora incluye `rubro` tomado de `orders.rubro`.

Impacto:
- El worker recibe más contexto para consultas Brave más precisas.

### B. `/Users/davidmorales/Creador de leads/enrichment-worker/main.py`
Cambios:
- En modelo `Business` se agregó:
  - `rubro: Optional[str] = None`
- En `enrich_single_business(...)`:
  - llamada nueva a `search_business(name, locality, provincia, rubro, existing_website)`
  - logs de contexto por negocio
  - logs de cantidad de resultados Brave (website/social/all_urls)

Impacto:
- El worker usa más señales para encontrar fuentes correctas.

### C. `/Users/davidmorales/Creador de leads/enrichment-worker/brave_search.py`
Cambios principales:
- Carga de env explícita con `load_dotenv()`.
- Variables de configuración Brave por env:
  - `BRAVE_COUNTRY`
  - `BRAVE_SEARCH_LANG`
  - `BRAVE_UI_LANG`
  - `BRAVE_COUNT`
  - `BRAVE_TIMEOUT_SECONDS`
- Construcción de query enriquecida:
  - `name + locality + provincia + rubro`
- Sanitización:
  - colapsa espacios
  - `count` clamped `1..20`
- Fallback automático ante `422`:
  1. intento full: `q,count,country,search_lang,ui_lang`
  2. intento compat: `q,count,country`
  3. intento mínimo: `q,count`
- Manejo explícito de errores:
  - `401/403` (auth)
  - timeout/network
  - body de respuesta en errores 4xx
- De-duplicación de `all_urls` por dominio.
- Log explícito si falta `BRAVE_API_KEY`.

Impacto:
- Se elimina `422` como error terminal en la mayoría de casos.

### D. `/Users/davidmorales/Creador de leads/enrichment-worker/.env.example`
Se agregaron:
- `BRAVE_COUNTRY=AR`
- `BRAVE_SEARCH_LANG=es`
- `BRAVE_UI_LANG=es-AR`
- `BRAVE_COUNT=10`
- `BRAVE_TIMEOUT_SECONDS=15`

---

## 3) Estado de validaciones realizadas

### Validaciones de código
- `npm run lint` en Next.js: OK.
- Parse sintáctico Python (`ast.parse`) en `main.py` y `brave_search.py`: OK.

### Validaciones funcionales
1. Worker health:
- `GET /health` respondió `{"status":"ok"}`.

2. Brave Search:
- Después de ajustes, devolvió resultados correctos, ejemplo:
  - `website: https://www.mcdonalds.com.ar/restaurantes/olivos`
  - `all_urls: [...]`

3. Escritura DB directa desde worker:
- Insert manual en `lead_sources` funcionó correctamente.

4. Enrichment test:
- Para `search_id = test-enrich-004` se guardó en `lead_sources`:
  - `source_type = website`
  - `domain = mcdonalds.com.ar`
- `lead_contacts` quedó vacío en esa prueba (no necesariamente error; depende de contenido scrapeable del sitio).

---

## 4) Incidencias detectadas y diagnóstico

### A. Error Brave 422 inicial
Mensaje clave observado:
- `Field required: x-subscription-token`

Causa:
- Header de token no estaba llegando correctamente (orden de carga/env en módulo).

Estado:
- Corregido en `brave_search.py` con `load_dotenv()` y validación explícita de `BRAVE_API_KEY`.

### B. Error TLS al scrapear con Python 3.9
Mensaje observado:
- `TLSV1_ALERT_PROTOCOL_VERSION` (LibreSSL)

Causa:
- Runtime Python 3.9 viejo para algunos endpoints TLS modernos.

Estado:
- Se migró entorno virtual a Python 3.11.

### C. Confusión en pruebas de `enrichment_jobs`
- Si se llama directo a `POST /enrich` con `job_id` manual, la fila de `enrichment_jobs` no se crea automáticamente por ese call.
- La creación de `enrichment_jobs` se hace en flujo Next (`startEnrichment`), no en una prueba aislada del worker.

---

## 5) Flujo actual del sistema (resumen)

1. Usuario envía búsqueda (`rubro + localidades`) a `/api/search`.
2. Backend consulta DB y/o lanza bot de búsqueda externo.
3. `search_tracking` guarda estado y `bot_job_id`.
4. `/api/search/status` hace polling y actualiza `search_tracking`.
5. Tras pago aprobado, backend dispara `startEnrichment(searchId)`.
6. `startEnrichment` crea `enrichment_jobs`, arma `businesses[]` y llama al worker (`/enrich`).
7. Worker:
   - consulta Brave,
   - scrapea URLs,
   - guarda `lead_sources` y `lead_contacts`,
   - hace callback a Next (`/api/enrichment/callback`).
8. Callback actualiza estado y entrega (CSV/email/download según flujo de orders).

---

## 6) Comandos útiles (operación local)

### Levantar worker
```bash
cd "/Users/davidmorales/Creador de leads/enrichment-worker"
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Health
```bash
curl "http://localhost:8001/health"
```

### Probar enrich directo
```bash
curl -X POST http://localhost:8001/enrich \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PY_WORKER_SECRET>" \
  -d '{
    "job_id": 999004,
    "search_id": "test-enrich-004",
    "businesses": [
      {
        "id": "biz-real-1",
        "name": "McDonalds Olivos",
        "locality": "Olivos",
        "provincia": "Buenos Aires",
        "rubro": "hamburgueseria",
        "existing_website": "https://www.mcdonalds.com.ar",
        "existing_phone": null,
        "existing_email": null
      }
    ]
  }'
```

### Ver datos guardados
```sql
select * from lead_sources where search_id='test-enrich-004' order by created_at desc;
select * from lead_contacts where search_id='test-enrich-004' order by created_at desc;
```

### Probar status de búsqueda (ojo con comillas en zsh)
```bash
curl "http://localhost:3000/api/search/status?id=<SEARCH_ID>"
```

---

## 7) Variables de entorno críticas

### Worker (`enrichment-worker/.env`)
- `PY_WORKER_SECRET`
- `BRAVE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CALLBACK_URL`
- `BRAVE_COUNTRY` (opcional, default AR)
- `BRAVE_SEARCH_LANG` (opcional, default es)
- `BRAVE_UI_LANG` (opcional, default es-AR)
- `BRAVE_COUNT` (opcional, default 10)
- `BRAVE_TIMEOUT_SECONDS` (opcional, default 15)

### Next (`.env.local`)
- `PY_WORKER_URL` (ej local `http://localhost:8001`)
- `PY_WORKER_SECRET` (debe coincidir con worker)

---

## 8) Pendientes recomendados

1. Ajustar trazabilidad para siempre guardar `existing_website` en `lead_sources` aunque Brave no devuelva URL.
2. Homogeneizar estados (`completed`, `completed_deep`, `error`, `failed`) para evitar polling confuso.
3. Si se busca quitar Google Maps totalmente, migrar `/api/search` a discovery primario Brave + cache DB.
4. Rotar secretos expuestos en terminal/chat y actualizar envs.

---

## 9) Estado final al cierre
- Integración Brave robustecida e instrumentada.
- Worker funcional en local con Python 3.11.
- Escritura en DB validada.
- Pipeline de enrichment operativo, con fallback 422 y contexto extendido.
