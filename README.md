# Junta Directiva AI

Aplicación web para contrastar decisiones con una junta de 12 especialistas y obtener un veredicto ejecutivo. Está disponible en https://juntadirectiva.vercel.app/, en español e inglés (selector EN/ES en la cabecera).

## Qué recibe cada usuario

### Análisis gratuito

- Debate de una junta recomendada de 8 especialistas, personalizable entre los 12 disponibles.
- Veredicto ejecutivo, consensos (barra de "convicción" por director), riesgo principal y próximos pasos.
- Perfil rápido opcional (estructura/presupuesto/disponibilidad) para que los directores ajusten sus consejos sin tener que preguntarlo en el debate.
- Análisis a partir de texto, PDF, Word, Markdown, URL o nota.
- Dos análisis diarios usando la infraestructura de la aplicación. Al agotarlos, se pueden comprar 3 análisis extra por 2,99 € (pago único, no acumulable con el plan de acción).
- Chat de seguimiento con el Chairman tras el veredicto (10 mensajes gratis por sesión).

### Plan de acción de pago

- Informe de 10 secciones: primera victoria en 48h, plan de 3 semanas, acciones imprescindibles/necesarias/para más adelante (cada una con el porqué y qué consigue el usuario), tú-o-un-freelancer, señales a vigilar, riesgos, reglas si-ocurre-esto-haz-aquello y checklist de confirmación.
- Saludo y despedida personalizados, enlaces reales y clicables a las herramientas mencionadas.
- Se genera en el mismo idioma que tenga activo la interfaz (EN o ES).
- Descargable como PDF ejecutivo (también localizado).
- Desbloquea además la "Junta profunda" (cada director rebate a los anteriores) y adjuntos (imagen/PDF/Markdown) en el chat del Chairman.

Precio actual: 4,99 € por plan o 9,99 € por tres planes. Es pago único, sin suscripción. El pago se verifica server-side contra Stripe antes de acreditar nada — el crédito y el acceso premium viven en KV, nunca solo en el navegador del cliente.

## Experiencia de inicio

1. El usuario escribe su decisión o sube un documento.
2. Puede elegir el tipo de reunión; esto propone automáticamente los especialistas más relevantes.
3. Los 12 participantes permanecen visibles y puede activar o quitar cualquiera.
4. La junta debate y emite el veredicto gratis.
5. Si necesita ejecutar, puede desbloquear el plan operativo de pago.

## Modelos y proveedores

- El análisis gratuito y el resumen de documentos usan `gpt-4o-mini` cuando `OPENAI_API_KEY` tiene crédito disponible; si OpenAI falla o no tiene saldo, se usa `claude-haiku-4-5` como respaldo económico automático. Los informes premium mantienen `claude-sonnet-4-6` para no rebajar calidad.
- El informe de pago usa Claude Sonnet.

Nunca se exponen claves del servidor en el navegador ni en GitHub. Los clientes no pueden traer su propia API key — esa opción existe solo para uso interno, ver "Ajustes privados" más abajo.

El modo gratuito no confía solo en la interfaz: `api/analysis-gate.js` emite un ticket firmado, ligado a la IP y con un presupuesto máximo de llamadas; `api/coach.js` lo valida y descuenta cada uso en KV. Los límites del coach y del resumen de documentos también viven en KV y fallan cerrados si ese control no está disponible.

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

Los ajustes internos (elegir proveedor de IA y pegar una API key propia, para pruebas sin gastar los créditos del servidor) están disponibles solo en la ruta `/acceso-privado`, protegida por un código validado por el servidor. La sesión privada dura 12 horas.

Para cambiar el código, actualiza `PRIVATE_ACCESS_CODE_HASH` con el SHA-256 del nuevo código y vuelve a desplegar. `PRIVATE_ACCESS_COOKIE_SECRET` debe ser un secreto largo y aleatorio.

## Desarrollo y despliegue

```bash
npm install
npm run build
```

El repositorio principal es https://github.com/JotaEse68/juntadirectiva.

La carpeta de desarrollo local es:

```text
C:\Users\Jota\Desktop\Desarrollo J\juntadirectiva-paid
```

Vercel debe desplegarse en el proyecto `juntadirectiva`, que mantiene el dominio de producción. Cada push a `main` despliega automáticamente; para publicar manualmente:

```bash
npx vercel --prod --yes --project juntadirectiva
```

## Estado de la versión

Última revisión a fondo (agosto 2026): interfaz bilingüe EN/ES completa (incluye el informe de pago, el PDF descargable y los mensajes de error de pago/límite), el crédito del informe se verifica y se acredita server-side contra Stripe (ya no basta con editar `localStorage` para desbloquearlo), y el informe de pago se reescribió a una estructura de 10 secciones con tono cercano y enlaces reales.

Antes de eso: análisis desde documentos sin texto adicional, separación entre análisis gratuito y plan premium, precios visibles, formulario prioritario, ejemplos de consulta, contraste mejorado y los 12 directores siempre visibles.
