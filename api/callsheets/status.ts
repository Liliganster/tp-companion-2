import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
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

  const { jobId } = req.query;

  if (!jobId) {
    res.status(400).json({ error: "Missing jobId" });
    return;
  }

  try {
    const { data: job, error: jobError } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    let results = null;
    let locations = [];

    if (job.status === "done" || job.status === "needs_review") {
      const { data: resData } = await supabaseAdmin
        .from("callsheet_results")
        .select("*")
        .eq("job_id", jobId)
        .single();
      results = resData;

      const { data: locData } = await supabaseAdmin
        .from("callsheet_locations")
        .select("*")
        .eq("job_id", jobId);
      locations = locData || [];
    }

    res.status(200).json({
      job,
      results,
      locations,
    });
  } catch (err: any) {
    console.error("Status error:", err);
    res.status(500).json({ error: err.message });
  }
}
