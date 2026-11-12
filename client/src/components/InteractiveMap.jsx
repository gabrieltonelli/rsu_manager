import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

const DEFAULT_LAT = Number(import.meta.env.VITE_DEFAULT_MAP_LAT || -34.6037);
const DEFAULT_LNG = Number(import.meta.env.VITE_DEFAULT_MAP_LNG || -58.3816);
const DEFAULT_ZOOM = Number(import.meta.env.VITE_DEFAULT_MAP_ZOOM || 13);
const TILE_URL =
  import.meta.env.VITE_OSM_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Crea un ícono SVG personalizado para distinguir puntos recolectados, pendientes,
 * recolectores en vivo o posición actual.
 */
export function createCustomIcon(color = '#059669', label = '') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 1C8.2 1 1 8.2 1 17c0 11.2 16 24 16 24s16-12.8 16-24C33 8.2 25.8 1 17 1z"
            fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
      <circle cx="17" cy="16" r="9" fill="#ffffff"/>
      <text x="17" y="20" text-anchor="middle" font-family="Inter, Arial, sans-serif"
            font-size="11" font-weight="700" fill="#0f172a">${label}</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'rsu-custom-marker',
    iconSize: [34, 42],
    iconAnchor: [17, 41],
    popupAnchor: [0, -36],
  });
}

function MapClickSelector({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick({
          latitud: Number(e.latlng.lat.toFixed(6)),
          longitud: Number(e.latlng.lng.toFixed(6)),
        });
      }
    },
  });
  return null;
}

function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function InteractiveMap({
  center,
  zoom = DEFAULT_ZOOM,
  height = '420px',
  markers = [],
  polylineCoords = [],
  secondaryPolylineCoords = [],
  geofenceCircle = null,
  onMapClick = null,
}) {
  const mapCenter =
    center && center[0] != null && center[1] != null ? center : [DEFAULT_LAT, DEFAULT_LNG];

  return (
    <div className="map-wrapper" style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
      <MapContainer center={mapCenter} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={TILE_URL}
        />
        <MapCenterUpdater center={center} />
        {onMapClick && <MapClickSelector onMapClick={onMapClick} />}

        {polylineCoords && polylineCoords.length > 1 && (
          <Polyline
            positions={polylineCoords}
            pathOptions={{ color: '#0284c7', weight: 5, opacity: 0.85 }}
          />
        )}

        {secondaryPolylineCoords && secondaryPolylineCoords.length > 1 && (
          <Polyline
            positions={secondaryPolylineCoords}
            pathOptions={{ color: '#059669', weight: 5, dashArray: '8, 8', opacity: 0.95 }}
          />
        )}

        {geofenceCircle && geofenceCircle.latitud != null && (
          <Circle
            center={[Number(geofenceCircle.latitud), Number(geofenceCircle.longitud)]}
            radius={Number(geofenceCircle.radius || 250)}
            pathOptions={{
              color: '#10b981',
              fillColor: '#10b981',
              fillOpacity: 0.14,
              weight: 2,
            }}
          />
        )}

        {markers.map((m, idx) => {
          if (m.latitud == null || m.longitud == null) return null;
          return (
            <Marker
              key={m.id || idx}
              position={[Number(m.latitud), Number(m.longitud)]}
              icon={createCustomIcon(m.color || '#059669', m.label ?? '')}
            >
              {m.popup && <Popup>{m.popup}</Popup>}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

