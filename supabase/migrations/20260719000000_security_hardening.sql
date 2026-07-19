-- Endurecimiento de seguridad 2026-07-19 (auditoría mono-usuario).
-- Idempotente: pegar entera en el SQL Editor de Supabase.

-- 1. google_connections: los tokens OAuth de Google (refresh/access) NO deben
--    ser legibles desde el navegador. El estado de conexión se consulta vía
--    /api/google/oauth/status (service role). Sin policies la tabla queda
--    deny-all para anon/authenticated; el service role hace bypass de RLS.
DROP POLICY IF EXISTS "read_own_google_connection" ON public.google_connections;

-- 2. ai_extraction_logs: la policy de INSERT aplicaba a TODOS los roles con
--    WITH CHECK (true) — cualquier autenticado podía insertar filas con el
--    user_id de otro. El worker escribe con service role (bypass de RLS),
--    así que la policy sobra por completo.
DROP POLICY IF EXISTS "Service role can insert extraction logs" ON public.ai_extraction_logs;

-- 3. project_expenses: el UPDATE no tenía WITH CHECK — una fila propia podía
--    reasignarse a otro user_id. Se iguala al hardening del resto de tablas.
DROP POLICY IF EXISTS "Users can update their own project expenses" ON public.project_expenses;
CREATE POLICY "Users can update their own project expenses"
  ON public.project_expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. (REVERTIDO 2026-07-19, mismo día) Aquí había un DROP TABLE de
--    callsheet_excluded_blocks. La propietaria decidió CONSERVAR esa tabla
--    como base del multi-crew de la v2. Si ya pegaste la versión anterior de
--    esta migración, pega también 20260719000001_restore_callsheet_excluded_blocks.sql,
--    que la recrea (idempotente). Su acceso ya era seguro: solo escribe el
--    service role y el SELECT exige ser dueño del job (RLS).
