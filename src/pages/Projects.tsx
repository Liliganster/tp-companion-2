import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useI18n } from "@/hooks/use-i18n";

export default function Projects() {
  const { t, tf, locale } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("2024");
  const { projects, setProjects, toggleStar } = useProjects();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { toast } = useToast();

  const openProjectDetails = (project: Project) => {
    setSelectedProject(project);
    setDetailModalOpen(true);
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.producer?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const handleDeleteSelected = () => {
    setProjects(prev => prev.filter(p => !selectedIds.has(p.id)));
    toast({
      title: t("projects.toastDeletedTitle"),
      description: tf("projects.toastDeletedBody", { count: selectedIds.size }),
    });
    setSelectedIds(new Set());
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
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4" />
                  {t("projects.newProject")}
                </Button>
              </DialogTrigger>
              <DialogContent className="glass max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("projects.createNewProject")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("projects.projectName")}</Label>
                    <Input id="name" placeholder="e.g., Film Production XY" className="bg-secondary/50" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="producer">{t("projects.company")}</Label>
                    <Input id="producer" placeholder={t("projects.companyPlaceholder")} className="bg-secondary/50" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">{t("projects.description")}</Label>
                    <Textarea
                      id="description"
                      placeholder={t("projects.descriptionPlaceholder")}
                      className="bg-secondary/50 resize-none"
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
                      />
                    </div>
                  </div>
                  <Button className="w-full mt-2">{t("projects.createProject")}</Button>
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
          <div className="overflow-x-auto">
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
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("projects.tableCost")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project, index) => (
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
                        <span>{project.trips}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium hidden md:table-cell">
                      {project.totalKm.toLocaleString()} km
                    </TableCell>
                    <TableCell className="text-right hidden lg:table-cell">
                      <div className="flex items-center justify-end gap-1.5">
                        <FileText className="w-4 h-4 text-info" />
                        <span>{project.documents}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 text-success font-medium">
                        <Euro className="w-4 h-4" />
                        <span>€{project.estimatedCost.toFixed(2)}</span>
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
              {tf("projects.summaryTotal", { km: filteredProjects.reduce((acc, p) => acc + p.totalKm, 0).toLocaleString(locale) })}
            </span>
          </div>
        </div>

        {/* Project Detail Modal */}
        <ProjectDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          project={selectedProject ? {
            id: selectedProject.id,
            name: selectedProject.name,
            totalKm: selectedProject.totalKm,
            shootingDays: selectedProject.shootingDays,
            kmPerDay: selectedProject.kmPerDay,
            co2Emissions: selectedProject.co2Emissions,
            callSheets: [
              { id: "1", name: "FUNDBOX_Dispo DT 4.pdf", type: "call-sheet" },
              { id: "2", name: "FUNDBOX_Dispo DT 4.pdf", type: "call-sheet" },
              { id: "3", name: "FUNDBOX_Dispo DT 4.pdf", type: "call-sheet" },
              { id: "4", name: "FUNDBOX_Dispo DT 4.pdf", type: "call-sheet" },
              { id: "5", name: "FUNDBOX_Dispo DT 4.pdf", type: "call-sheet" },
            ],
            invoices: [],
            totalInvoiced: 0,
          } : null}
        />
      </div>
    </MainLayout>
  );
}
