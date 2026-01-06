// Script para limpiar datos de ejemplo del localStorage
// Ejecuta este script en la consola del navegador (F12)

(function cleanupDemoData() {
  console.log('🧹 Iniciando limpieza de datos de ejemplo...');
  
  // Lista de proyectos de ejemplo a eliminar
  const demoProjects = [
    'Event Z',
    'Internal',
    'Client ABC',
    'Film Production XY',
    'casa'
  ];
  
  // Limpiar proyectos
  const projectsRaw = localStorage.getItem('projects');
  if (projectsRaw) {
    try {
      const projects = JSON.parse(projectsRaw);
      const filteredProjects = projects.filter(p => !demoProjects.includes(p.name));
      
      if (filteredProjects.length !== projects.length) {
        localStorage.setItem('projects', JSON.stringify(filteredProjects));
        console.log(`✅ Eliminados ${projects.length - filteredProjects.length} proyectos de ejemplo`);
      } else {
        console.log('ℹ️ No se encontraron proyectos de ejemplo');
      }
    } catch (e) {
      console.error('❌ Error al procesar proyectos:', e);
    }
  }
  
  // Limpiar viajes asociados a esos proyectos
  const tripsRaw = localStorage.getItem('trips');
  if (tripsRaw) {
    try {
      const trips = JSON.parse(tripsRaw);
      const filteredTrips = trips.filter(t => !demoProjects.includes(t.project));
      
      if (filteredTrips.length !== trips.length) {
        localStorage.setItem('trips', JSON.stringify(filteredTrips));
        console.log(`✅ Eliminados ${trips.length - filteredTrips.length} viajes de ejemplo`);
      } else {
        console.log('ℹ️ No se encontraron viajes de ejemplo');
      }
    } catch (e) {
      console.error('❌ Error al procesar viajes:', e);
    }
  }
  
  // Limpiar informes asociados
  const reportsRaw = localStorage.getItem('reports');
  if (reportsRaw) {
    try {
      const reports = JSON.parse(reportsRaw);
      const filteredReports = reports.filter(r => r.project === 'all' || !demoProjects.includes(r.project));
      
      if (filteredReports.length !== reports.length) {
        localStorage.setItem('reports', JSON.stringify(filteredReports));
        console.log(`✅ Eliminados ${reports.length - filteredReports.length} informes de ejemplo`);
      } else {
        console.log('ℹ️ No se encontraron informes de ejemplo');
      }
    } catch (e) {
      console.error('❌ Error al procesar informes:', e);
    }
  }
  
  // Resetear flag de migración para forzar verificación
  localStorage.removeItem('migration-completed-v1');
  console.log('✅ Flag de migración reseteado');
  
  console.log('');
  console.log('✨ Limpieza completada. Recarga la página (F5) para ver los cambios.');
  console.log('');
  console.log('📝 Si quieres hacer una limpieza COMPLETA (recomendado), ejecuta:');
  console.log('   localStorage.clear()');
  console.log('   (Nota: Tendrás que volver a iniciar sesión)');
})();
