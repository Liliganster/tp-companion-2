-- Suaviza el guardián de "project mismatch": si el nombre del proyecto está
-- CONTENIDO en el extraído (o viceversa), no es un mismatch.
-- Caso real: proyecto "rex" + extracción "KOMMISSAR REX" → antes needs_review.

CREATE OR REPLACE FUNCTION check_project_mismatch()
RETURNS TRIGGER AS $$
DECLARE
    job_project_id UUID;
    job_project_name TEXT;
    a TEXT;
    b TEXT;
BEGIN
    SELECT project_id INTO job_project_id
    FROM callsheet_jobs
    WHERE id = NEW.job_id;

    IF job_project_id IS NOT NULL THEN
        SELECT name INTO job_project_name
        FROM projects
        WHERE id = job_project_id;

        IF NEW.project_value IS NOT NULL AND job_project_name IS NOT NULL THEN
            a := lower(trim(NEW.project_value));
            b := lower(trim(job_project_name));
            -- Mismatch solo si ninguno contiene al otro.
            IF a != b AND position(b IN a) = 0 AND position(a IN b) = 0 THEN
                UPDATE callsheet_jobs
                SET status = 'needs_review',
                    needs_review_reason = 'Project mismatch: AI extracted "' || NEW.project_value || '" but file is in project "' || job_project_name || '"'
                WHERE id = NEW.job_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
