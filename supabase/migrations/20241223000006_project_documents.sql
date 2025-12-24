-- Create generic project documents table (for invoices/others not linked to trips)
CREATE TABLE IF NOT EXISTS project_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'invoice', -- invoice, contract, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own project documents" ON project_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own project documents" ON project_documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project documents" ON project_documents
    FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for project items
INSERT INTO storage.buckets (id, name, public) VALUES ('project_documents', 'project_documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Project Documents Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'project_documents' AND auth.uid() = owner);

CREATE POLICY "Project Documents Upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'project_documents' AND auth.uid() = owner);
    
CREATE POLICY "Project Documents Delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'project_documents' AND auth.uid() = owner);
