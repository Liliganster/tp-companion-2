-- Function to check project mismatch
CREATE OR REPLACE FUNCTION check_project_mismatch()
RETURNS TRIGGER AS $$
DECLARE
    job_project_id UUID;
    job_project_name TEXT;
BEGIN
    -- Get the project_id from the job
    SELECT project_id INTO job_project_id
    FROM callsheet_jobs
    WHERE id = NEW.job_id;

    -- If the job has a specific project assigned (uploaded from Project Modal)
    IF job_project_id IS NOT NULL THEN
        -- Get the project name
        SELECT name INTO job_project_name
        FROM projects
        WHERE id = job_project_id;
        
        -- Compare extracted project_value with actual project name
        -- Simple normalization: trim and lowercase
        IF NEW.project_value IS NOT NULL AND job_project_name IS NOT NULL THEN
            IF lower(trim(NEW.project_value)) != lower(trim(job_project_name)) THEN
                -- Mismatch detected!
                -- Update job status to needs_review
                UPDATE callsheet_jobs
                SET status = 'needs_review',
                    needs_review_reason = 'Project mismatch: AI extracted "' || NEW.project_value || '" but file is in project "' || job_project_name || '"'
                WHERE id = NEW.job_id;
                
                -- Optionally mark result as needing review
                NEW.project_needs_review := TRUE; -- Assuming this column exists or we modify callsheet_results?
                -- Schema shows producer_needs_review, but not generic needs_review. 
                -- We rely on job status 'needs_review'
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS on_callsheet_result_check_project ON callsheet_results;
CREATE TRIGGER on_callsheet_result_check_project
    BEFORE INSERT ON callsheet_results
    FOR EACH ROW
    EXECUTE FUNCTION check_project_mismatch();
