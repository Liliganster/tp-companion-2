# Extractor de callsheets: revisión de bloqueos — 2026-09-11

Proyecto: C:\Users\lilia\Escritorio\trip-companion-main 2\trip-companion-main.
Perfil: callsheet-2026-09-11-v4-review.

## Problema y comportamiento corregido

Un callsheet con fecha y dirección identificadas quedaba en revisión porque el modelo explicaba que no había encontrado el nombre del proyecto. Otro PDF, dedicado a segunda unidad, perdía todas sus locaciones por una exclusión global. Un año ausente se propagaba a cada dirección como incertidumbre y se repetía con direcciones y enlaces completos en la tabla.

La extracción ahora separa el ámbito de una observación (documentReviewScope) de su explicación. Los avisos de metadatos no invalidan fecha ni destinos. Los conflictos reales de cobertura, unidad o fecha se mantienen. Una observación antigua sin ámbito, o con ámbito inválido, sigue tratándose de forma conservadora; no se clasifica mediante palabras de un idioma concreto.

El nombre desconocido se guarda como NULL, conservando la respuesta original en la evidencia. Así el trigger existente no compara Untitled Project contra un proyecto elegido como si fuese un título real diferente. Las discrepancias entre títulos reales siguen comprobándose. No requiere migración.

La unidad que gobierna un PDF es elegible, incluida una segunda unidad. En documentos mixtos se separa la planificación principal de los bloques explícitamente asignados a otra unidad. Una locación sin etiqueta de unidad hereda el contexto; una contradicción explícita sigue pendiente. Esto sustituye la exclusión global de segunda unidad conforme a la indicación del usuario.

La fecha incompleta mantiene el documento pendiente, pero no degrada por sí sola direcciones identificadas. El resumen contiene el motivo documental una vez y la cantidad de locaciones pendientes; cada locación conserva su propio motivo sin repetir dirección y enlace.

Una escena identificada como móvil sin destino físico no crea un candidato vacío por tener una explicación descriptiva. Una posible locación independiente no resuelta debe clasificarse como incierta. Las menciones consecutivas con la misma dirección postal se agrupan conservando etiquetas y evidencia. Las visitas posteriores A → B → A se conservan también en el optimizador; una dirección repetida se geocodifica una sola vez por ejecución.

## Validación

- 174 pruebas locales en 23 archivos aprobadas y TypeScript comprobado.
- Tres PDF completos enviados una vez cada uno a Gemini real: aproximadamente 10–11 segundos, sin timeouts ni reintentos.
- Storage, propiedad y guardado usan adaptadores locales: no certifica persistencia, RLS, cuota ni recorrido autenticado en producción.
- Tras observar tres alias del hotel en la respuesta real, se ajustó su agrupación. Se reprodujeron las mismas respuestas mediante el núcleo final y optimizador sin red ni gasto adicional, conservando ambas ejecuciones.

| Documento | Resultado del núcleo final |
|---|---|
| Fundbox_Dispo DT 1.pdf | Completado, 12.11.2024, Frankenberggasse 10 una vez. El modelo aún omite el título Fundbox que sí aparece en la cabecera; esa omisión ya no bloquea el recorrido. |
| FUNDBOX_Dispo DT 4.pdf | Pendiente por año ausente; cuatro bloques en orden y un único aviso de fecha. Las erratas postales y el punto preciso de Stadtpark siguen sin resolverse; no se certifica su recorrido. |
| TF2 DT61 20240515 2ND UNIT.pdf | Completado, 15.05.2024, Jochen-Rindt-Straße 21. El PDF gobierna la segunda unidad. |

Evidencia local privada: C:\Users\lilia\Documents\Codex\2026-09-10\la-x20\outputs\callsheet-eval-20260911\v4. Contiene respuestas reales, reproducción final, hashes y ejecutores. El registro presupuestario compartido está en la carpeta superior: aproximadamente **0,7663 €** contabilizados con margen y provisiones, dentro del máximo acumulado de **1 €**. No es una lectura del saldo ni de la factura. No hubo llamadas nuevas a Maps en esta corrección.

## Límites y evaluaciones anteriores

Estos tres casos conocidos comprueban bloqueos concretos; no establecen un 95 % general. La evaluación v2 verificó automáticamente 5/9 rodajes principales y la v3 4/9. Los otros dos documentos eran controles; la política de segunda unidad cambió después, por lo que no procede comparar porcentajes sin ajustar el criterio.

Siguen pendientes la identificación consistente del título, las sustituciones de número/rango de Google, el cálculo desde texto cuya geocodificación no se acepta y la normalización de destinos de documentos pendientes por otros campos. Tener kilómetros o estado completado no certifica por sí solo una ubicación precisa.

El PDF sigue llegando íntegro. Se mantiene una generación, 100 segundos, 8192 tokens máximos de salida y presupuesto de pensamiento 1024. No se amplían tiempos, cuotas ni reintentos. Los resultados históricos no se modifican ni regeneran automáticamente con el despliegue.

## Actualización v5: fecha parcial visible y revisión breve

Perfil callsheet-2026-09-11-v5-partial-date. El prompt se reduce a seis párrafos que piden interpretar el PDF completo como una unidad, conservar los datos conocidos y señalar brevemente la incertidumbre del campo afectado. dateRaw es obligatorio en la respuesta del modelo. Una fecha sin año conserva día y mes; date_value sigue siendo NULL hasta disponer de una fecha completa, sin inventar el año.

La revisión ahora consulta date_evidence, antes guardado pero omitido por la vista, y muestra la fecha detectada junto a direcciones ordenadas y un aviso corto. Las etiquetas y observaciones individuales quedan plegadas. Esto también mejora la presentación de registros históricos sin regenerarlos ni gastar IA. El formulario conserva la fecha original como ayuda al completar la fecha canónica. Las explicaciones antiguas se abrevian para su presentación, sin eliminar la evidencia almacenada. No requiere migración.

Validación: 179 pruebas en 24 archivos y TypeScript aprobados. Una generación real adicional sobre FUNDBOX_Dispo DT 4.pdf completo devolvió date=19 November, dateRaw=Tuesday, 19th Nov y cuatro destinos en orden, en 9,2 segundos. El núcleo conservó date_evidence y emitió únicamente Fecha incompleta o ambigua. Se usaron adaptadores locales para Storage y persistencia; esta prueba no valida escrituras autenticadas en producción. Sin llamadas nuevas a Maps. Evidencia privada en outputs/callsheet-eval-20260911/v5 del workspace Codex. Presupuesto acumulado conservador: 0,77474445 EUR del máximo autorizado de 1 EUR, sujeto a la misma estimación y provisiones anteriores.

Esta prueba verifica la recuperación de fecha parcial, no una precisión general del 95 %. Permanecen los límites de precisión geográfica descritos arriba.

## Conservación del lote y de los fallos

Se verificó un lote comunicado como cuatro documentos del que solo quedaban en Supabase los dos viajes HOFER del 7 y 8 de mayo. HOFER del 6 de mayo y DISPO 25 no conservaban registros. Sin esos registros no se puede atribuir a cada archivo una causa de extracción concreta.

Se encontraron eliminaciones automáticas en errores de subida/puesta en cola y al cerrar o cancelar trabajos. Además, reabrir el modal solo recuperaba queued/processing/done, con un máximo de diez registros de las últimas 24 horas. La corrección conserva registro y archivo, cuenta también cada fallo de subida y solo envía a IA los archivos puestos en cola. El nombre y ruta se registran antes de subir; si falla incluso la creación del registro, el error permanece en el lote actual, aunque sin conexión no puede garantizarse su persistencia remota. Un fallo de subida puede requerir volver a seleccionar el original.

Cancelar modifica el estado de los trabajos activos; no elimina archivos ni altera fallos o resultados ya completados. Viajes y la reapertura de carga muestran los estados pendientes y terminales sin excluir fallidos/cancelados ni resultados sin guardar. La consulta de recuperación pagina todos los registros. Las cargas o colas abandonadas se muestran como interrumpidas tras el plazo existente, sin reiniciar automáticamente IA. La eliminación explícita de documentos sigue siendo una acción separada. El modelo, su prompt, su plazo y el presupuesto no cambian.

Validación: 190 pruebas locales en 27 archivos y TypeScript. Incluyen cuatro archivos con un error de subida y otro de cola, conservación de los cuatro registros al recargar, cancelación sin borrado y reapertura del componente con dos viajes guardados y dos documentos fallidos/interrumpidos. No se hicieron nuevas llamadas a Gemini ni Maps. Los dos originales ausentes se recuperaron de la carpeta de prueba como needs_review, comprobando propiedad de Storage y SHA-256 de los bytes descargados. Esto recupera los documentos, no sus extracciones anteriores ni demuestra precisión del modelo. No requiere migración.
