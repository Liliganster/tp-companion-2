-- % de uso profesional manual (Fase 4 del PLAN.md): km totales del coche
-- este año (lectura del cuentakilómetros o factura del taller/ITV).
-- El dashboard calcula: km profesionales registrados ÷ este valor.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS annual_car_total_km numeric;
