import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Star,
  StarOff,
  Car,
  FileText,
  Euro,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  FolderKanban,
  Calendar,
  Receipt,
  Leaf,
  ChevronsDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ProjectDetailModal } from "@/components/projects/ProjectDetailModal";
import { ProjectEditModal } from "@/components/projects/ProjectEditModal";
import { Project, useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/hooks/use-i18n";
import { uuidv4 } from "@/lib/utils";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { calculateTripEmissions } from "@/lib/emissions";
import { parseLocaleNumber } from "@/lib/number";
import { useEmissionsInput } from "@/hooks/use-emissions-input";

const getProjectKey = (name: string) => name.trim().toLowerCase();

export default function Projects() {
  const { t, tf, locale } = useI18n();
  const { profile } = useUserProfile();

  const { emissionsInput, fuelFactorData: fuelFactor, gridData: atGrid } = useEmissionsInput();

  const PROJECTS_FILTERS_KEY = "filters:projects:v1";
  const loadProjectsFilters = () => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(PROJECTS_FILTERS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery : null;
      const selectedYear = typeof parsed.selectedYear === "string" ? parsed.selectedYear : null;
      const selectedProducer = typeof parsed.selectedProducer === "string" ? parsed.selectedProducer : null;
      return { searchQuery, selectedYear, selectedProducer };
    } catch {
      return null;
    }
  };

  const [searchQuery, setSearchQuery] = useState(() => loadProjectsFilters()?.searchQuery ?? "");
  const [selectedYear, setSelectedYear] = useState(() => loadProjectsFilters()?.selectedYear ?? "all");
  const [selectedProducer, setSelectedProducer] = useState(() => loadProjectsFilters()?.selectedProducer ?? "all");
  const { user } = useAuth();
  const { projects, addProject, updateProject, deleteProject, toggleStar } = useProjects();
  const { trips } = useTrips();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { toast } = useToast();

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const editingProject = useMemo(() => 
    projects.find((p) => p.id === editingProjectId) || null
  , [projects, editingProjectId]);

  // Pagination state - show 5 projects initially
  const ITEMS_PER_PAGE = 5;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  interface ProjectDocument {
    id: string;
    name: string;
    type: "call-sheet" | "invoice" | "document" | "other";
    status?: string;
    storage_path?: string;
  }

  type AggregatedTripStats = {
    trips: number;
    totalKm: number;
    documents: number;
    invoices: number;
    co2Emissions: number;
    overrideCost: number;
    distanceAtDefaultRate: number;
    invoiceDocs: ProjectDocument[];
    callSheetDocs: ProjectDocument[];
    tripDocs: ProjectDocument[];
  };

  // Fetch document counts for projects
  const [projectCallsheetPathsByKey, setProjectCallsheetPathsByKey] = useState<Record<string, string[]>>({});
  const [projectInvoiceCountsByKey, setProjectInvoiceCountsByKey] = useState<Record<string, number>>({});
  const [countsRefreshToken, setCountsRefreshToken] = useState(0);

  // Keep counts fresh when jobs/documents change (avoid requiring a full page refresh).
  useEffect(() => {
    if (!supabase || !user?.id) return;

    let timer: any = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setCountsRefreshToken((p) => p + 1);
      }, 400);
    };

    const channel = supabase
      .channel(`projects-counts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "callsheet_jobs", filter: `user_id=eq.${user.id}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_documents", filter: `user_id=eq.${user.id}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timer) clearTimeout(timer);
    };
  }, [user?.id]);

  // Validate filters
  useEffect(() => {
    // If selectedYear is empty/invalid, reset to all
    if (!selectedYear) setSelectedYear("all");
    
    // If selectedProducer is empty/invalid, reset to all
    if (!selectedProducer) setSelectedProducer("all");
  }, [selectedYear, selectedProducer]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECTS_FILTERS_KEY, JSON.stringify({ searchQuery, selectedYear, selectedProducer }));
    } catch {
      // ignore
    }
  }, [searchQuery, selectedYear, selectedProducer]);

  useEffect(() => {
    const fetchCounts = async () => {
        const callsheetPathsByProjectId: Record<string, Set<string>> = {};
        const invoiceCountsByProjectId: Record<string, number> = {};
        
        // 1) Callsheets (manual uploads + trips-linked). When a callsheet job is referenced by a trip,
        // the trip's current project is the source of truth (so moves don't leave stale counts behind).
        const tripJobToProjectId = new Map<string, string>();
        for (const trip of trips ?? []) {
          const pid = String((trip as any)?.projectId ?? "").trim();
          const jobId = String((trip as any)?.callsheet_job_id ?? "").trim();
          if (!pid || !jobId) continue;
          if (!tripJobToProjectId.has(jobId)) tripJobToProjectId.set(jobId, pid);
        }

        // Fetch all callsheet jobs; RLS limits to the current user.
        const { data: jobs } = await supabase
          .from("callsheet_jobs")
          .select("id, project_id, storage_path");

        jobs?.forEach((job: any) => {
          const jobId = String(job?.id ?? "").trim();
          const path = (job.storage_path ?? "").toString().trim();
          const pid = String(tripJobToProjectId.get(jobId) ?? job.project_id ?? "").trim();
          if (!jobId || !pid || !path || path === "pending") return;
          if (!callsheetPathsByProjectId[pid]) callsheetPathsByProjectId[pid] = new Set();
          callsheetPathsByProjectId[pid].add(path);
        });
        
        // 2) Project invoices by project_id
        const { data: invoices } = await supabase.from("project_documents").select("project_id");
        invoices?.forEach((inv: any) => {
          const pid = inv.project_id;
          if (!pid) return;
          invoiceCountsByProjectId[pid] = (invoiceCountsByProjectId[pid] || 0) + 1;
        });

        // 3) Legacy/extracted results by project_value (name linking)
        if (projects.length > 0) {
             const idToKey = new Map<string, string>();
             projects.forEach(p => idToKey.set(p.id, getProjectKey(p.name)));
             
             const callsheetPathsByKey: Record<string, Set<string>> = {};
             const invoiceCountsByKey: Record<string, number> = {};

             // Transfer explicit project_id callsheets to NAME keys
             for (const [pid, pathSet] of Object.entries(callsheetPathsByProjectId)) {
               const key = idToKey.get(pid);
               if (!key) continue;
               if (!callsheetPathsByKey[key]) callsheetPathsByKey[key] = new Set();
               for (const p of pathSet) callsheetPathsByKey[key].add(p);
             }

             // Transfer project invoice counts to NAME keys (Facturas column)
             for (const [pid, count] of Object.entries(invoiceCountsByProjectId)) {
               const key = idToKey.get(pid);
               if (!key) continue;
               invoiceCountsByKey[key] = (invoiceCountsByKey[key] || 0) + count;
             }

             // Legacy results: callsheet_jobs has no project_id, but results.project_value matches
             const { data: results } = await supabase
               .from("callsheet_results")
               .select("project_value, job_id, callsheet_jobs!inner(project_id, storage_path)");

              results?.forEach((res: any) => {
                const jobId = String(res?.job_id ?? "").trim();
                // If a job is referenced by a trip, we already counted it using the trip's current project.
                // This prevents legacy `project_value` from leaving stale document counts behind after moves.
                if (jobId && tripJobToProjectId.has(jobId)) return;
                const job = res.callsheet_jobs;
                const path = (job?.storage_path ?? "").toString().trim();
                if (!path || path === "pending") return;
                if (!job?.project_id) {
                  const key = getProjectKey(res.project_value);
                 if (!callsheetPathsByKey[key]) callsheetPathsByKey[key] = new Set();
                 callsheetPathsByKey[key].add(path);
               }
             });

             setProjectCallsheetPathsByKey(
               Object.fromEntries(Object.entries(callsheetPathsByKey).map(([k, v]) => [k, Array.from(v)])),
             );
             setProjectInvoiceCountsByKey(invoiceCountsByKey);
        }
    };
     
    fetchCounts();
  }, [projects, trips, countsRefreshToken]);


  const statsByProjectKey = useMemo(() => {
    const map = new Map<string, AggregatedTripStats>();

    for (const trip of trips) {
      const key = getProjectKey(trip.project ?? "");
      if (!key) continue;

      // Filter by selected year
      const matchesYear = selectedYear === "all" || trip.date.startsWith(selectedYear);
      if (!matchesYear) continue;

      const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
      const co2 = calculateTripEmissions({ distanceKm: distance, ...emissionsInput }).co2Kg;

      const current = map.get(key) ?? {
        trips: 0,
        totalKm: 0,
        documents: 0,
        invoices: 0,
        co2Emissions: 0,
        overrideCost: 0,
        distanceAtDefaultRate: 0,
        invoiceDocs: [],
        callSheetDocs: [],
        tripDocs: [],
      };

      current.trips += 1;
      current.totalKm += distance;
      current.co2Emissions += co2;
      
      // Count trip receipts (toll, parking, fuel, other receipts)
      if (trip.documents && trip.documents.length > 0) {
        const tripReceiptCount = trip.documents.filter(doc => 
          doc.kind === "toll_receipt" || 
          doc.kind === "parking_receipt" || 
          doc.kind === "fuel_receipt" || 
          doc.kind === "other_receipt" ||
          doc.kind === "invoice"
        ).length;
        current.invoices += tripReceiptCount;
        
        // Add trip documents
        trip.documents.forEach(doc => {
          current.callSheetDocs.push({
             id: doc.id,
             name: doc.name,
             type: "document"
          });
        });
      }

      if (typeof trip.ratePerKmOverride === "number" && Number.isFinite(trip.ratePerKmOverride)) {
        current.overrideCost += distance * trip.ratePerKmOverride;
      } else {
        current.distanceAtDefaultRate += distance;
      }

      map.set(key, current);
    }
    
    // Count project callsheets (from callsheet_jobs ONLY)
    const keys = new Set<string>([
      ...Array.from(map.keys()),
      ...Object.keys(projectCallsheetPathsByKey),
      ...Object.keys(projectInvoiceCountsByKey),
    ]);

    for (const key of keys) {
      const current = map.get(key) ?? {
        trips: 0,
        totalKm: 0,
        documents: 0,
        invoices: 0,
        co2Emissions: 0,
        overrideCost: 0,
        distanceAtDefaultRate: 0,
        invoiceDocs: [],
        callSheetDocs: [],
        tripDocs: [],
      };

      // Project callsheets: count unique paths from callsheet_jobs
      const uniqueDocuments = new Set<string>();
      for (const p of projectCallsheetPathsByKey[key] ?? []) {
        const trimmed = (p ?? "").toString().trim();
        if (!trimmed || trimmed === "pending") continue;
        const fileName = trimmed.split("/").pop() || trimmed;
        uniqueDocuments.add(fileName.toLowerCase());
      }

      current.documents = uniqueDocuments.size;
      // Add project invoices (from project_documents)
      current.invoices += projectInvoiceCountsByKey[key] ?? 0;

      map.set(key, current);
    }

    return map;
  }, [trips, projectCallsheetPathsByKey, projectInvoiceCountsByKey, emissionsInput, selectedYear]);




  const openProjectDetails = (project: Project) => {
    setSelectedProject(project);
    setDetailModalOpen(true);
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      await deleteProject(project.id);

      setSelectedIds((prev) => {
        if (!prev.has(project.id)) return prev;
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });

      if (selectedProject?.id === project.id) {
        setDetailModalOpen(false);
        setSelectedProject(null);
      }

      toast({
        title: t("projects.toastDeletedTitle"),
        description: tf("projects.toastDeletedBody", { count: 1 }),
      });
    } catch {
      toast({
        title: t("projects.toastDeletedTitle"),
        description: "No se pudo borrar el proyecto.",
        variant: "destructive",
      });
    }
  };

  const openEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setCreateProjectOpen(true);
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.producer?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProducer = selectedProducer === "all" || project.producer === selectedProducer;

    if (!matchesSearch || !matchesProducer) return false;

    if (selectedYear !== "all") {
      const key = getProjectKey(project.name);
      const stats = statsByProjectKey.get(key);
      if (!stats || stats.trips === 0) return false;
    }

    return true;
  });

  // Paginated projects
  const visibleProjects = useMemo(() => 
    filteredProjects.slice(0, visibleCount), 
    [filteredProjects, visibleCount]
  );
  const hasMoreProjects = filteredProjects.length > visibleCount;
  const remainingCount = filteredProjects.length - visibleCount;

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery, selectedYear, selectedProducer]);

  const selectedProjectStats = useMemo(() => {
    if (!selectedProject) return null;
    const baseStats = statsByProjectKey.get(getProjectKey(selectedProject.name));
    
    // Create default stats for projects with 0 trips to allow document uploads
    const defaultStats = {
      trips: 0,
      totalKm: 0,
      documents: 0,
      invoices: 0,
      co2Emissions: 0,
      overrideCost: 0,
      distanceAtDefaultRate: 0,
      invoiceDocs: [],
      callSheetDocs: [],
    };

    const stats = baseStats || defaultStats;

    // Calculate shooting days from trips
    const projectTrips = trips.filter((t) => getProjectKey(t.project ?? "") === getProjectKey(selectedProject.name));
    const uniqueDates = new Set(projectTrips.map((t) => t.date).filter(Boolean));
    const shootingDays = uniqueDates.size;
    const kmPerDay = shootingDays > 0 ? stats.totalKm / shootingDays : 0;

    return {
      ...stats,
      shootingDays,
      kmPerDay,
    };
  }, [selectedProject, statsByProjectKey, trips]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteProject(id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;

    if (failed === 0) {
      toast({
        title: t("projects.toastDeletedTitle"),
        description: tf("projects.toastDeletedBody", { count: ids.length }),
      });
      setSelectedIds(new Set());
      return;
    }

    toast({
      title: t("projects.toastDeletedTitle"),
      description: `Se borraron ${ok}/${ids.length}. ${failed} fallaron (no se borró todo lo asociado).`,
      variant: "destructive",
    });
  };

  const handleSaveProject = async (data: {
    name: string;
    producer?: string;
    description?: string;
    ratePerKm: number;
    ratePerPassenger?: number;
  }) => {
    const { name, producer, description, ratePerKm, ratePerPassenger } = data;
    
    // Check for duplicates
    const exists = projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase() && p.id !== editingProjectId);
    if (exists) {
      toast({
        title: editingProjectId ? t("projects.edit") : t("projects.createNewProject"),
        description: "Ya existe un proyecto con ese nombre",
        variant: "destructive",
      });
      throw new Error("Duplicate project name");
    }

    if (editingProjectId) {
      await updateProject(editingProjectId, {
        name,
        producer,
        description,
        ratePerKm,
      });

      toast({
        title: t("projects.edit"),
        description: "Proyecto actualizado",
      });
    } else {
      await addProject({
        id: uuidv4(),
        name,
        producer,
        description,
        ratePerKm,
        starred: false,
        archived: false,
        trips: 0,
        totalKm: 0,
        documents: 0,
        invoices: 0,
        estimatedCost: 0,
        shootingDays: 0,
        kmPerDay: 0,
        co2Emissions: 0,
        createdAt: new Date().toISOString(),
      });

      toast({
        title: t("projects.createProject"),
        description: "Proyecto creado",
      });
    }
    // Form reset is handled by Modal unmount/open change
  };

  const isAllSelected = filteredProjects.length > 0 && selectedIds.size === filteredProjects.length;
  const isSomeSelected = selectedIds.size > 0;

  return (
    <MainLayout>
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {t("projects.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("projects.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSomeSelected && (
              <Button variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t("projects.delete")} ({selectedIds.size})</span>
              </Button>
            )}
            <ProjectEditModal
              open={createProjectOpen}
              onOpenChange={(open) => {
                setCreateProjectOpen(open);
                if (!open) setEditingProjectId(null);
              }}
              project={editingProject}
              onSave={handleSaveProject}
            />
            <Button
              onClick={() => {
                setEditingProjectId(null);
                setCreateProjectOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              {t("projects.newProject")}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 animate-fade-in animation-delay-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("projects.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-secondary/50"
              />
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-32 bg-secondary/50">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("projects.year")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.allTime")}</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Projects Table */}
        <div className="glass-card overflow-hidden animate-fade-in animation-delay-200">
          <div className="overflow-x-auto" style={{ maxHeight: filteredProjects.length > 8 ? '32rem' : 'none', overflowY: filteredProjects.length > 8 ? 'scroll' : 'visible' }}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t("projects.selectAll")}
                    />
                  </TableHead>

                  <TableHead className="text-foreground font-semibold whitespace-nowrap">{t("projects.tableProject")}</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap hidden sm:table-cell">{t("projects.tableCompany")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("projects.tableTrips")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("projects.tableInvoices")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("projects.tableDocuments")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden md:table-cell">{t("projects.tableCo2")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("projects.tableCost")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden md:table-cell">{t("projects.tableTotalKm")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProjects.map((project, index) => (
                  (() => {
                    const stats = statsByProjectKey.get(getProjectKey(project.name)) ?? null;
                    const tripsCount = stats?.trips ?? 0;
                    const totalKm = stats?.totalKm ?? 0;
                    const documents = stats?.documents ?? 0;
                    const invoices = stats?.invoices ?? 0;
                    const estimatedCost =
                      (stats?.overrideCost ?? 0) + (stats?.distanceAtDefaultRate ?? 0) * (Number.isFinite(project.ratePerKm) ? project.ratePerKm : 0);

                    return (
                      <TableRow
                        key={project.id}
                        className={`hover:bg-secondary/30 border-border/30 animate-slide-up cursor-pointer ${selectedIds.has(project.id) ? 'bg-primary/10' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        role="button"
                        tabIndex={0}
                        onClick={() => openProjectDetails(project)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openProjectDetails(project);
                          }
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(project.id)}
                            onCheckedChange={() => toggleSelect(project.id)}
                            aria-label={tf("projects.selectProject", { name: project.name })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(project.id);
                              }}
                              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                            >
                              {project.starred ? (
                                <Star className="w-4 h-4 text-warning fill-warning" />
                              ) : (
                                <StarOff className="w-4 h-4" />
                              )}
                            </button>
                            <span className="font-medium">{project.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">
                          {project.producer || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Car className="w-4 h-4 text-primary" />
                            <span>{tripsCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <div className="flex items-center justify-end gap-1.5">
                            <Receipt className="w-4 h-4 text-warning" />
                            <span>{invoices}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <div className="flex items-center justify-end gap-1.5">
                            <FileText className="w-4 h-4 text-info" />
                            <span>{documents}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell text-success">
                          {(stats?.co2Emissions ?? 0).toFixed(1)} kg
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5 text-success font-medium">
                            <Euro className="w-4 h-4" />
                            <span>€{estimatedCost.toFixed(2)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium hidden md:table-cell">
                          {totalKm.toLocaleString(locale)} km
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                openProjectDetails(project);
                              }}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t("projects.viewDetails")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditProject(project);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                {t("projects.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => e.stopPropagation()}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  void handleDeleteProject(project);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("projects.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })()
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* Load More Button */}
          {hasMoreProjects && (
            <div className="p-4 border-t border-border/50">
              <button
                onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
                className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium py-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <ChevronsDown className="w-4 h-4" />
                {t("trips.loadMore")} ({remainingCount} {t("advancedCosts.remaining")})
              </button>
            </div>
          )}
        </div>

        {/* Empty state */}
        {filteredProjects.length === 0 && (
          <div className="glass-card p-12 text-center animate-fade-in">
            <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("projects.emptyTitle")}</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? t("projects.emptyTryAdjust")
                : t("projects.emptyCreateFirst")}
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {tf("projects.summaryCount", { count: filteredProjects.length })}
            </span>
            <span className="font-medium">
              {tf("projects.summaryTotal", { km: filteredProjects.reduce((acc, p) => {
                const stats = statsByProjectKey.get(getProjectKey(p.name));
                return acc + (stats?.totalKm ?? 0);
              }, 0).toLocaleString(locale) })}
            </span>
          </div>
        </div>

        {/* Project Detail Modal */}
        <ProjectDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          project={selectedProject && selectedProjectStats ? {
            id: selectedProject.id,
            name: selectedProject.name,
            totalKm: selectedProjectStats.totalKm ?? 0,
            shootingDays: selectedProjectStats.shootingDays ?? 0,
            kmPerDay: selectedProjectStats.kmPerDay ?? 0,
            co2Emissions: selectedProjectStats.co2Emissions ?? 0,
            callSheets: selectedProjectStats.callSheetDocs ?? [],
            invoices: selectedProjectStats.invoiceDocs ?? [],
            totalInvoiced: selectedProjectStats.overrideCost ? selectedProjectStats.overrideCost : (selectedProjectStats.distanceAtDefaultRate ?? 0) * 0.45,
          } : null}
        />
      </div>
    </MainLayout>
  );
}
