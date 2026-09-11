# Revisión integrada del extractor — 2026-09-11

Carpeta: C:\Users\lilia\Escritorio\trip-companion-main 2\trip-companion-main.
Estado: cambios locales; no publicados por esta revisión. No se midió todavía precisión real ni mejora de latencia con IA.

## Diagnóstico comprobado

El fallo de DISPO_25 fue un aborto de la petición a Gemini, no un rechazo demostrado de su fecha. El ejemplar local tiene 11 páginas y 8 124 566 bytes; la primera página muestra 21.08.2024 y Loc 1. Incluye segunda unidad, planes internos, mapas, contactos y protocolo. No hay prueba de qué fase interna del proveedor consumió el tiempo.
HOFER_060524 produjo dos direcciones normalizadas y añadió rótulos internos como locaciones sin dirección. Son fallos diferentes: demora del proveedor y clasificación de bloques.

Había reglas duplicadas en prompt/esquema, campos de salida obsoletos, generación sin límite explícito de tokens, reintentos programados del worker y repetición por ciertos errores OpenRouter. Un timeout local no garantizaba una sola llamada ni un coste fijo.
Una locación con estructura inválida podía rechazar las válidas del mismo documento. Faltaba normalización en respuestas antiguas/sin ese campo y podía usarse texto literal como destino.
La selección calculaba un estado antes del guardado, pero un trigger puede añadir una discrepancia de proyecto; la respuesta HTTP no leía ese estado final.
Las anotaciones de evaluación incluían años deducidos, direcciones completadas y etiquetas mezcladas con nombres. No son una referencia válida para las reglas actuales.

## Recorrido y decisión común

| Capa | Contrato y estado de verificación |
|---|---|
| Subida | Se mantienen formatos y 50 MB; originales privados con comprobación de propietario. Pruebas locales de formatos/tamaño/propiedad. No se ensayó una subida real de 50 MB a Gemini. |
| Lectura | PDF/foto íntegros a visión; formatos de texto/Office decodificados como texto. No se recortan páginas ni se usan fechas del archivo. |
| IA | Directo y worker usan el mismo perfil y prompt. Una petición por ejecución, 100 s, 8192 tokens de salida solicitados; Gemini con presupuesto de razonamiento 1024. OpenRouter mantiene modelo propio y límite de salida; el presupuesto interno depende de ese proveedor/modelo. No hay garantía de importe fijo ni cancelación remota confirmada. |
| Selección | Fecha de página uno; relación de día/unidad por contexto; sitios físicos en orden; rótulos internos/logística fuera de rutas. Original y dirección normalizada separados. Sin excepciones por archivo. |
| Validación | Metadatos vacíos/locación mal formada no descartan hermanos válidos. Ausencia de normalización actual requiere revisión. Respuesta truncada no se guarda como completa. |
| Guardado/cuota | RPC atómico existente conserva resultado, locaciones, exclusiones y un consumo. Se relee el estado persistido. Error técnico sin resultado libera reserva; no se alteraron balances ni se hizo nueva migración. |
| Cola | Solo procesa queued; fallidos y abandonados no se regeneran automáticamente. Reprocesar exige acción del usuario. Reserva vigente impide dos ejecuciones concurrentes. |
| Revisión | Candidatos diferenciados; original siempre disponible. La tabla muestra evidencia literal cuando falta dirección normalizada, sin convertir esa evidencia en dirección de cálculo. |
| Mapas | Enriquecimiento posterior a extracción; sus fallos no invalidan la extracción. Solo destinos confirmados se materializan automáticamente; Google puede normalizar una coincidencia única. |
| Edición/tablas/informes | Edición guarda Trip mediante TripsContext; borradores no son trips confirmados; informes usan los trips persistidos. Inspección del código y pruebas locales, sin recorrido autenticado completo de edición/informe en esta revisión. |
| Medición | Hash y versión de perfil, entrada, duración, finishReason y usage cuando existen. Evaluador v3 separa etiqueta, evidencia y dirección normalizada; bloquea anotaciones históricas antes de llamadas externas. |

## Criterios de aceptación

1. Una acción no desencadena regeneraciones automáticas tras error o abandono.
2. Ventanas de tiempo finitas; salida limitada; truncamiento no se presenta como éxito.
3. Fechas variables no descartan locaciones; año ausente no se inventa.
4. Sitios válidos sobreviven a hermanos inválidos; estos quedan pendientes sin entrar en cálculo.
5. Etiquetas, originales y direcciones normalizadas no se confunden.
6. Estado HTTP coincide con estado guardado, incluidos triggers.
7. Una extracción completa con revisión cuenta una vez; fallos sin resultado no cuentan.
8. Precisión real requiere anotaciones válidas y muestra independiente; las pruebas simuladas no autorizan afirmar 95 %.

## Pruebas y límites

Pruebas locales de SDK con fetch simulado comprueban parámetros realmente serializados, tokens informados, corte temporal y ausencia de segunda petición ante errores. Pruebas de pipeline comprueban guardado, estado de trigger, truncamiento, candidato mal formado y ausencia de normalización. Pruebas del handler real del worker con base/proveedor simulados comprueban que dos invocaciones no regeneran el fallido y que un procesamiento abandonado no se reencola.

No se realizaron llamadas de IA o Maps de pago, no se modificaron saldos, ni se publicó. La mejora de precisión/tiempo sobre PDFs reales sigue sin medirse. Los límites previenen crecimiento de trabajo y hacen diagnosticable una repetición; no demuestran que todo formato sea interpretable ni explican por sí solos la demora interna anterior.
