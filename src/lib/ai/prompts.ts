export function buildUniversalExtractorPrompt(text: string) {
  return `Eres un experto analista de documentos de producción cinematográfica y televisiva. Tu tarea es LEER y ENTENDER el documento como lo haría un coordinador de producción humano, y extraer la información clave de forma inteligente.

**TU MISIÓN**: Devolver UN ÚNICO objeto JSON válido con la información extraída. NO incluyas markdown, explicaciones ni texto adicional fuera del JSON.

**SCHEMA DE SALIDA**:
{
  "date": "YYYY-MM-DD",
  "projectName": "string",
  "productionCompanies": ["string", "string", ...],
  "locations": ["string", "string", ...]
}

---

## CÓMO PENSAR COMO UN HUMANO

Los call sheets NO están estandarizados. Pueden ser:
- PDFs profesionales, escaneos, notas manuscritas
- En cualquier idioma (alemán, inglés, español, etc.)
- Con logos, fotos, tablas, cualquier formato

**Tu trabajo NO es buscar palabras clave específicas**. Tu trabajo es LEER el documento completo y ENTENDER:
1. ¿Cuál es la fecha de rodaje principal?
2. ¿Cuál es el nombre del proyecto/show/película?
3. ¿Cuál es la productora?
4. ¿Dónde se va a filmar? (NO dónde come el equipo, NO dónde aparcan)

---

## CAMPO 1: date (FECHA DE RODAJE)

**Qué buscar**: La fecha del día de rodaje principal
- Puede aparecer como: "25.02.2025", "Feb 25, 2025", "Montag 25. Februar"
- Ignora fechas de prep, wrap, o fechas de calendario mencionadas de pasada
- **Normaliza a**: YYYY-MM-DD

**Razonamiento**: Como humano, ¿cuál es la fecha MÁS PROMINENTE que indica cuándo se filma?

---

## CAMPO 2: projectName (TÍTULO DEL PROYECTO) ⚠️ CRÍTICO ⚠️

**🚨 ESTE ES EL CAMPO MÁS IMPORTANTE - NUNCA debe quedar vacío 🚨**

**Qué buscar**: El nombre creativo del show/película/serie que se está rodando

### MÉTODO DE EXTRACCIÓN (aplicar en orden):

#### PASO 1: Buscar en ENCABEZADO PRINCIPAL (primeros 20% del documento)
- El título suele estar en la **parte superior de la primera página**
- Es el texto **MÁS GRANDE** o **MÁS PROMINENTE** visualmente
- Puede estar en **MAYÚSCULAS**, **negrita**, o **centrado**
- Busca líneas que contengan:
  - Solo un nombre (sin "GmbH", "LLC", "Film", "Pictures", "Production")
  - Puede tener códigos de proyecto como: "FUNDBOX", "DRK-S3", "REINO-EP5"
  - Ejemplos: "DARK", "El Reino", "SUCCESSION", "1899", "FUNDBOX"

#### PASO 2: Buscar después de PALABRAS CLAVE
Busca texto inmediatamente después de:
- **Alemán**: "Projekt:", "Serie:", "Film:", "Titel:", "Produktion von:"
- **Inglés**: "Project:", "Series:", "Film:", "Title:", "Show:", "Production:"
- **Español**: "Proyecto:", "Serie:", "Película:", "Título:", "Producción:"

Ejemplo: "Project: FUNDBOX" → projectName = "FUNDBOX"

#### PASO 3: Analizar PATRONES VISUALES
- Líneas con **un solo texto grande y destacado** en el header
- Texto que aparece **ANTES** de la fecha y detalles de producción
- Códigos alfanuméricos cortos (4-12 caracteres) que parecen códigos de proyecto
- Nombres que se **repiten** en el documento (especialmente en headers/footers)

#### PASO 4: ELIMINAR FALSOS POSITIVOS ⚠️ MUY IMPORTANTE

Si encuentras un candidato, verifica que NO sea:

**❌ TIPO DE DOCUMENTO (NUNCA es el nombre del proyecto)**:
- "Call Sheet" / "Callsheet" / "CALLSHEET" → Es el tipo de documento, NO el proyecto
- "Hoja de Rodaje" / "Disposición Diaria" → Tipo de documento
- "Drehplan" / "Tagesdisposition" → Tipo de documento
- "Production Sheet" / "Crew List" → Tipo de documento

**❌ Nombre de productora**:
- Contiene: "GmbH", "LLC", "Ltd", "Inc", "Film", "Pictures", "Entertainment", "Productions", "Studios", "Media", "Production Company"

**⚠️ Broadcaster o plataforma**:
- Netflix, HBO, Amazon, BBC, ARD, ZDF, RTL, ORF, etc.
- **EXCEPCIÓN**: SI son la única entidad listada como "Produktion" o "Production", ENTONCES SÍ inclúyelos.

**❌ Nombre de locación**:
- "Estudio 5", "Set A", "Location B", "Studio Complex"

**❌ Números de episodio solos**:
- "Episode 5", "Folge 3", "EP101" (sin nombre de serie)

**🔍 REGLA CRÍTICA**: 
Si ves texto como "CALLSHEET 2 of 2" o "Call Sheet - Saturday", **ignóralo completamente**.
El nombre del proyecto está ANTES o DESPUÉS de esta línea, NO ES esta línea.

#### PASO 5: EXTRACCIÓN INTELIGENTE CON SEPARADORES
Si el texto tiene separadores, extrae la parte correcta:
- "Netflix Presents: **Dark**" → projectName = "Dark"
- "UFA Fiction - **El Reino**" → projectName = "El Reino"  
- "**FUNDBOX** Call Sheet #3" → projectName = "FUNDBOX"
- "Warner Bros / **Succession** / Episode 7" → projectName = "Succession"
- "Bavaria Film GmbH | **Vorstadtweiber**" → projectName = "Vorstadtweiber"

**Patrones comunes de separación**:
- Después de ":", "-", "|", "/", "presents", "präsentiert", "presenta"
- Antes de números de episodio, fechas, o detalles logísticos

### EJEMPLOS DE EXTRACCIÓN CORRECTA:

✅ **Caso 1**: "FUNDBOX - Call Sheet #3" → projectName = "FUNDBOX"
✅ **Caso 2**: Header grande: "DARK" pequeño: "Netflix Original Series" → projectName = "DARK"
✅ **Caso 3**: "Projekt: El Reino | Episode 5" → projectName = "El Reino"
✅ **Caso 4**: "UFA Fiction GmbH presents BABYLON BERLIN" → projectName = "BABYLON BERLIN"
✅ **Caso 5**: Footer: "© 2024 SUCCESSION Productions LLC" → projectName = "SUCCESSION"
✅ **Caso 6**: "Call Sheet - 1899 - Tag 15" → projectName = "1899"
✅ **Caso 7**: Header: "Raiffeisen - Goffi" / Abajo: "CALLSHEET 2 of 2" → projectName = "Raiffeisen - Goffi"

### ❌ EJEMPLOS DE EXTRACCIÓN INCORRECTA (NO HACER):

❌ **Error 1**: Header: "Raiffeisen - Goffi" / Abajo: "CALLSHEET 2 of 2" → projectName = "CALLSHEET" 
   - **Por qué está mal**: "CALLSHEET" es el tipo de documento, NO el proyecto
   - **Correcto**: projectName = "Raiffeisen - Goffi" (el texto ANTES de CALLSHEET)

❌ **Error 2**: "CALL SHEET - Production XYZ" → projectName = "CALL SHEET"
   - **Por qué está mal**: "CALL SHEET" es genérico
   - **Correcto**: projectName = "Production XYZ" (el texto DESPUÉS)

❌ **Error 3**: Solo aparece "Disposición Diaria - 15/02/2024" → projectName = "Disposición Diaria"
   - **Por qué está mal**: Es el tipo de documento
   - **Correcto**: Buscar más arriba en el header o usar estrategias de último recurso

### ESTRATEGIAS DE ÚLTIMO RECURSO:

Si después de los 5 pasos NO has encontrado nada claro:

1. **Buscar en nombres de archivo** (si aparece en el texto OCR):
   - "FUNDBOX_call_sheet_3.pdf" → projectName = "FUNDBOX"

2. **Buscar códigos alfanuméricos prominentes**:
   - Códigos de 4-12 caracteres en mayúsculas en el header
   - Ejemplo: "ABC123", "PROJ-X", "DRK-S3"

3. **Inferir del contexto**:
   - Si hay "Episode 5" pero no título → buscar en copyright/footer
   - Si hay productora famosa → buscar el otro nombre prominente

4. **ÚLTIMO RECURSO**: Si absolutamente no encuentras nada:
   - Usa "Untitled Project" (pero esto debe ser extremadamente raro)

### REGLAS FINALES:

- ✅ **NUNCA devolver cadena vacía ("")** - siempre debe tener valor
- ✅ Prefiere **nombres cortos y creativos** sobre nombres corporativos largos
- ✅ Si hay **múltiples candidatos**, elige el más **prominente visualmente**
- ✅ **Elimina** sufijos legales del nombre: "DARK GmbH" → "DARK"
- ✅ **Normaliza mayúsculas**: "DARK" → "Dark" (capitalización natural)
- ⚠️ Si tienes **duda entre dos opciones**, elige la que **NO** tiene sufijos corporativos
- ✅ Prefiere títulos cortos y creativos sobre nombres corporativos largos

**Razonamiento**: Como humano, ¿cuál es el TÍTULO creativo de la serie/película que se está rodando? (NO la empresa productora)

---

## CAMPO 3: productionCompanies (PRODUCTORAS)

**Qué buscar**: TODAS las empresas que PRODUCEN el proyecto (puede haber varias co-productoras)
- Puede aparecer como:
  - "Produktion:", "Production Company:", "Productora:", "Studio:", "Prod:", "Producer:"
  - "In Co-Production with:", "Co-produced by:", "Koproduzent:", "En coproducción con:"
  - En logos, cabeceras principales, o pie de página del documento
- Ejemplos: ["UFA Fiction"], ["Netflix", "Warner Bros TV"], ["Bavaria Film", "Neue Super"], ["X Filme", "ARD Degeto"]

**DÓNDE BUSCAR** (en orden de prioridad):
1. **ENCABEZADO/HEADER** (primera página, parte superior)
2. **LOGOS** (primera página, esquinas o centro)
3. **PIE DE PÁGINA** (footer con información legal/copyright)
4. **SECCIÓN "Production"** o "Produktion" (si existe)

**IMPORTANTE - Lee TODO el documento ANTES de extraer**:
- ⚠️ **NO te limites a la primera mención** - Puede haber VARIAS productoras (2, 3, 4 o más)
- ⚠️ **Lee la PRIMERA PÁGINA COMPLETA** - Aquí suelen estar TODAS las productoras listadas
- ⚠️ **Lee el PIE DE PÁGINA** - A menudo lista todas las productoras en el copyright
- ✅ **Extrae TODAS** - Si hay 5 productoras, devuelve las 5
- ✅ **UNA por elemento** - Cada productora es un string separado en el array
- ✅ **Si NO encuentras NINGUNA** - Devuelve [] (array vacío)

**Razonamiento**: Como humano, ¿qué EMPRESAS/ESTUDIOS financian y producen este proyecto? (pueden ser varias en co-producción)

**ESTRATEGIAS AVANZADAS**:
- **Sufijos Legales**: Si ves un nombre con "GmbH", "S.L.", "Inc.", "Limited" en el encabezado o pie de página, es una productora (incluso sin la etiqueta "Production:").
- **Logos**: Los textos en las esquinas superiores suelen ser logos de productoras.
- **Copyright**: Busca "© 2024 Netflix" o similar en el pie de página.
- **Distinción**: NO confundas la productora con el cliente o la agencia si es publicidad (aunque para cine/TV, la productora es lo que buscamos).

---

## CAMPO 4: locations (UBICACIONES DE FILMACIÓN)

**Tu misión**: Extraer SOLO direcciones físicas válidas donde se FILMA (donde ruedan las cámaras) **del día específico de esta callsheet**.

### Principios fundamentales:

1. **COMPRENDE EL CONTEXTO**: Lee el documento completo. Las callsheets no están estandarizadas - entiende qué significa cada sección.

2. **SOLO EL DÍA DE LA CALLSHEET** ⚠️ MUY IMPORTANTE:
   Muchas callsheets incluyen al final un bloque con el plan del día siguiente. **IGNORA POR COMPLETO todo lo que esté bajo esas secciones**.

   ❌ **Secciones de día siguiente/futuro — ignorar todo su contenido**:
   - 'NEXT DAY' / 'NEXT SHOOTING DAY' / 'TOMORROW'
   - 'NÄCHSTER DREHTAG' / 'MORGEN' / 'FOLGETAG'
   - 'DÍA SIGUIENTE' / 'PRÓXIMO DÍA DE RODAJE' / 'MAÑANA'
   - 'ADVANCE SCHEDULE' / 'PRODUCTION PLAN' / 'UPCOMING'
   - Cualquier bloque que muestre una fecha **distinta** a la fecha principal del documento

   ✅ **Cómo identificar el día principal**:
   - La fecha más prominente en el encabezado (más grande o en la parte superior)
   - La sección con el mayor detalle de escenas, actores y horarios
   - Si hay dos fechas en el documento, la primera en aparecer es la principal

   ✅ **Ejemplos de ignorar**:
   - "NEXT DAY — Drehort: Hauptstraße 10, 1040 Wien" → **IGNORAR**
   - "Morgen: Mühlgasse 5, 1040 Wien" → **IGNORAR**
   - Tabla de avance con fecha D+1 al final del PDF → **IGNORAR TODA LA TABLA**

3. **SOLO DIRECCIONES FÍSICAS VÁLIDAS**: 
   - ✅ Extrae: Direcciones completas ("Kärntner Ring 16, 1010 Wien"), landmarks famosos ("Stephansdom", "Schloss Schönbrunn"), lugares conocidos con ciudad ("Hauptbahnhof, Wien")
   - ❌ NO extraigas: Palabras sueltas sin dirección ("TAXI", "UBER"), servicios logísticos (parking, catering, vestuario), acciones (pick up, transfer)

4. **FILMACIÓN vs LOGÍSTICA**: 
   - ¿Es donde actúan actores y filman cámaras? → FILMACIÓN (extraer)
   - ¿Es donde el equipo come/descansa/aparca? → LOGÍSTICA (ignorar)

5. **NO DUPLICAR**: Si hay nombre de lugar Y dirección, extrae solo la dirección física.

6. **EXCLUSIÓN CRÍTICA - OFICINAS DE PRODUCCIÓN**:
   - ❌ NUNCA extraigas la dirección de la productora (Production Office, Studio HQ) como lugar de rodaje.
   - Si la dirección está junto al logo de la empresa o en el pie de página, ÍGNORALA.
   - Solo inclúyela SI explícitamente dice "FILMING LOCATION" o "SET" junto a ella.

7. **EXCLUSIÓN CRÍTICA - UNIDADES SECUNDARIAS Y DRONES** ⚠️:
   Las callsheets a menudo tienen secciones para unidades adicionales. **SOLO extrae la unidad PRINCIPAL**.
   
   ❌ **NUNCA extraigas** ubicaciones de estas secciones:
   - Drones / Drohnen / Aerial Unit → locaciones de vuelo de dron, NO son donde filman actores
   - 2nd Unit / B-Unit / Segunda Unidad / Zweite Einheit → equipo separado, dirección diferente
   - Splinter Unit / C-Unit / Additional Unit → ídem
   - Stunt Unit / Action Unit → ídem
   - SFX Unit / VFX Unit → ídem
   
   **Cómo identificar estas secciones**: Busca encabezados como "DRONE UNIT", "2ND UNIT", "B-EINHEIT", "LUFTAUFNAHMEN", "DROHNEN", "AERIALS", "SEGUNDA UNIDAD". Todo lo que esté bajo ese encabezado hasta el siguiente se ignora.
   
   ✅ **SÍ extrae** únicamente de la sección de la unidad principal:
   - "MAIN UNIT" / "1ST UNIT" / "PRIMERA UNIDAD" / "HAUPTEINHEIT"
   - Si no hay etiqueta de unidad, asume que es la principal
   - "Drehort 1", "Drehort 2" sin mención de drones/segunda unidad → extraer

### Formatos de dirección:

**REGLA CRÍTICA - NO DUPLICAR INFORMACIÓN**:
Si el call sheet tiene:
  Drehort 1: Hotel Imperial
  Adresse: Kärntner Ring 16, 1010 Wien

❌ **MAL**: "Hotel Imperial, Kärntner Ring 16, 1010 Wien" (duplica info)
❌ **MAL**: "Hotel Imperial + Kärntner Ring 16, 1010 Wien" (duplica info)
✅ **BIEN**: "Kärntner Ring 16, 1010 Wien" (solo la dirección física)

**Formatos aceptables**:
- **Dirección completa**: "Hauptstraße 100, 10115 Berlin" ← PREFERIR SIEMPRE
- **Landmark famoso** (solo si NO hay dirección): "Schloss Schönbrunn"
- **Nombre + ciudad** (solo si NO hay dirección): "Central Park, New York"

**Prioridad de extracción**:
1. Si hay dirección física (calle + número + ciudad) → Usar SOLO eso
2. Si NO hay dirección pero hay landmark famoso → Usar nombre del lugar
3. Si hay nombre genérico sin dirección → Buscar si hay dirección asociada

**Si la dirección está incompleta**:
- Si tiene contexto claro de ciudad: "Stephansplatz" → "Stephansplatz, Wien"
- Si NO hay contexto: Extrae lo que hay

---

### ⚠️ FORMATOS NO ESTÁNDAR — REGLAS OBLIGATORIAS

**1. Expande SIEMPRE las abreviaturas de vía** (muy común en callsheets españoles):
- 'C/' o 'C.' → 'Calle'  →  "C/ Gran Vía, 50" → "Calle Gran Vía 50, Madrid"
- 'Pza.' o 'Pl.' o 'Pz.' → 'Plaza'  →  "Pza. España 1" → "Plaza España 1"
- 'Avda.' o 'Av.' o 'Avd.' → 'Avenida'  →  "Avda. Diagonal, 543" → "Avenida Diagonal 543"
- 'Pº' o 'Pso.' → 'Paseo'  →  "Pº de la Castellana, 200" → "Paseo de la Castellana 200"
- 'Ctra.' → 'Carretera'  →  "Ctra. M-30 km 4" → "Carretera M-30 km 4"
- 'P.I.' o 'Pol. Ind.' o 'Pol.' → 'Polígono Industrial'
- 'Urb.' → 'Urbanización'
- 'Blvr.' → 'Boulevard'
- **Alemán**: 'Str.' → 'Straße', 'Pl.' → 'Platz', 'Gasse' ya completa

**2. Formato de Bezirk vienés (MUY FRECUENTE en callsheets austríacos)** ⚠️:
En Viena, el formato es '{NúmeroBezirk}. {NombreCalle} {NúmeroCasa}'.
El número antes del punto es el DISTRITO (Bezirk), NO un número de lista.

Regla de conversión → añade el código postal '1{Bezirk con 2 dígitos}0':
- '1. Stephansplatz 1' → 'Stephansplatz 1, 1010 Wien'
- '3. Erdbergstraße 200' → 'Erdbergstraße 200, 1030 Wien'
- '13. Erzbischofgasse 6C' → 'Erzbischofgasse 6C, 1130 Wien'
- '13. Erzbischofgasse 8' → 'Erzbischofgasse 8, 1130 Wien'
- '19. Grinzinger Allee 1' → 'Grinzinger Allee 1, 1190 Wien'
- '23. Brunner Str. 69' → 'Brunner Straße 69, 1230 Wien'

Si el documento es claramente vienés (aparece "Wien", "Bezirk", "Drehort" con este patrón), aplica esta conversión a TODAS las direcciones que encajen.

**3. Direcciones en tablas**: Las callsheets suelen tener tablas con columnas separadas.
Si ves una fila como:
'''
Drehort | Hotel Imperial
Adresse | Kärntner Ring 16, 1010 Wien
'''
O en español:
'''
Locación: Edificio Telefónica | Dirección: Gran Vía 28, 28013 Madrid
'''
Lee AMBAS celdas. Si hay dirección, usa SOLO la dirección, no el nombre del lugar.

**3. Solo nombre de barrio o zona**:
- "Barrio de Salamanca, Madrid" → extraer tal cual
- "Zona Retiro" → "Parque del Retiro, Madrid" si es obvio, o extraer como está
- "Centro histórico de Córdoba" → extraer tal cual + añadir ciudad si falta

**4. Coordenadas GPS en lugar de dirección**:
- Si solo aparecen coordenadas: "40.4168, -3.7038" → incluir tal cual
- Si hay coordenadas junto a una dirección, usar la dirección

**5. Direcciones descriptivas o referenciales**:
- "Junto al Mercado de San Miguel, Madrid" → extraer tal cual
- "Frente a C/ Mayor 45, Madrid" → "Calle Mayor 45, Madrid (aprox.)"
- "Exterior del Teatro Real, Plaza de Oriente, Madrid" → "Plaza de Oriente, Madrid"
- "Bajo el puente de Segovia" → "Puente de Segovia, Madrid" si hay contexto

**6. Kilómetros de carretera**:
- "Km 15 A-6 sentido Coruña" → extraer tal cual añadiendo ciudad/comunidad si hay contexto

**7. Nunca dejes locations vacío**: Si no encuentras ninguna dirección formal, extrae el mejor indicador de ubicación disponible (nombre de lugar, zona, landmark). Solo como último recurso un texto descriptivo.

---

## FILOSOFÍA CORE

**Tú eres un HUMANO inteligente leyendo un documento**:

✓ Lee TODO el documento primero para entender el contexto
✓ Entiende el PROPÓSITO de cada mención (¿filming o logistics?)
✓ Usa tu conocimiento de producción audiovisual
✓ Sé flexible con formatos pero preciso con el contenido
✓ Distingue entre set principal, equipo técnico (drones), y logística

✗ NO busques solo keywords rígidas
✗ NO asumas que todo "drehort" es principal (puede ser drones, b-unit, etc.)
✗ NO extraigas ubicaciones de equipo/crew (basis, catering, parken, makeup, wardrobe)
✗ NO inventes información que no esté en el documento

---

**FORMATO DE SALIDA**:
- SOLO JSON válido
- Sin markdown, sin explicaciones
- Estructura exacta del schema arriba

---

**CONTENIDO A ANALIZAR**:

${text}`;
}

export function buildCrewFirstDirectPrompt(text: string) {
   return `Extrae datos de esta hoja de rodaje en JSON. Devuelve SOLO JSON válido, sin markdown ni explicaciones.

CAMPOS CLAVE (diferéncialos correctamente):
• projectName (REQUERIDO): Título del proyecto. Ej: "Dark", "El Reino", "Succession". NO es la productora.
• productionCompany (opcional): Empresa productora. Ej: "Netflix", "Warner Bros", "UFA Fiction".
• motiv (opcional): Locación narrativa/escena. Ej: "Höhle", "Casa de María - Interior". NO es dirección física.
• episode (opcional): Número/título episodio. Ej: "Folge 3", "EP101".
• shootingDay (opcional): Día de rodaje. Ej: "DT8", "Día 15".
• generalCallTime (opcional): Hora de llamada en HH:MM.
• date (REQUERIDO): Fecha en YYYY-MM-DD.

UBICACIONES - Solo incluye estas 7 categorías con dirección física:
1. FILMING_PRINCIPAL - Set principal
2. UNIT_BASE - Basecamp
3. CATERING - Catering
4. MAKEUP_HAIR - Maquillaje/peluquería
5. WARDROBE - Vestuario
6. CREW_PARKING - Parking equipo
7. LOAD_UNLOAD - Carga/descarga

Por cada ubicación:
• location_type: Una de las 7 categorías
• address (REQUERIDO): Dirección física original
• formatted_address: Dirección normalizada para Google Maps (null si no puedes)
• latitude/longitude: Coordenadas GPS (null si no puedes)
• notes: Max 2 notas logísticas (horarios, trailers, etc)
• confidence: 0-1

REGLAS:
- version debe ser "parser-crew-1"
- rutas debe ser []
- Ignora hospitales, protocolos, políticas, teléfonos
- Si solo hay título, deja productionCompany y motiv como null

EJEMPLO:
Input: "DARK - Folge 3 - Produktion: Wiedemann & Berg - Motiv: Höhle"
Output: {"version":"parser-crew-1","projectName":"Dark","productionCompany":"Wiedemann & Berg","motiv":"Höhle","episode":"Folge 3",...}

TEXTO:
${text}`;
}
