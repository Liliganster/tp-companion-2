# Revisión del extractor de callsheets — 10/09/2026

**Estado: cambios locales preparados y comprobados con pruebas automatizadas; el extractor completo no queda certificado como resuelto.** Faltan ejecución de la migración y validación real de base de datos, recorrido autenticado de la app y precisión de la IA. No se han realizado llamadas facturables, publicaciones, commits, push ni correcciones de saldos históricos.

**Carpeta modificada:** `C:\Users\lilia\Escritorio\trip-companion-main 2\trip-companion-main`. Confirmada mediante Git, el registro de workspace y la ventana abierta de VS Code, que mostraba esa ruta y el mismo historial. Estado inicial limpio; HEAD inicial `b08f3a7`.

## Diagnóstico comprobado

El recorrido tiene dos entradas principales: la carga masiva desde Viajes y la carga/extracción desde Proyectos. Ambas terminan en `api/_utils/callsheetExtraction.ts`, mediante `/api/callsheets/process` o el worker. El modelo predeterminado es `gemini-2.5-flash`; existe la alternativa OpenRouter configurada por usuarios Pro. Los PDF e imágenes se adjuntan completos; los formatos de texto, hojas de cálculo y DOCX se convierten a texto. Prompt y esquema comparten instrucciones en `locationPolicy.ts`.

Los problemas encontrados estaban relacionados entre capas:

- `callsheetDate.ts` corregía años usando la fecha de subida, contradiciendo la regla del producto incluso después de modificar el prompt.
- El prompt recogía rodaje y logística, pero el clasificador aceptaba etiquetas desconocidas por defecto. La clasificación no disponía de una categoría contextual explícita.
- La selección se ejecutaba dos veces; se perdían etiquetas al deduplicar únicamente por dirección. No se persistía un orden de documento.
- Una revisión útil se devolvía como `invalid_extraction`, y los callers liberaban la reserva sin consumirla. No era un fallo técnico, aunque se contabilizaba como tal.
- Se insertaba primero la cabecera del resultado y después sus locaciones. Una interrupción podía dejar una cabecera incompleta que condicionaba el siguiente intento.
- Reservar una reextracción eliminaba los resultados anteriores antes de obtener los nuevos.
- La optimización del navegador consultaba Places y geocodificación, elegía resultados y sustituía las locaciones. Una respuesta tardía podía sobrescribir una edición.
- Proyectos interpretaba un HTTP 200 como éxito listo para convertir en viaje; necesitaba distinguir una extracción completada pendiente de revisión.
- El endpoint `create-upload` tenía un máximo de 25.000.000 bytes, distinto del límite de 50 MiB aplicado en otras entradas.
- Los timeouts podían mostrarse como revisión sin haber resultado. El comando habitual de tipos no cubría el servidor del extractor.

**Comparación histórica:** antes de `b08f3a7`, los selectores de día y unidad exigían evidencia con la dirección, coincidencias textuales y, para la unidad principal, palabras específicas en la cita. Eso podía excluir una locación válida cuya fecha o unidad estuviera en otro bloque. `121b887` había mejorado la coincidencia de bloques, pero conservaba esas condiciones. `1c7e041` corrigió un campo inválido del esquema enviado a Gemini; esa corrección se mantiene. `2798625` retiró reintentos del navegador y limitó tiempos del proveedor; se conserva esa mejora. La simplificación de `b08f3a7` dejó pendientes la fecha inferida, la cuota de revisiones, la atomicidad y la sustitución posterior de direcciones. Estas relaciones están comprobadas en el código e historial; no se atribuye a esos commits un porcentaje de errores de producción que no se ha medido.

## Cambios coordinados

1. Se añade el rol contextual de cada bloque: filmación, logística, otro o incierto. El esquema y el prompt utilizan la misma política. Se conservan nombres de lugares, coordenadas y texto documentado sin inventar calles. Una etiqueta desconocida en respuestas antiguas requiere contexto; no se admite automáticamente como destino confirmado. No se exige una cita continua ni una coincidencia literal con el texto extraído del PDF.
2. Se elimina la inferencia temporal desde la subida. Una fecha incompleta, inválida o con año contradictorio queda vacía, con un motivo concreto de revisión. El texto original de la fecha se conserva.
3. Las locaciones conservan etiqueta, posición, estado individual y motivo de revisión. La cabecera conserva el resultado original del modelo. Las lecturas de Viajes y Proyectos utilizan el orden persistido.
4. La nueva migración `supabase/migrations/20260910000001_callsheet_atomic_result.sql` prepara el guardado transaccional de cabecera, locaciones, exclusiones, estado final y consumo de cuota. Comprueba usuario, solicitud, intento y reserva vigente. La revisión consume una vez; el fallo sin resultado no consume; la idempotencia usa la solicitud. Una reextracción conserva el resultado anterior hasta confirmar el nuevo. No modifica consumos históricos.
5. Se elimina la geocodificación del camino crítico de extracción. La distancia se calcula después con los destinos documentados; las respuestas de Maps ya no sustituyen el texto visible. Una optimización tardía no reemplaza las ediciones.
6. Viajes muestra etiquetas y motivos. Los borradores permanecen fuera de la lista de viajes confirmados y sus informes hasta guardar. Proyectos comprueba los candidatos y el estado persistido antes de crear o reemplazar un viaje. La edición guarda ruta, fecha y distancia en la fuente `trips` utilizada por las vistas e informes.
7. Se distingue revisión útil de fallo técnico y se limita la espera de la extracción en Proyectos. Se unifica el endpoint de subida con 50 MiB y se prepara el mismo límite para el bucket. Se mantienen los formatos y límites de lote existentes.
8. Se incorpora `npm run test:extractor`; `npm run typecheck` comprueba ahora también el servidor. El evaluador de IA real queda bloqueado por defecto y requiere una opción explícita. Su nueva métrica exige fecha, cantidad, orden y correspondencia exacta de direcciones/etiquetas, incluyendo fallos en el denominador y anotaciones marcadas como contrato v2.

## Documentos revisados y precisión

Muestra disponible: **6 documentos reales, 22 páginas en total**, además de un PDF sintético que no se incluye en la muestra. Se extrajo el texto completo y se inspeccionó visualmente la primera página de cada documento. Los dos HOFER se reservaron hasta después de implementar la selección; no se introdujeron excepciones por archivo.

| Documento | Fecha y locaciones que justifican la revisión | Riesgos observados |
|---|---|---|
| DISPO_25 — 11 páginas | 21/08/2024; `Loc 1`, Palais Rasumofsky. La calle Rasumofskygasse aparece en el documento. | Logística en columnas contiguas, contactos, hospital y bloque de segunda unidad con dron. No convertir interiores narrativos en destinos adicionales. |
| FUNDBOX DT4 — 2 páginas | `Tuesday, 19th Nov`, **sin año**; cuatro bloques: Denkmal Strauss/Stadtpark, Opera House Fake, Police Station y Christmas Market. Conservar `Josefsagasse12, 1080 Wien`, `Matiellistrasse 2` y `Lichtenfelsgasse Ecke Rathausplatz` tal como están impresos. | Año pendiente; enlace del punto de encuentro Kursalon separado del set Stadtpark; no corregir erratas mediante conocimiento externo. |
| FUNDBOX DT5 — 2 páginas | 20/11/2024; dos bloques físicos explícitos: Goethegasse 1, 1010 Wien y Opernring 2, 1010 Wien. | Base en Goethegasse 3/top 3 y lunch son logística. El plan menciona una escena HOTEL sin identificar su destino físico: no inventar una dirección; esta ambigüedad necesita cerrar la anotación de referencia. |
| REX DT31 — 2 páginas | 23/05/2025; `MOTIV`: `1190, Wildgrubgasse. Zufahrt via Kahlenberger Str 213`, con su enlace propio. | BASIS en Wildgrubgasse 18, aparcamiento, transporte y recarga no son ese set. |
| HOFER 06/05 — 3 páginas, reservado | 06/05/2024; `LOCATION 1`, WAC Prater / `2., Rustenschacherallee 9`; `LOCATION 2`, Jesuitenwiese Prater. | Distinguir el nombre del set del texto `HV: 2., Rustenschacherallee 32-40`; no asumir que un área logística es una nueva locación. Creación del documento: 03/05. |
| HOFER 07/05 — 2 páginas, reservado | 07/05/2024; `LOCATION 1`: `13., Erzbischofgasse 6C`; `LOCATION 2`: `13., Erzbischofgasse 8`. | Creación: 06/05. El archivo contiene dos páginas aunque el pie menciona tres; no puede evaluarse contenido ausente. |

**Para los seis documentos:** respuesta de la IA actual, cambios reales de filtros sobre esa respuesta, datos guardados remotamente, visualización autenticada y conteo de inclusiones/omisiones actuales: **no medidos**. Las respuestas simuladas verifican integración y conservación, no reconocimiento del documento.

Las anotaciones antiguas no se han sustituido silenciosamente: algunas infieren años o corrigen/completan direcciones. El nuevo evaluador no certifica esas anotaciones como contrato v2. Falta terminar una referencia validada para todas las ambigüedades y ejecutar la evaluación real autorizada.

Un documento completamente correcto debe contener la fecha de rodaje documentada y todas sus locaciones elegibles, en orden, con etiquetas relacionadas, sin destinos ajenos ni direcciones inventadas. Los casos que legítimamente requieren revisión se deben informar aparte de las extracciones completas. **No se afirma el 95 %: exactitud de IA no medida; tamaño de muestra disponible 6.**

## Comprobaciones y pendientes

- `npm run test:extractor`: **119 pruebas aprobadas en 21 archivos**. Incluyen formatos y 50 MiB, selección, día/unidad, campos descriptivos vacíos, solicitud SDK simulada y timeout, guardado atómico simulado, cuota simulada, borradores, preservación de texto, edición persistida y bloqueo de candidatos en Proyectos.
- `npm run typecheck`: aprobado para interfaz, configuración y servidor del extractor.
- `git diff --check`: aprobado.
- El comando original de Vitest no arrancó por una restricción de acceso de esbuild; el comando dedicado ejecuta las pruebas contra la misma carpeta de VS Code, sin copiar el proyecto. No se ha ejecutado un build de producción ni una prueba visual completa de la interfaz modificada.
- **SQL aplicado (10/09/2026):** migración 20260910000001 ejecutada en una transacción mediante SQL Editor del proyecto ftsugjbwsgvkcfummbsw, con respuesta Success. Verificadas las siete columnas nuevas, ejecución de save_callsheet_extraction permitida a service_role y denegada a anon/authenticated, finalización con estado de revisión, conservación del resultado anterior y bucket de 52.428.800 bytes. No se modificaron saldos históricos. El proyecto no tiene supabase_migrations.schema_migrations; no se registró un historial ficticio. Continúan pendientes las pruebas reales de rollback, concurrencia y consumo.
- **Aplicación pendiente:** se identificaron las pestañas abiertas de app, Vercel y Supabase. Dos intentos de leer la app agotaron el tiempo del controlador; no se han comprobado sesiones, cargas reales, edición/reapertura, informes exportados, eliminación de borradores ni la interfaz completa de Proyectos en el navegador.
- **Geocodificación pendiente:** se verificó la preservación del texto con respuestas simuladas; no se midió la exactitud real de rutas, nombres sin calle, coordenadas o enlaces con Google.
- **Compatibilidad pendiente:** documentos antiguos no tienen el nuevo orden/estado individual. No se pueden reconstruir esos datos con certeza. El límite efectivo del bucket y la creación de los cambios de esquema quedaron verificados en Supabase.
- **Reextracción pendiente de revisión sobre un viaje ya existente:** Proyectos dispone ahora de una entrada directa al editor del borrador. Conserva el viaje anterior hasta que el usuario guarda la revisión y preserva sus documentos. Esta interfaz nueva se ha comprobado por tipos, pero su interacción visual autenticada sigue pendiente.

Los criterios de aceptación funcionales se han traducido a código y comprobaciones locales, pero **el recorrido completo y la meta de precisión siguen abiertos**. Este informe no presenta la preparación local como una solución integral ya validada.

**Único título propuesto para publicar, cuando se completen las verificaciones pendientes:**

`fix: unificar selección, revisión y cuota del extractor de callsheets`
