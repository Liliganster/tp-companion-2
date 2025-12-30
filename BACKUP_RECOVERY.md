# Backups y recuperación (runbook)

Este documento describe **cómo recuperar el servicio** ante pérdida/corrupción de datos en Supabase y cómo validar que la app vuelve a funcionar.

## Objetivos (rellenar)
- **RPO (Recovery Point Objective)**: ___ (pérdida máxima aceptable de datos, p.ej. 1h / 24h)
- **RTO (Recovery Time Objective)**: ___ (tiempo máximo para volver a operar, p.ej. 2h)
- **Entorno de recuperación**: usar un proyecto Supabase “recovery/staging” o restaurar en producción (decidir antes de la emergencia).

## Qué se respalda
### Base de datos (Postgres / Supabase)
- Tablas críticas:
  - `projects`, `trips`, `user_profiles`
  - `project_documents`
  - IA: `invoice_jobs`, `invoice_results`, `callsheet_jobs`, `callsheet_results`, `callsheet_locations`
  - Conexión Google: `google_connections`
- Seguridad:
  - RLS activado + policies
  - constraints, triggers y vistas (migraciones)

### Storage (Supabase Storage)
- Buckets usados por la app:
  - `callsheets`
  - `project_documents`

> Importante: los backups de DB **no garantizan** restauración de los archivos de Storage. Necesitas un plan específico para Storage si esos archivos son críticos.

## Roles y accesos (rellenar)
- Owner del proyecto Supabase: ___
- Persona responsable de restore: ___
- Acceso a Vercel (env vars / redeploy): ___

## Plan A: restaurar desde backups de Supabase
### Cuándo usarlo
- Corrupción/borrado accidental de datos en DB.
- Cambios de esquema peligrosos aplicados en producción.

### Pasos (alto nivel)
1. **Congelar escrituras** (recomendado):
   - Desactivar temporalmente el UI o mostrar mantenimiento.
   - (Opcional) deshabilitar cron de workers para no procesar jobs durante el restore.
2. **Restaurar la DB** desde Supabase:
   - Supabase Dashboard → **Project Settings** → **Database** → **Backups**
   - Elegir snapshot/PITR (según plan) y restaurar al punto deseado.
3. **Verificar esquema y RLS**:
   - Confirmar que existen tablas/vistas/funciones esperadas.
   - Confirmar que RLS está activado donde toca y que las policies están presentes.
4. **Reactivar el servicio**:
   - Volver a habilitar cron/workers.
   - Quitar modo mantenimiento.

### Checklist post-restore (DB)
- Auth:
  - Registro/login funciona (Google + email/password).
- Datos:
  - `trips` carga y se puede crear/editar/borrar.
  - `projects` carga y se puede crear/editar/borrar.
  - `project_documents` lista documentos por proyecto.
- IA:
  - Encolar extracción funciona.
  - Los jobs `queued` se procesan por cron y llegan a `done`.
  - Si hay cuota agotada: jobs pasan a `out_of_quota` (no a `needs_review`).
- Permisos:
  - Un usuario **no** puede leer datos de otro (RLS).

## Plan B: exportaciones periódicas (recomendado)
### Objetivo
Tener una copia adicional fuera de Supabase para:
- restaurar en otro proyecto/región
- recuperar ficheros de Storage
- auditoría/forense

### DB: export lógico periódico
- En una máquina controlada (CI, job, o runner), ejecutar export (p.ej. `pg_dump`) y subirlo cifrado a S3/GCS.
- Retención recomendada: 30 días + 12 meses (mensual) (adaptar a compliance).

### Storage: copia de buckets
- Sincronizar objetos de `callsheets` y `project_documents` a un bucket externo (S3/GCS).
- Mantener estructura de paths (p.ej. `userId/jobId/filename`).
- Retención + versionado recomendado en el bucket externo.

### Frecuencia sugerida (ajustable)
- DB export: diario (o cada 6h si el RPO es estricto).
- Storage sync: diario (o continuo si los documentos son críticos).

## Simulacro de recuperación (cada 3 meses)
### Objetivo
Medir RTO/RPO reales y detectar roturas del proceso.

### Procedimiento
1. Restaurar un backup/volcado en un proyecto Supabase “recovery/staging”.
2. Desplegar un preview en Vercel apuntando al proyecto de recuperación.
3. Ejecutar el checklist post-restore.
4. Documentar:
   - tiempo total (RTO real)
   - punto de datos restaurado (RPO real)
   - incidencias y acciones correctivas

## Notas operativas
- Guardar las credenciales de export/sync (S3/GCS) en un gestor de secretos (no en el repo).
- Limitar permisos IAM del bucket externo (solo write para el job, read solo para recuperación).
- Asegurar cifrado en tránsito y en reposo.

