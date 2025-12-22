import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

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

  const { jobId } = req.body;

  if (!jobId) {
    res.status(400).json({ error: "Missing jobId" });
    return;
  }

  try {
    // Verify job belongs to user and is in 'created' state
    const { data: job, error: fetchError } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "created") {
      res.status(400).json({ error: "Job already queued or processed" });
      return;
    }

    // Mark as queued
    const { error: updateError } = await supabaseAdmin
      .from("callsheet_jobs")
      .update({ status: "queued" })
      .eq("id", jobId);

    if (updateError) throw updateError;

    res.status(200).json({ success: true, status: "queued" });
  } catch (err: any) {
    console.error("Queue error:", err);
    res.status(500).json({ error: err.message });
  }
}
