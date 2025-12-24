## Medidas Anti-Duplicación de Datos

### Base de Datos (Supabase)

**Archivo de migración**: [supabase/migrations/20241224000002_add_unique_constraints.sql](supabase/migrations/20241224000002_add_unique_constraints.sql)

#### 1. Proyectos
- **Constraint**: `UNIQUE(user_id, name)`
- **Previene**: Crear dos proyectos con el mismo nombre para el mismo usuario
- **Impacto**: Si se intenta crear un proyecto duplicado, la BD rechazará el insert con error código 23505

#### 2. Documentos de Proyecto
- **Constraint**: `UNIQUE(storage_path)`
- **Previene**: Subir el mismo archivo dos veces en diferentes proyectos
- **Impacto**: Storage paths únicos garantizan un archivo = una entrada en BD

#### 3. Callsheets/Trabajos
- **Index**: `UNIQUE(user_id, storage_path)` donde `storage_path != 'pending'`
- **Previene**: Asignar la misma ruta de almacenamiento a múltiples trabajos
- **Impacto**: Cada documento tiene un único job_id asociado

### Aplicación (Frontend/Backend)

#### 1. Proyectos Context (`src/contexts/ProjectsContext.tsx`)
- **Validación pre-insert**: Antes de insertar un proyecto, se consulta si ya existe por (user_id, nombre)
- **Manejo de errores**: Captura error 23505 (UNIQUE violation) y muestra mensaje amistoso
- **Reversión optimista**: Si falla, revierte cambios optimistas

#### 2. Upload de Facturas (`src/components/projects/ProjectInvoiceUploader.tsx`)
- **Nombres únicos en storage**: Usa `crypto.randomUUID()` en el path para evitar colisiones
- **Manejo de errores**: Si ocurre error 23505 en DB, registra como fallo pero continúa
- **Estrategia**: Cada archivo genera un UUID único garantizando rutas distintas

#### 3. Upload de Callsheets (`src/components/callsheets/CallsheetUploader.tsx`)
- **Path único**: `${user_id}/${job_id}/${file.name}` usa job_id único (UUID)
- **Validación de actualización**: Si falla actualizar storage_path por UNIQUE, registra y continúa
- **Limpieza**: Si update falla, intenta limpiar el job creado

#### 4. Materialización de Trips (`src/components/projects/ProjectDetailModal.tsx`)
- **Validación**: `hasTripForStoragePath()` verifica si un viaje ya existe para un storage_path
- **Prevención de loops**: Mantiene `processedJobsRef` para evitar procesar el mismo job dos veces en polling

#### 5. Creación de Trips en Bulk (`src/components/trips/BulkUploadModal.tsx`)
- **Creación inteligente de proyectos**: Busca proyecto existente antes de crear uno nuevo
- **Identificación por nombre**: Usa normalización (`toLowerCase()`) para comparación
- **Documento único por viaje**: Cada trip que se crea tiene una ruta de documento única

### Flujo de Datos - Puntos Críticos

```
Subir Documento
    ↓
Storage (UUID en path) → Garantiza unicidad física
    ↓
DB (UNIQUE(storage_path)) → Garantiza unicidad lógica
    ↓
Crear Job (id = UUID) → Job único
    ↓
Materializar Trip → Verifica hasTripForStoragePath()
    ↓
Trip creado (documentos incluidos)
```

### Testing Anti-Duplicación

Para verificar que funcione correctamente:

1. **Subir mismo documento dos veces**: Debería fallar con error amistoso en 2do intento
2. **Crear proyecto con mismo nombre**: Debería mostrar mensaje "ya existe"
3. **Procesar mismo job dos veces**: Polling con `processedJobsRef` previene duplicados
4. **Upload fallido y reintentado**: Path único garantiza diferencia en BD

### Recomendaciones de Mantenimiento

- Monitorear logs de error 23505 para detectar intentos de duplicación
- Considerar índices adicionales en `trips(user_id, created_at)` para reportes
- Revisar limpieza de documentos huérfanos (sin trip asociado)
