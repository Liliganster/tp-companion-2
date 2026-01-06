# Limpiar Caché de Climatiq

## Problema
Los datos de emisiones de gasolina están usando valores antiguos porque hay caché en múltiples lugares:
1. React Query (cliente) - ✅ RESUELTO (staleTime = 0)
2. Tabla `climatiq_cache` en Supabase - ⚠️ NECESITA LIMPIEZA
3. Navegador (localStorage/caché HTTP) - ⚠️ NECESITA LIMPIEZA

## Solución

### 1. Limpiar tabla de Supabase

Ejecuta esta query en el SQL Editor de Supabase:

```sql
-- Eliminar TODA la caché de Climatiq
DELETE FROM climatiq_cache;

-- O solo para un usuario específico:
-- DELETE FROM climatiq_cache WHERE user_id = 'tu-user-id-aqui';

-- Verificar que se eliminó:
SELECT * FROM climatiq_cache;
```

### 2. Limpiar caché del navegador

Opción A - Consola del navegador (F12):
```javascript
// Limpiar React Query cache
window.localStorage.clear();
sessionStorage.clear();

// Forzar reload sin caché
location.reload(true);
```

Opción B - Hard reload:
- Windows/Linux: `Ctrl + Shift + R` o `Ctrl + F5`
- Mac: `Cmd + Shift + R`

### 3. Verificar que funciona

1. Abre la consola del navegador (F12)
2. Ve a Network tab
3. Busca la llamada a `/api/climatiq/fuel-factor?fuelType=gasoline`
4. Verifica que el response incluya:
   ```json
   {
     "activityId": "fuel-type_motor_gasoline-fuel_use_na",
     "kgCo2ePerLiter": X.XX,
     "region": "NA",
     "paramType": "volume"
   }
   ```

## Cambios realizados en el código

✅ `use-climatiq.ts`: `staleTime: 0` (sin caché de React Query)
✅ `fuel-factor.ts`: Confirmado `activity_id: fuel-type_motor_gasoline-fuel_use_na`
✅ `fuel-factor.ts`: Región cambiada a "NA" para gasoline (sin especificidad regional)

## Si el problema persiste

1. Verifica que `CLIMATIQ_API_KEY` esté configurada en Vercel/env
2. Ejecuta el comando de limpieza de caché en Supabase
3. Limpia el caché del navegador completamente
4. Cierra todas las pestañas de la app y vuelve a abrir

## Notas importantes

- El `activity_id` correcto para gasolina es: `fuel-type_motor_gasoline-fuel_use_na`
- Este activity_id usa volumen (litros) en lugar de distancia (km)
- La región "NA" significa "Not Applicable" (sin especificidad regional)
- Los datos ahora se obtienen frescos en cada carga, sin caché de 30 días
