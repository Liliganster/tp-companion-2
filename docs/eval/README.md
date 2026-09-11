# Validación del sistema de callsheets

Las pruebas locales usan respuestas simuladas y no miden precisión del modelo.
Las llamadas reales requieren autorización explícita para costes; están prohibidas en esta tarea.
El evaluador exige `--allow-paid-ai` y anotaciones v3 antes de crear usuarios, subir archivos o llamar a la IA.

## Contrato v3

Un documento es correcto si coincide la fecha documentada, el estado final, el número y orden de destinos, cada etiqueta original, cada evidencia de dirección, cada dirección normalizada y su estado confirmed/candidate. Sobran o faltan destinos: documento incorrecto. Una fecha sin año permanece vacía y requiere revisión, nunca se deduce del calendario.

Campos por anotación: `contractVersion: 3`, `archivo`, `fecha` (vacía si falta año), `expectedStatus`, `localizaciones`.
Por locación: `etiqueta` exactamente impresa, `direccion_original` como evidencia, `direccion` postal normalizada solamente desde el documento (vacía si no está resuelta), `estado: confirmed|candidate`.
No mezclar nombre del sitio con etiqueta; no completar desde Maps/memoria ni usar logística como dirección del set.

Las anotaciones existentes son históricas y necesitan revisión: algunas completan direcciones o años y otras mezclan etiqueta con nombre. No deben convertirse a v3 cambiando solo el número de versión. El evaluador las rechaza antes de operaciones externas.

## Muestra y separación

Hay 6 PDFs reales / 22 páginas y un PDF sintético. Los sintéticos no entran en precisión.
DISPO_25 y HOFER_060524 ya fueron utilizados para diagnóstico: no son muestra reservada.
Reservar nuevos documentos independientes para evaluación final; mantener casos con varias locaciones, anexos, otros días/unidades, mapas, escaneos, idiomas distintos y metadatos incompletos.
Una muestra de 6 no demuestra una fiabilidad general del 95 % para formatos desconocidos.

## Evidencia por ejecución autorizada

Guardar huella del archivo, versión de política, proveedor/modelo, límites, duración, uso de tokens cuando el proveedor lo entrega, resultado del modelo, seleccionados/excluidos, datos guardados y estado final.
La nueva extracción registra esos datos en logs y en `model_output._diagnostics` de resultados completos. En timeout no se inventa consumo: puede no existir información del proveedor.
Registrar errores de subida/ejecución también; no excluir fallos del denominador. Verificar después revisión, guardado manual, tabla y reportes con una cuenta de prueba.

## Pruebas sin costes

`npm run test:extractor` y `npm run typecheck`.
Las pruebas SQL reversibles están en `supabase/tests/callsheet_atomic_save.sql`; no corrigen balances históricos.

Solo con autorización futura de costes: `npm run eval:extractor -- --allow-paid-ai --only NOMBRE`.
Este comando requiere antes anotaciones v3 revisadas. No se ejecutó durante esta corrección.
