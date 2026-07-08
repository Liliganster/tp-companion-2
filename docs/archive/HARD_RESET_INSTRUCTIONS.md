# Instrucciones para Hard Reset

## Problema
Al hacer un "hard reset" de la base de datos en Supabase, los datos vuelven a aparecer porque la app tiene una **migración automática de localStorage → Supabase**.

Los siguientes proyectos son **datos de ejemplo** que se crean automáticamente:
- Event Z (Event Agency Z)
- Internal
- Client ABC (ABC Corporation)  
- Film Production XY (XY Productions GmbH)
- casa (limpiar casa)

## ⚡ Solución Rápida (Recomendada)

### Opción 1: Script de limpieza automática

1. Copia el contenido del archivo `CLEANUP_DEMO_DATA.js`
2. Abre la consola del navegador (F12)
3. Pega el script y presiona Enter
4. Recarga la página (F5)

### Opción 2: Limpieza completa (más seguro)

Ejecuta en la consola del navegador:

```javascript
localStorage.clear();
console.log('✅ Todo el localStorage limpiado');
// Nota: Tendrás que volver a iniciar sesión
```

## 🔧 Solución Manual

### Limpiar solo datos de migración

```javascript
localStorage.removeItem('user-profile');
localStorage.removeItem('projects');
localStorage.removeItem('trips');
localStorage.removeItem('reports');
localStorage.removeItem('migration-completed-v1');
console.log('✅ localStorage limpiado');
```

## Pasos completos para Hard Reset

1. **En Supabase**: Elimina todos los datos de las tablas (projects, trips, reports, etc.)
2. **En el navegador**: Ejecuta uno de los scripts anteriores
3. **Recarga la app**: Los datos de ejemplo no volverán a aparecer

## ¿Por qué pasa esto?

La app tiene un sistema de migración que:
1. Lee datos del localStorage (datos viejos de antes de Supabase)
2. Los sube automáticamente a Supabase
3. Si haces hard reset en Supabase pero no limpias localStorage, vuelve a subirlos

## Verificar que funcionó

Después de la limpieza:
1. Abre la consola (F12)
2. Ve a Application → Local Storage
3. Verifica que estas claves estén vacías o no existan:
   - `projects`
   - `trips`
   - `reports`
   - `migration-completed-v1`
