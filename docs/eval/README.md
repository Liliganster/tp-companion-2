# Eval set de callsheets

Aquí se anota **a mano** el resultado esperado de cada callsheet de prueba. Estas anotaciones son la "verdad" contra la que se medirá el extractor en la Fase 2 (objetivo: ≥95% de acierto).

## Cómo anotar una callsheet

1. Copia `template.yaml` con el nombre del PDF (ej. `FUNDBOX_Dispo_DT_4.yaml`).
2. Abre el PDF y rellena los campos **mirando solo lo que pone la callsheet**, no lo que te gustaría que saliera.
3. Guarda el PDF original en `docs/eval/callsheets/` (misma carpeta, subcarpeta `callsheets`). Si contiene datos personales sensibles, no lo subas a git: basta con que el YAML diga el nombre del archivo.

## Qué anotar

- **fecha**: la fecha del día de rodaje, en formato `AAAA-MM-DD`. Si la callsheet no trae año, dedúcelo tú (el código hará lo mismo).
- **proyecto**: el nombre de la producción tal como debería quedar en la app.
- **productora**: si aparece (aunque sea solo como logotipo). Si no, déjalo vacío.
- **localizaciones**: EN ORDEN de rodaje. Para cada una:
  - `etiqueta`: el texto tal como aparece en la callsheet (literal, con erratas si las hay).
  - `direccion`: la dirección real y completa a la que conduce el conductor (corregida, geocodificable). Si hay **meeting point o Parkplatz asociado, esa es la dirección**, no el set en sí.
  - `enlace_maps`: si la callsheet trae enlace de Google Maps, pégalo aquí.
- **excluidas**: cosas que aparecen en la callsheet pero que NO deben salir como destino (lunch, production office, hospital de referencia…). Sirven para comprobar que el extractor no las cuela.

## Reglas de oro

- Anota lo que **un conductor del crew** necesitaría: a dónde se conduce de verdad ese día.
- Una localización mencionada dos veces cuenta una vez.
- Si dudas entre set y meeting point, gana el meeting point / Parkplatz.

## Estado

| Callsheet | Anotada |
|---|---|
| FUNDBOX_Dispo DT 4.pdf | ☐ |

Objetivo Fase 0: **≥10 anotadas**. Objetivo Fase 2: 20–30 (incluir 2–3 de rodajes DE/CZ/HU y alguna con productora solo como logo).
