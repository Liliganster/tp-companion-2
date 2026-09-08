# Validated document uploads

Only PDF, JPG/JPEG and PNG are stored by new uploads. Callsheets: 10 MiB; receipts/project_documents: 5 MiB. Receipt photos are re-encoded as JPEG in the browser, then validated by the server. Historical files remain readable.

The authenticated prepare endpoint signs a 30-minute ticket bound to the user, destination, MIME, exact size and random quarantine path. Callsheet jobs must belong to that user. The browser uploads directly to private `upload_quarantine` using a signed URL (Supabase's URL lifetime is 2 hours). The finalize endpoint downloads the object, checks size, MIME/extension and leading/trailing format signatures, and stores the exact validated bytes with upsert disabled. Cleanup runs after finalization; abandoned objects older than 3 hours are cleaned on the user's next preparation (up to 100 oldest objects per request).

Both endpoints have per-user request limits using the existing rate limiter. No new paid service, AI call, environment secret or dependency is required. Signature checks are not antivirus scanning or PDF active-content removal.

Deploy endpoints and frontend, then apply `supabase/migrations/20260908000002_secure_document_uploads.sql`. During a staged rollout, create the private quarantine bucket first. The migration sets MIME/size limits and restrictive INSERT/UPDATE policies: authenticated and anonymous clients cannot upload, overwrite, copy or move into final buckets using permissive legacy policies. Quarantine reads are server-only. The old create-upload endpoint returns 410 so it cannot issue validation-bypassing signed URLs. Previously issued signed URLs can survive for their original 2-hour lifetime.

Server-owned receipts are readable/deletable by their authenticated user's path prefix, alongside legacy owner-based access. Existing document contents and historical metadata are unchanged. Existing service-worker clients must use the application's update prompt to load the new upload flow.

Tests cover MIME/extension and size mismatch, disguised executable/truncated files, ticket tampering/expiry/cross-user use, unsafe paths, unauthorized requests, validation before final storage, no-overwrite and cleanup. No AI extraction is needed for upload verification.
