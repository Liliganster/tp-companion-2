# Plan de Marketing y Venta — Fahrtenbuch Pro

> Complemento comercial de la Fase 6 de [PLAN.md](../PLAN.md). Fecha: julio 2026.
> Restricción de diseño de todo el plan: **la propietaria no habla alemán ni inglés** → cada acción debe funcionar con material preescrito en DE (copiar y pegar) o a través del producto y de terceros (pilotos, multiplicadores). Nada aquí exige conversar en alemán en vivo.

---

## 1. Posicionamiento

**Frase (ya decidida)**: *"Callsheet hochladen. Kilometergeld-Abrechnung fertig."*

No competimos como "app de Fahrtenbuch" genérica (Vimcar, Driversnote, plantillas Excel, papel): esas son para coches de empresa o para Hacienda. Fahrtenbuch Pro es **la herramienta de cobro del crew de cine**: convierte la callsheet del día en el informe con el que producción te paga el Kilometergeld. Nadie más lee callsheets.

- **Categoría propia**: "Kilometergeld-Abrechnung für Filmschaffende", no "Fahrtenbuch-App".
- **El producto visible es el PDF**: lo que circula por las oficinas de producción es el informe, no la app.
- **Nicho como ventaja**: mercado pequeño (crew austríaco) = se puede dominar con boca-oreja; el extractor de callsheets es una barrera real de entrada (eval set, reglas de rodaje, enlaces de Maps).

## 2. Cliente objetivo (ICP)

**Comprador v1**: freelancer de crew en Austria que usa su coche propio en rodajes y factura Kilometergeld a producción.

Departamentos con más km (priorizar): cámara/DIT, grip, luz, sonido, maquillaje/vestuario con kit propio, location scouts, ayudantes de producción/runners, Aufnahmeleitung.

**Multiplicador (no comprador, sí prescriptor)**: **Aufnahmeleiter / coordinación de producción** — reciben las hojas de km de TODO el equipo cada mes. Un Aufnahmeleiter convencido vale 10-30 usuarios. El informe homogéneo y legible es SU beneficio (menos Excel ilegibles que revisar).

**Tamaño honesto del mercado**: el crew freelance activo en Austria son pocos miles de personas; con coche y facturación regular de km, quizá 1.500-3.000. Objetivo realista v1: dominar Viena. La expansión natural (v2) es Alemania — mismo idioma, ~10× mercado — pero con reglas de km distintas: no antes de demanda medida.

## 3. Mensajes que venden (la matemática del cliente)

Con la tarifa oficial 2026 (0,50 €/km), un mes típico de rodaje (18-20 días, 50-80 km/día) son **450-800 € a facturar**. Argumentos, en orden de fuerza:

1. **"Un viaje olvidado paga un año de la app"** — un solo día de 100 km no facturado = 50 € = más que el año entero (~70 €). La app no olvida: cada callsheet es un viaje.
2. **Tiempo**: la hoja de km de fin de mes pasa de una tarde de Excel a 2 minutos (subir callsheets ya la fue construyendo sola durante el mes).
3. **Cobra antes y sin discusiones**: informe uniforme con verbatim del documento, tarifa por viaje, Mitfahrer-Zuschlag separado y recibos en ZIP — producción no tiene nada que cuestionar.
4. **Bonus fiscal**: % de uso profesional del coche y margen neto real por km (nadie más se lo calcula).

Para el Aufnahmeleiter el mensaje es otro: **"Todo tu equipo entrega el mismo formato, verificable contra la callsheet."**

## 4. Precio y oferta

| | Free | Pro |
|---|---|---|
| Precio | 0 € | **8 €/mes o 70 €/año** (2 meses gratis) |
| Callsheets IA/mes | 3 | 60 |
| Viajes manuales | Ilimitados | Ilimitados |

- El free está bien diseñado como gancho: 3 callsheets = suficiente para sentir la magia, insuficiente para un mes real de rodaje (15-20 callsheets) → el upgrade es natural, no forzado. **No subir el límite free.**
- **Oferta fundacional** (ya prevista en PLAN.md): primeros 50 de pago → precio congelado de por vida + insignia "Gründungsmitglied". Crea urgencia y convierte a los pilotos en evangelistas.
- **Prueba sin tarjeta** (ya decidido). El muro llega al callsheet nº 4 del mes: momento de máxima motivación.
- **Referido**: "un mes Pro gratis para ambos". En un set de 30 personas, el boca-oreja es el canal.
- ⚠️ **Decisión pendiente que bloquea la venta**: PLAN.md dice Paddle/Lemon Squeezy (merchant of record, sin gestión de IVA europeo) pero el código tiene **Stripe** ya integrado. Con Stripe el IVA de cada país UE es problema nuestro (OSS); con Paddle/LS no, a cambio de ~5% de comisión. Para una fundadora sin gestoría internacional, **recomendación: Paddle o Lemon Squeezy** aunque haya que migrar el checkout. Decidir ANTES de cobrar al primer cliente.

## 5. Motor de crecimiento: el producto vende el producto

El bucle central (ya construido) y cómo alimentarlo:

```
Piloto usa la app → entrega el informe PDF a producción
   → el pie "Erstellt mit Fahrtenbuch Pro · fahrtenbuchpro.com" lo ven
     Aufnahmeleitung + contabilidad + otros crew
      → visitan la landing → free → 4º callsheet → Pro
        → generan más informes → …
```

Cada acción de marketing de este plan existe para **inyectar usuarios en ese bucle**, no para sustituirlo. Por eso el orden de canales es: primero pilotos (semilla del bucle), luego comunidad, luego multiplicadores.

## 6. Canales, por orden de ejecución

### Fase A — Pilotos (ahora, en plena temporada de rodaje)
- 10 pilotos de la red personal/cercana usando la versión final un ciclo mensual completo (ya en PLAN.md). Ofrecerles: Pro gratis 6 meses + precio fundacional después.
- Pedir a cada piloto exactamente 3 cosas: (1) entregar el informe real a su producción, (2) un testimonio de una frase con nombre y departamento, (3) compartir el enlace en su grupo de WhatsApp del rodaje.
- Elegir 1-2 pilotos "campeones" con labia y darles free de por vida a cambio de ser la voz en grupos y en el set. **Ellos hablan alemán por nosotros.**

### Fase B — Comunidad de crew (desde el primer testimonio)
- **Crew United** (la red del sector en DACH): perfil de empresa completo en DE + testimonios. Es donde el crew ya está.
- **Grupos de Facebook/WhatsApp** de crew vienés y austríaco (Film Crew Austria, grupos de filmjobs, grupos por departamento): 1 post preescrito en DE por grupo, publicado por un piloto o por la cuenta de la marca, formato "mira lo que me ahorra" con captura del informe — no formato anuncio.
- **Escuelas de cine** (Filmakademie Wien, FH): los estudiantes son los runners de mañana; el free les basta hoy y pagan mañana. Un cartel/post por escuela.
- **Asociaciones del sector** (Verband Filmschaffender, dachverband): pedir mención en newsletter; el ángulo "herramienta de un miembro del sector para el sector" funciona mejor que publicidad.

### Fase C — Multiplicadores (con ≥5 testimonios)
- Lista de 20-30 **Aufnahmeleiter y coordinadores** activos (se identifican en Crew United y en las propias callsheets de los pilotos). Email preescrito en DE + one-pager PDF: "así se ve la hoja de km que te va a entregar el equipo; si la recomiendas, mes gratis para cada miembro de tu crew".
- **Productoras pequeñas/medias**: mismo material. No vender licencia B2B todavía (está en Aparcamiento v2) — solo sembrar la relación. Si 2-3 productoras la piden espontáneamente, ESA es la señal para construirla.

### Fase D — Contenido y búsqueda (goteo, sin plazos)
- La marca ES el término de búsqueda ("Fahrtenbuch" + "Pro"). Mantener fahrtenbuchpro.com + redirigir el .at.
- 4-6 páginas SEO en DE, escritas una vez con IA y revisadas por un piloto: "Kilometergeld 2026 Österreich", "Kilometergeld Filmproduktion abrechnen", "Fahrtenbuch für Filmschaffende", "Callsheet zu Fahrtenbuch". Volumen pequeño pero intención altísima y competencia nula en el nicho.
- **Nada de ads de pago en v1**: el mercado es demasiado pequeño y concentrado; un post en el grupo correcto rinde más que 500 € en Meta Ads.

## 7. Calendario estacional (12 meses)

| Período | Modo | Acción principal |
|---|---|---|
| **Jul-Sep 2026** | Temporada alta de rodaje | Pilotos (Fase A) + primeros posts en grupos (B) |
| **Oct-Nov 2026** | Cierre de temporada | Testimonios, Crew United, primer empuje a Aufnahmeleiter (C) |
| **Dic 2026** | Valle | Contenido SEO (D), preparar campaña fiscal |
| **Ene-Mar 2027** | **Campaña fiscal** | "Recupera el kilometraje de 2026": viajes manuales + import CSV + % uso profesional. Es la campaña donde el plan FREE brilla (no necesita IA) y se llena el embudo |
| **Abr-Jun 2027** | Arranque de temporada | Los usuarios fiscales se convierten en usuarios de callsheet → Pro |

La campaña fiscal es la única pieza de marketing "masivo": post + página SEO + email a los registrados free dormidos.

## 8. Material a producir (todo preescrito, una sola vez)

Kit en DE (crear con IA + revisión de un piloto nativo; la propietaria solo copia y pega):

1. **Landing** en fahrtenbuchpro.com: frase + vídeo 40s del flujo real + imagen del informe + precio + prueba sin tarjeta (ya en PLAN.md Fase 6).
2. **Vídeo 40s**: callsheet real (anonimizada) → subir → viaje con mapa → PDF. Sin voz (¡sin idioma!): texto sobreimpreso DE. Reutilizable en grupos, Crew United y la landing.
3. **One-pager PDF para Aufnahmeleiter** (1 cara: informe de ejemplo + 3 bullets + QR).
4. **10 plantillas de mensaje DE**: post de grupo (2 variantes), DM a crew, email a Aufnahmeleiter + follow-up, email a asociaciones, respuesta a preguntas frecuentes de soporte (5).
5. **Página "Über"** honesta: hecha por/para gente del sector en Viena. En el nicho, la cercanía vende más que el pulido corporativo.

Soporte sin alemán: plantillas + traducción con IA caso a caso; los pilotos campeones cubren los grupos.

## 9. Métricas y objetivos

Embudo objetivo (coherente con "Hecho cuando" de Fase 6):

| Etapa | Métrica | Objetivo v1 |
|---|---|---|
| Adquisición | Registros | 50 (fundacional) → 200 en 6 meses |
| Activación | 1er callsheet en 48 h | ≥40% |
| Conversión | Free → Pro | ≥15% (nicho con dolor real; si <10%, el problema es el aha-moment, no el precio) |
| Retención | 2º informe mensual generado | ≥60% de los Pro |
| Viralidad | Registros con fuente "informe/referido" | medir desde el día 1 (UTM en el pie del PDF: `?ref=report`) |

Escenario económico honesto: 200 registros × 20% Pro × 8 € ≈ **320 €/mes** al final del año 1 en Austria. Este mercado solo, no da un sueldo: da la **prueba** (retención + testimonios + eval del extractor) con la que la expansión a Alemania (v2) sí puede darlo. Juzgar el año 1 por retención y activación, no por MRR.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Idioma de la propietaria | Todo el plan es asíncrono y preescrito; pilotos campeones como voz; soporte por plantillas |
| El extractor falla en público (callsheets raras) | No lanzar Fase B hasta ≥95% sostenido en el eval ampliado (20-30 hojas); `needs_review` ya amortigua el fallo |
| IVA/facturación UE | Decidir Paddle/LS vs Stripe antes del primer cobro (ver §4) |
| Un competidor genérico añade "callsheets" | La ventaja es el eval set + reglas de rodaje aprendidas; correr: dominar los grupos de Viena antes de que exista |
| Estacionalidad (invierno muerto) | Campaña fiscal ene-mar + precio anual (70 €) que desestacionaliza el ingreso |

## 11. Los próximos 14 días (accionable ya)

1. Terminar lo técnico que bloquea todo: Gemini por defecto conectado + migraciones SQL pendientes pegadas (notas en PLAN.md Fases 2 y 4).
2. Decidir pasarela (Paddle/LS vs Stripe) — §4.
3. Reclutar los 10 pilotos (mensaje directo, en persona o ES/DE con plantilla): estamos en temporada alta, cada semana sin pilotos es una semana de datos perdida.
4. Grabar el vídeo de 40s con una callsheet real anonimizada (sin voz).
5. Publicar la landing mínima en fahrtenbuchpro.com (aunque el checkout no esté: lista de espera con email vale) — el pie del PDF de los pilotos ya va a llevar tráfico y hoy no apunta a nada.
6. Añadir UTM al enlace del pie del PDF (`fahrtenbuchpro.com/?ref=report`) para medir el bucle viral desde el primer informe.
