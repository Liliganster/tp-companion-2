# Instrucciones para Hard Reset

## Problema
Al hacer un "hard reset" de la base de datos en Supabase, los datos vuelven a aparecer porque la app tiene una **migración automática de localStorage → Supabase**.

## Solución

### Opción 1: Limpiar localStorage en el navegador

1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Application" o "Almacenamiento"
3. Elimina estas claves de localStorage:
   - `user-profile`
   - `projects`
   - `trips`
   - `reports`
   - `migration-completed-v1`

### Opción 2: Script de limpieza

Ejecuta este código en la consola del navegador:

```javascript
// Limpiar datos de migración
localStorage.removeItem('user-profile');
localStorage.removeItem('projects');
localStorage.removeItem('trips');
localStorage.removeItem('reports');
localStorage.removeItem('migration-completed-v1');
console.log('✅ localStorage limpiado');
```

### Opción 3: Limpiar todo el localStorage

```javascript
localStorage.clear();
console.log('✅ Todo el localStorage limpiado (tendrás que volver a iniciar sesión)');
```

## Después del reset

1. Limpia el localStorage usando una de las opciones anteriores
2. Haz el hard reset en Supabase (elimina datos de las tablas)
3. Recarga la aplicación
4. Los datos no volverán a aparecer

## Nota sobre datos de ejemplo

La app ya no tiene datos mock/demo. Si ves proyectos o viajes después del reset:
- Es porque están en localStorage y se están re-migrando
- Usa las instrucciones anteriores para limpiarlos
