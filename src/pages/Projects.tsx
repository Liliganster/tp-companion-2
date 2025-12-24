import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { Project, useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { useI18n } from "@/hooks/use-i18n";
import { uuidv4 } from "@/lib/utils";

export default function Projects() {
  const { t, tf, locale } = useI18n();

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
      return { searchQuery, selectedYear };
    } catch {
      return null;
    }
  };

  const [searchQuery, setSearchQuery] = useState(() => loadProjectsFilters()?.searchQuery ?? "");
  const [selectedYear, setSelectedYear] = useState(() => loadProjectsFilters()?.selectedYear ?? "2024");
  const { projects, addProject, deleteProject, toggleStar } = useProjects();
  const { trips } = useTrips();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { toast } = useToast();

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectProducer, setNewProjectProducer] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectRatePerKm, setNewProjectRatePerKm] = useState("0.30");
  const [newProjectRatePerPassenger, setNewProjectRatePerPassenger] = useState("0.05");

  const getProjectKey = (name: string) => name.trim().toLowerCase();

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
  };

  // Fetch document counts for projects
  const [projectDocCounts, setProjectDocCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECTS_FILTERS_KEY, JSON.stringify({ searchQuery, selectedYear }));
    } catch {
      // ignore
    }
  }, [searchQuery, selectedYear]);

  useEffect(() => {
    const fetchCounts = async () => {
        const counts: Record<string, number> = {};
        
        // 1. Count CallSheets (Jobs) by project_id
        const { data: jobs } = await supabase.from("callsheet_jobs").select("project_id").not("project_id", "is", null);
        jobs?.forEach((job: any) => {
             const pid = job.project_id;
             if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });
        
        // 2. Count Project Invoices by project_id
        const { data: invoices } = await supabase.from("project_documents").select("project_id");
        invoices?.forEach((inv: any) => {
             const pid = inv.project_id;
             if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });

        // 3. Count Results by project_value (Name linking)
        if (projects.length > 0) {
             const idToKey = new Map<string, string>();
             projects.forEach(p => idToKey.set(p.id, getProjectKey(p.name)));
             
             // Map existing ID counts to Keys
             const keyCounts: Record<string, number> = {};
             // Transfer ID counts to NAME keys for statsByProjectKey
             for (const [pid, count] of Object.entries(counts)) {
                 const key = idToKey.get(pid);
                 if (key) {
                     keyCounts[key] = (keyCounts[key] || 0) + count;
                 }
             }

             const { data: results } = await supabase.from("callsheet_results").select("project_value, job_id, callsheet_jobs!inner(project_id)");
             
             results?.forEach((res: any) => {
                 if (!res.callsheet_jobs?.project_id) {
                     const key = getProjectKey(res.project_value);
                     keyCounts[key] = (keyCounts[key] || 0) + 1;
                 }
             });
             
             setProjectDocCounts(keyCounts);
        }
    };
    
    fetchCounts();
  }, [projects]);


  const statsByProjectKey = useMemo(() => {
    const map = new Map<string, AggregatedTripStats>();

    for (const trip of trips) {
      const key = getProjectKey(trip.project ?? "");
      if (!key) continue;

      const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
      const documents = trip.documents?.length ?? 0;
      const invoices = trip.invoice?.trim() ? 1 : 0;
      const co2 = Number.isFinite(trip.co2) ? trip.co2 : 0;

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
      };

      current.trips += 1;
      current.totalKm += distance;
      current.documents += documents;
      current.invoices += invoices;
      current.co2Emissions += co2;
      
      // Aggregate invoice documents (Trip Invoices)
      if (trip.invoice && trip.invoice.trim() !== "") {
           current.invoiceDocs.push({
               id: `${trip.id}-invoice`,
               name: `Factura ${trip.id}`,
               type: "invoice",
               storage_path: trip.invoice
           });
      }

      // Aggregate CallSheets (Trip Documents)
      if (trip.documents && trip.documents.length > 0) {
        trip.documents.forEach(doc => {
          current.callSheetDocs.push({
             id: doc.id,
             name: doc.name,
             type: "call-sheet"
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
    
    // Inject doc counts
    for (const [key, count] of Object.entries(projectDocCounts)) {
        const current = map.get(key) ?? {
            trips: 0,
            totalKm: 0,
            documents: 0, // Base documents from trips
            invoices: 0,
            co2Emissions: 0,
            overrideCost: 0,
            distanceAtDefaultRate: 0,
            invoiceDocs: [],
            callSheetDocs: [],
        };
        current.documents += count; // Add callsheets to documents count
        map.set(key, current);
    }

    return map;
  }, [trips, projectDocCounts]);




  const openProjectDetails = (project: Project) => {
    setSelectedProject(project);
    setDetailModalOpen(true);
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.producer?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProjectStats = useMemo(() => {
    if (!selectedProject) return null;
    const baseStats = statsByProjectKey.get(getProjectKey(selectedProject.name));
    if (!baseStats) return null;

    // Calculate shooting days from trips
    const projectTrips = trips.filter((t) => getProjectKey(t.project ?? "") === getProjectKey(selectedProject.name));
    const uniqueDates = new Set(projectTrips.map((t) => t.date).filter(Boolean));
    const shootingDays = uniqueDates.size;
    const kmPerDay = shootingDays > 0 ? baseStats.totalKm / shootingDays : 0;

    return {
      ...baseStats,
      shootingDays,
      kmPerDay,
    };
  }, [selectedProject, statsByProjectKey, trips, getProjectKey]);

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

  const resetCreateProjectForm = () => {
    setNewProjectName("");
    setNewProjectProducer("");
    setNewProjectDescription("");
    setNewProjectRatePerKm("0.30");
    setNewProjectRatePerPassenger("0.05");
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      toast({
        title: t("projects.createNewProject"),
        description: t("projects.projectName") + " es obligatorio",
        variant: "destructive",
      });
      return;
    }

    const exists = projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      toast({
        title: t("projects.createNewProject"),
        description: "Ya existe un proyecto con ese nombre",
        variant: "destructive",
      });
      return;
    }

    const ratePerKm = Number.parseFloat(String(newProjectRatePerKm).replace(",", "."));
    const normalizedRatePerKm = Number.isFinite(ratePerKm) ? ratePerKm : 0;

    // NOTE: rate per passenger is not stored in `projects` table currently.
    // Keep the input for now, but don't persist it.
    void newProjectRatePerPassenger;

    await addProject({
      id: uuidv4(),
      name,
      producer: newProjectProducer.trim() || undefined,
      description: newProjectDescription.trim() || undefined,
      ratePerKm: normalizedRatePerKm,
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
    });

    toast({
      title: t("projects.createProject"),
      description: "Proyecto creado",
    });

    setCreateProjectOpen(false);
    resetCreateProjectForm();
  };

  const isAllSelected = filteredProjects.length > 0 && selectedIds.size === filteredProjects.length;
  const isSomeSelected = selectedIds.size > 0;

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
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
            <Dialog
              open={createProjectOpen}
              onOpenChange={(open) => {
                setCreateProjectOpen(open);
                if (!open) resetCreateProjectForm();
              }}
            >
              <Button onClick={() => setCreateProjectOpen(true)}>
                <Plus className="w-4 h-4" />
                {t("projects.newProject")}
              </Button>
              <DialogContent className="glass max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("projects.createNewProject")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("projects.projectName")}</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Film Production XY"
                      className="bg-secondary/50"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="producer">{t("projects.company")}</Label>
                    <Input
                      id="producer"
                      placeholder={t("projects.companyPlaceholder")}
                      className="bg-secondary/50"
                      value={newProjectProducer}
                      onChange={(e) => setNewProjectProducer(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">{t("projects.description")}</Label>
                    <Textarea
                      id="description"
                      placeholder={t("projects.descriptionPlaceholder")}
                      className="bg-secondary/50 resize-none"
                      value={newProjectDescription}
                      onChange={(e) => setNewProjectDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="rate">{t("projects.ratePerKm")}</Label>
                      <Input
                        id="rate"
                        type="number"
                        step="0.01"
                        placeholder="0.30"
                        className="bg-secondary/50"
                        value={newProjectRatePerKm}
                        onChange={(e) => setNewProjectRatePerKm(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ratePassenger">{t("projects.ratePerPassenger")}</Label>
                      <Input
                        id="ratePassenger"
                        type="number"
                        step="0.01"
                        placeholder="0.05"
                        className="bg-secondary/50"
                        value={newProjectRatePerPassenger}
                        onChange={(e) => setNewProjectRatePerPassenger(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button className="w-full mt-2" onClick={handleCreateProject}>
                    {t("projects.createProject")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Projects Table */}
        <div className="glass-card overflow-hidden animate-fade-in animation-delay-200">
          <div className={filteredProjects.length > 8 ? "overflow-x-auto overflow-y-auto max-h-[32rem]" : "overflow-x-auto"}>
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
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden md:table-cell">{t("projects.tableTotalKm")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("projects.tableDocuments")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("projects.tableInvoices")}</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("projects.tableCost")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project, index) => (
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
                    <TableCell className="text-right font-medium hidden md:table-cell">
                      {totalKm.toLocaleString(locale)} km
                    </TableCell>
	                    <TableCell className="text-right hidden lg:table-cell">
	                      <div className="flex items-center justify-end gap-1.5">
	                        <FileText className="w-4 h-4 text-info" />
	                        <span>{documents}</span>
	                      </div>
	                    </TableCell>
	                    <TableCell className="text-right hidden lg:table-cell">
	                      <div className="flex items-center justify-end gap-1.5">
	                        <Receipt className="w-4 h-4 text-warning" />
	                        <span>{invoices}</span>
	                      </div>
	                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 text-success font-medium">
                        <Euro className="w-4 h-4" />
							<span>€{estimatedCost.toFixed(2)}</span>
                      </div>
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
                          <DropdownMenuItem onClick={() => {
                            openProjectDetails(project);
                          }}>
                            <Eye className="w-4 h-4 mr-2" />
                            {t("projects.viewDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t("projects.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
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
            totalKm: selectedProjectStats.totalKm,
            shootingDays: selectedProjectStats.shootingDays,
            kmPerDay: selectedProjectStats.kmPerDay,
            co2Emissions: selectedProjectStats.co2Emissions,
            callSheets: selectedProjectStats.callSheetDocs ?? [],
            invoices: selectedProjectStats.invoiceDocs ?? [],
            totalInvoiced: selectedProjectStats.overrideCost ? selectedProjectStats.overrideCost : (selectedProjectStats.distanceAtDefaultRate ?? 0) * 0.45,
          } : null}
        />
      </div>
    </MainLayout>
  );
}
