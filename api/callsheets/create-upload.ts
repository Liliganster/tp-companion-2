import { supabaseAdmin } from "../../src/lib/supabaseServer";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const { filename, contentType, size } = req.body;
    
    // Create new job
    const { data: job, error: jobError } = await supabaseAdmin
      .from("callsheet_jobs")
      .insert({
        user_id: user.id,
        storage_path: "pending", // Will verify on queue
        status: "created",
      })
      .select()
      .single();

    if (jobError) throw jobError;

    const filePath = `${user.id}/${job.id}/${filename || "document.pdf"}`;

    // Generate signed upload URL
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from("callsheets")
      .createSignedUploadUrl(filePath);

    if (uploadError) throw uploadError;

    // Update job with anticipated path
    await supabaseAdmin
      .from("callsheet_jobs")
      .update({ storage_path: filePath })
      .eq("id", job.id);

    res.status(200).json({
      jobId: job.id,
      uploadUrl: uploadData.signedUrl,
      path: uploadData.path,
    });
  } catch (err: any) {
    console.error("Create upload error:", err);
    res.status(500).json({ error: err.message });
  }
}
