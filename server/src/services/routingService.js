const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

/**
 * Calcula la distancia en metros entre dos coordenadas GPS mediante la fórmula de Haversine.
 */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(Number(lat1))) *
      Math.cos(toRad(Number(lat2))) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Algoritmo TSP (Vecino más cercano + mejora 2-opt) para ordenar los puntos de recolección
 * minimizando la distancia total de recorrido.
 */
function optimizePointsOrderTSP(points, startPoint = null) {
  if (!Array.isArray(points) || points.length <= 1) {
    return points || [];
  }

  const remaining = [...points];
  const ordered = [];

  let currentLat = startPoint && startPoint.latitud != null ? Number(startPoint.latitud) : null;
  let currentLng = startPoint && startPoint.longitud != null ? Number(startPoint.longitud) : null;

  if (currentLat == null || currentLng == null) {
    // Empezar por el punto más al norte-oeste como ancla determinista
    remaining.sort((a, b) => Number(b.latitud) - Number(a.latitud));
    const first = remaining.shift();
    ordered.push(first);
    currentLat = Number(first.latitud);
    currentLng = Number(first.longitud);
  }

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistanceMeters(
        currentLat,
        currentLng,
        remaining[i].latitud,
        remaining[i].longitud
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const nextPt = remaining.splice(bestIdx, 1)[0];
    ordered.push(nextPt);
    currentLat = Number(nextPt.latitud);
    currentLng = Number(nextPt.longitud);
  }

  // Optimización local 2-opt para desarmar cruces en la ruta
  if (ordered.length >= 4) {
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 50) {
      improved = false;
      iterations++;
      for (let i = 0; i < ordered.length - 2; i++) {
        for (let k = i + 2; k < ordered.length - 1; k++) {
          const d1 =
            haversineDistanceMeters(
              ordered[i].latitud,
              ordered[i].longitud,
              ordered[i + 1].latitud,
              ordered[i + 1].longitud
            ) +
            haversineDistanceMeters(
              ordered[k].latitud,
              ordered[k].longitud,
              ordered[k + 1].latitud,
              ordered[k + 1].longitud
            );
          const d2 =
            haversineDistanceMeters(
              ordered[i].latitud,
              ordered[i].longitud,
              ordered[k].latitud,
              ordered[k].longitud
            ) +
            haversineDistanceMeters(
              ordered[i + 1].latitud,
              ordered[i + 1].longitud,
              ordered[k + 1].latitud,
              ordered[k + 1].longitud
            );
          if (d2 + 1 < d1) {
            const reversed = ordered.slice(i + 1, k + 1).reverse();
            ordered.splice(i + 1, k - i, ...reversed);
            improved = true;
          }
        }
      }
    }
  }

  return ordered;
}

/**
 * Consulta OSRM para obtener la polilínea real por calles (GeoJSON), distancia y duración.
 * Si el servicio externo no responde o hay 1 solo punto, genera un fallback limpio.
 */
async function fetchOsrmRouteGeometry(orderedPoints, startCoords = null) {
  const waypoints = [];
  if (startCoords && startCoords.latitud != null && startCoords.longitud != null) {
    waypoints.push({ latitud: Number(startCoords.latitud), longitud: Number(startCoords.longitud) });
  }
  for (const p of orderedPoints) {
    waypoints.push({ latitud: Number(p.latitud), longitud: Number(p.longitud) });
  }

  if (waypoints.length < 2) {
    return {
      distancia_total_m: 0,
      duracion_estimada_s: 0,
      geometria_geojson: {
        type: 'LineString',
        coordinates: waypoints.map((w) => [w.longitud, w.latitud]),
      },
    };
  }

  const coordsString = waypoints.map((w) => `${w.longitud},${w.latitud}`).join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        return {
          distancia_total_m: Math.round(data.routes[0].distance),
          duracion_estimada_s: Math.round(data.routes[0].duration),
          geometria_geojson: data.routes[0].geometry,
        };
      }
    }
  } catch (err) {
    // Fallback geométrico si OSRM está sin conexión
  }

  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDist += haversineDistanceMeters(
      waypoints[i].latitud,
      waypoints[i].longitud,
      waypoints[i + 1].latitud,
      waypoints[i + 1].longitud
    );
  }
  // Factor de corrección vial ~1.28x y velocidad urbana promedio 25 km/h (6.94 m/s)
  const roadDist = Math.round(totalDist * 1.28);
  const durationSec = Math.round(roadDist / 6.94);

  return {
    distancia_total_m: roadDist,
    duracion_estimada_s: durationSec,
    geometria_geojson: {
      type: 'LineString',
      coordinates: waypoints.map((w) => [w.longitud, w.latitud]),
    },
  };
}

/**
 * Reparte automáticamente un conjunto de puntos entre K recolectores mediante
 * Clustering Geográfico Balanceado (K-Means con cupo equitativo) y optimiza cada ruta.
 */
async function distributePointsBalancedKMeans(points, collectors) {
  if (!collectors || collectors.length === 0) {
    throw new Error('Se requiere al menos un recolector habilitado para repartir puntos.');
  }
  if (!points || points.length === 0) {
    return [];
  }

  const k = Math.min(collectors.length, points.length);
  const activeCollectors = collectors.slice(0, k);

  // Inicialización K-Means++ simplificada para elegir centroides bien separados
  const centroids = [];
  const sortedByLat = [...points].sort((a, b) => Number(a.latitud) - Number(b.latitud));
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i * sortedByLat.length) / k);
    centroids.push({
      lat: Number(sortedByLat[idx].latitud),
      lng: Number(sortedByLat[idx].longitud),
    });
  }

  let clusters = Array.from({ length: k }, () => []);
  const maxQuota = Math.ceil(points.length / k);

  for (let iter = 0; iter < 12; iter++) {
    clusters = Array.from({ length: k }, () => []);

    // Ordenar puntos según su distancia a su centroide más cercano para asignación balanceada
    const pointDistances = points.map((pt) => {
      const dists = centroids.map((c, cIdx) => ({
        cIdx,
        dist: haversineDistanceMeters(pt.latitud, pt.longitud, c.lat, c.lng),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      return { pt, dists };
    });

    // Priorizar puntos con mayor diferencia entre su mejor y segunda mejor opción
    pointDistances.sort((a, b) => {
      const diffA = (a.dists[1]?.dist || 0) - a.dists[0].dist;
      const diffB = (b.dists[1]?.dist || 0) - b.dists[0].dist;
      return diffB - diffA;
    });

    for (const item of pointDistances) {
      let assigned = false;
      for (const candidate of item.dists) {
        if (clusters[candidate.cIdx].length < maxQuota) {
          clusters[candidate.cIdx].push(item.pt);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        clusters[0].push(item.pt);
      }
    }

    // Recalcular centroides
    for (let cIdx = 0; cIdx < k; cIdx++) {
      if (clusters[cIdx].length > 0) {
        const sumLat = clusters[cIdx].reduce((acc, p) => acc + Number(p.latitud), 0);
        const sumLng = clusters[cIdx].reduce((acc, p) => acc + Number(p.longitud), 0);
        centroids[cIdx] = {
          lat: sumLat / clusters[cIdx].length,
          lng: sumLng / clusters[cIdx].length,
        };
      }
    }
  }

  // Construir y optimizar cada ruta asignada
  const assignments = [];
  for (let i = 0; i < k; i++) {
    const collector = activeCollectors[i];
    const startCoords =
      collector.ultima_lat != null && collector.ultima_lng != null
        ? { latitud: collector.ultima_lat, longitud: collector.ultima_lng }
        : null;

    const orderedPoints = optimizePointsOrderTSP(clusters[i], startCoords);
    const routeMeta = await fetchOsrmRouteGeometry(orderedPoints, startCoords);

    assignments.push({
      recolector: collector,
      puntos: orderedPoints,
      ...routeMeta,
    });
  }

  return assignments;
}

/**
 * Geocodifica una dirección de texto usando Nominatim (OpenStreetMap).
 */
async function geocodeAddress(addressText) {
  try {
    const url = `${NOMINATIM_BASE_URL}/search?format=json&limit=1&q=${encodeURIComponent(addressText)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RSUManagerApp/1.0 (soporte@rsu.com.ar)',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitud: Number(data[0].lat),
          longitud: Number(data[0].lon),
          display_name: data[0].display_name,
        };
      }
    }
  } catch (err) {
    // Fallback silencioso
  }
  return null;
}

module.exports = {
  haversineDistanceMeters,
  optimizePointsOrderTSP,
  fetchOsrmRouteGeometry,
  distributePointsBalancedKMeans,
  geocodeAddress,
};

