-- Add UNIQUE constraint to prevent duplicate project names per user
ALTER TABLE projects
ADD CONSTRAINT unique_project_name_per_user UNIQUE (user_id, name);

-- Add UNIQUE constraint on storage_path for project_documents to prevent duplicate file paths
ALTER TABLE project_documents
ADD CONSTRAINT unique_storage_path UNIQUE (storage_path);

-- Add index to detect duplicate storage paths in callsheet_jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_callsheet_jobs_storage_path_user
ON callsheet_jobs(user_id, storage_path)
WHERE storage_path != 'pending';
