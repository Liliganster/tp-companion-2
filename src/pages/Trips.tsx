import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter, Upload, Calendar, MoreVertical, Pencil, Trash2, Map, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AddTripModal } from "@/components/trips/AddTripModal";
import { BulkUploadModal } from "@/components/trips/BulkUploadModal";
import { TripDetailModal } from "@/components/trips/TripDetailModal";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber, roundTo } from "@/lib/number";
interface Trip {
  id: string;
  date: string;
  route: string[];
  project: string;
  purpose: string;
  passengers: number;
  warnings?: string[];
  co2: number;
  distance: number;
  ratePerKmOverride?: number | null;
}
const calculateCO2 = (distance: number) => Math.round(distance * 0.12 * 10) / 10;
const mockTripsData: Trip[] = [{
  id: "1",
  date: "2024-01-15",
  route: ["Berlin HQ", "Leipzig", "München Studio"],
  project: "Film Production XY",
  purpose: "Location scouting",
  passengers: 2,
  distance: 584,
  co2: calculateCO2(584),
}, {
  id: "2",
  date: "2024-01-14",
  route: ["München Studio", "Nürnberg", "Frankfurt", "Köln Location"],
  project: "Film Production XY",
  purpose: "Equipment transport",
  passengers: 0,
  distance: 575,
  co2: calculateCO2(575),
}, {
  id: "3",
  date: "2024-01-13",
  route: ["Home Office", "Berlin HQ"],
  project: "Internal",
  purpose: "Office meeting",
  passengers: 0,
  distance: 45,
  co2: calculateCO2(45),
}, {
  id: "4",
  date: "2024-01-12",
  route: ["Berlin HQ", "Hannover", "Hamburg Meeting"],
  project: "Client ABC",
  purpose: "Client presentation",
  passengers: 1,
  warnings: ["Unusual distance"],
  distance: 289,
  co2: calculateCO2(289),
}, {
  id: "5",
  date: "2024-01-11",
  route: ["Hamburg Meeting", "Berlin HQ"],
  project: "Client ABC",
  purpose: "Return trip",
  passengers: 0,
  distance: 289,
  co2: calculateCO2(289),
}];
export default function Trips() {
  const { profile } = useUserProfile();
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedYear, setSelectedYear] = useState("2024");
  const [trips, setTrips] = useState<Trip[]>(mockTripsData);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null);
  const {
    toast
  } = useToast();
  const handleViewMap = (trip: Trip) => {
    setSelectedTrip(trip);
    setDetailModalOpen(true);
  };
  const handleEditTrip = (trip: Trip) => {
    setTripToEdit(trip);
    setEditModalOpen(true);
  };
  const handleAddToCalendar = (trip: Trip) => {
    toast({
      title: "Added to calendar",
      description: `Trip to ${trip.route[trip.route.length - 1]} on ${new Date(trip.date).toLocaleDateString("de-DE")} added to calendar.`
    });
  };

  const settingsRatePerKm = parseLocaleNumber(profile.ratePerKm) ?? 0;
  const settingsPassengerSurchargePerKm = parseLocaleNumber(profile.passengerSurcharge) ?? 0;

  const calculateTripReimbursement = (trip: Trip) => {
    const baseRate = trip.ratePerKmOverride ?? settingsRatePerKm;
    return roundTo(trip.distance * baseRate + trip.distance * trip.passengers * settingsPassengerSurchargePerKm, 2);
  };

  type SavedTrip = {
    id: string;
    date: string;
    route: string[];
    project: string;
    purpose: string;
    passengers: number;
    distance: number;
    ratePerKmOverride?: number | null;
  };

  const handleSaveTrip = (data: SavedTrip) => {
    setTrips((prev) => {
      const nextTrip: Trip = {
        id: data.id,
        date: data.date,
        route: data.route,
        project: data.project,
        purpose: data.purpose,
        passengers: data.passengers,
        distance: data.distance,
        co2: calculateCO2(data.distance),
        ratePerKmOverride: data.ratePerKmOverride ?? null,
      };

      const exists = prev.some((t) => t.id === data.id);
      return exists ? prev.map((t) => (t.id === data.id ? { ...t, ...nextTrip } : t)) : [nextTrip, ...prev];
    });
  };
  const filteredTrips = trips.filter(trip => {
    const matchesProject = selectedProject === "all" || trip.project === selectedProject;
    return matchesProject;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTrips.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTrips.map(t => t.id)));
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
    setTrips(prev => prev.filter(t => !selectedIds.has(t.id)));
    toast({
      title: "Trips deleted",
      description: `${selectedIds.size} trip(s) have been deleted.`
    });
    setSelectedIds(new Set());
  };
  const isAllSelected = filteredTrips.length > 0 && selectedIds.size === filteredTrips.length;
  const isSomeSelected = selectedIds.size > 0;
  return <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Trips
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and track all your business trips
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSomeSelected && <Button variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
              </Button>}
            <BulkUploadModal trigger={<Button variant="upload">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Bulk Upload</span>
                </Button>} />
            <AddTripModal trigger={<Button>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Trip</span>
                </Button>} onSave={handleSaveTrip} />
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 animate-fade-in animation-delay-100">
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-full sm:w-48 bg-secondary/50">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="Film Production XY">Film Production XY</SelectItem>
                <SelectItem value="Client ABC">Client ABC</SelectItem>
                <SelectItem value="Internal">Internal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-32 bg-secondary/50">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mobile & Tablet Cards View */}
        <div className="lg:hidden space-y-3 animate-fade-in animation-delay-200">
          {filteredTrips.map((trip, index) => <div key={trip.id} className={`glass-card p-3 sm:p-4 animate-slide-up ${selectedIds.has(trip.id) ? 'ring-2 ring-primary' : ''}`} style={{
          animationDelay: `${index * 50}ms`
        }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                  <Checkbox checked={selectedIds.has(trip.id)} onCheckedChange={() => toggleSelect(trip.id)} aria-label={`Select trip ${trip.id}`} className="mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* Date and Project */}
                    <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2 mb-2">
                      <span className="text-sm sm:text-base font-medium shrink-0">
                        {new Date(trip.date).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric"
                    })}
                      </span>
                      <span className="text-[10px] sm:text-xs text-primary truncate max-w-[150px] sm:max-w-none">
                        {trip.project}
                      </span>
                    </div>
                    
                    {/* Route - Better tablet layout */}
                    <div className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-foreground">{trip.route[0]}</span>
                        <span className="text-primary">→</span>
                        {trip.route.length > 2 && <span className="hidden md:inline text-muted-foreground">
                            {trip.route.slice(1, -1).join(" → ")} →
                          </span>}
                        <span className="font-medium text-foreground">{trip.route[trip.route.length - 1]}</span>
                        {trip.route.length > 2 && <span className="md:hidden text-[10px] sm:text-xs text-muted-foreground ml-1">(+{trip.route.length - 2})</span>}
                      </div>
                    </div>

                    {/* Stats Grid - Better responsive grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 sm:gap-2 text-xs sm:text-sm">
                      <div className="flex justify-between md:flex-col md:gap-0.5">
                        <span className="text-muted-foreground">Distancia:</span>
                        <span className="font-medium">{trip.distance} km</span>
                      </div>
                      <div className="flex justify-between md:flex-col md:gap-0.5">
                        <span className="text-muted-foreground text-center">CO₂:</span>
                        <span className="text-emerald-500 font-medium text-center">{trip.co2} kg</span>
                      </div>
                      <div className="flex justify-between md:flex-col md:gap-0.5">
                        <span className="text-muted-foreground text-center">Reembolso:</span>
                        <span className="text-primary font-medium text-center">{calculateTripReimbursement(trip).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between md:flex-col md:gap-0.5">
                        <span className="text-muted-foreground text-center">Pasajeros:</span>
                        <span className="font-medium text-center">{trip.passengers || "-"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0">
                      <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={() => handleViewMap(trip)}>
                      <Map className="w-4 h-4 mr-2" />
                      View Map
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddToCalendar(trip)}>
                      <CalendarPlus className="w-4 h-4 mr-2" />
                      Add to Calendar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEditTrip(trip)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>)}
        </div>

        {/* Desktop Table View - Only on large screens */}
        <div className="hidden lg:block glass-card overflow-hidden animate-fade-in animation-delay-200">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-10">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap">Route</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap">Project</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">CO₂</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">Passengers</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">Reimbursement</TableHead>
                  <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">Distance</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrips.map((trip, index) => <TableRow key={trip.id} className={`hover:bg-secondary/30 border-border/30 animate-slide-up ${selectedIds.has(trip.id) ? 'bg-primary/10' : ''}`} style={{
                animationDelay: `${index * 50}ms`
              }}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(trip.id)} onCheckedChange={() => toggleSelect(trip.id)} aria-label={`Select trip ${trip.id}`} />
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {new Date(trip.date).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                  })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {trip.route.map((stop, i) => <span key={i} className="flex items-center">
                            <span className={i === 0 || i === trip.route.length - 1 ? "font-medium" : "text-muted-foreground"}>
                              {stop}
                            </span>
                            {i < trip.route.length - 1 && <span className="mx-1 text-primary">→</span>}
                          </span>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-primary whitespace-nowrap">
                        {trip.project}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-emerald-500 whitespace-nowrap">{trip.co2} kg</TableCell>
                    <TableCell className="text-right text-muted-foreground hidden lg:table-cell">{trip.passengers || "-"}</TableCell>
                    <TableCell className="text-right text-primary font-medium whitespace-nowrap">{calculateTripReimbursement(trip).toFixed(2)} €</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{trip.distance} km</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => handleViewMap(trip)}>
                            <Map className="w-4 h-4 mr-2" />
                            View Map
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAddToCalendar(trip)}>
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Add to Calendar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditTrip(trip)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary */}
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {filteredTrips.length} trips
            </span>
            <span className="font-medium">
              Total: {filteredTrips.reduce((acc, trip) => acc + trip.distance, 0).toLocaleString()} km
            </span>
          </div>
        </div>

        {/* Trip Detail Modal */}
        <TripDetailModal trip={selectedTrip} open={detailModalOpen} onOpenChange={setDetailModalOpen} />
        
        {/* Edit Trip Modal */}
        <AddTripModal 
          trip={tripToEdit} 
          open={editModalOpen} 
          onOpenChange={setEditModalOpen} 
          onSave={handleSaveTrip}
        />
      </div>
    </MainLayout>;
}
