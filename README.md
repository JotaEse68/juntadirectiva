# Junta Directiva AI

Aplicación web para contrastar decisiones con una junta de 12 especialistas y obtener un veredicto ejecutivo. Está disponible en https://juntadirectiva.vercel.app/.

## Qué recibe cada usuario

### Análisis gratuito

- Debate de una junta recomendada de 8 especialistas, personalizable entre los 12 disponibles.
- Veredicto ejecutivo, consensos, riesgo principal y próximos pasos.
- Análisis a partir de texto, PDF, Word, Markdown, URL o nota.
- Dos análisis diarios usando la infraestructura de la aplicación.

### Plan de acción de pago

- Hoja de ruta de 30/60/90 días.
- Entre 6 y 8 acciones ordenadas por prioridad.
- Responsables y esfuerzo estimado.
- KPIs, señales de alerta, riesgos, contingencias y escenarios de decisión.
- Informe descargable.

Precio actual: 4,99 € por plan o 9,99 € por tres planes. Es pago único, sin suscripción.

## Experiencia de inicio

1. El usuario escribe su decisión o sube un documento.
2. Puede elegir el tipo de reunión; esto propone automáticamente los especialistas más relevantes.
3. Los 12 participantes permanecen visibles y puede activar o quitar cualquiera.
4. La junta debate y emite el veredicto gratis.
5. Si necesita ejecutar, puede desbloquear el plan operativo de pago.

## Modelos y proveedores

- El análisis gratuito y el resumen de documentos usan `gpt-4o-mini` cuando `OPENAI_API_KEY` tiene crédito disponible.
- Si OpenAI no está disponible o no tiene saldo, el análisis continúa con Claude como respaldo para no romper la aplicación.
- El informe de pago usa Claude Sonnet.
- Un usuario puede configurar su propia API desde ajustes para reuniones ilimitadas.

Nunca se exponen claves del servidor en el navegador ni en GitHub.

## Variables de entorno en Vercel

Configurar para Production y Preview:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
KV_URL
KV_REST_API_URL
KV_REST_API_TOKEN
KV_REST_API_READ_ONLY_TOKEN
REDIS_URL
PRIVATE_ACCESS_CODE_HASH
PRIVATE_ACCESS_COOKIE_SECRET
```

`OPENAI_API_KEY` requiere saldo activo para que GPT-4o mini atienda el modo gratuito.

## Ajustes privados de proveedores

Los clientes no ven opciones de API propia ni proveedores. Los ajustes internos están disponibles en la ruta `/acceso-privado` y requieren un código validado por el servidor. La sesión privada dura 12 horas.

Para cambiar el código, actualiza `PRIVATE_ACCESS_CODE_HASH` con el SHA-256 del nuevo código y vuelve a desplegar. `PRIVATE_ACCESS_COOKIE_SECRET` debe ser un secreto largo y aleatorio.

## Desarrollo y despliegue

```bash
npm install
npm run build
```

El repositorio principal es https://github.com/JotaEse68/juntadirectiva.

La carpeta de desarrollo local es:

```text
C:\Users\Jota\Desktop\Desarrollo J\1-Aplicaciones jota\junta directiva App\juntadirectiva-main
```

Vercel debe desplegarse en el proyecto `juntadirectiva`, que mantiene el dominio de producción. Para publicar manualmente:

```bash
npx vercel --prod --yes --project juntadirectiva
```

## Estado de la versión

La versión actual incorpora: análisis desde documentos sin texto adicional, separación entre análisis gratuito y plan premium, precios visibles, formulario prioritario, ejemplos de consulta, contraste mejorado y los 12 directores siempre visibles.
