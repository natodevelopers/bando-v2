/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  Layers, MapPin, Navigation, Compass, Globe, ZoomIn, ZoomOut, RotateCcw, 
  Map as MapIcon, RefreshCw, Eye, Box, MoveLeft, CornerUpLeft, MoveUpLeft,
  CornerLeftUp, MoveRight, MoveUpRight, CornerRightUp, CornerDownRight,
  CornerDownLeft, MoveUp, MoveDown, ArrowUpDown, Play, Pause, Route, X,
  AlertCircle
} from 'lucide-react';
import { GeocodingPlace, MapLayerType, RouteData } from '../types';
import { VIETNAM_BOUNDS, VIETNAM_CENTER, DEFAULT_ZOOM, reverseGeocode, getVietnameseInstruction, formatDistance, formatDuration } from '../utils/mapUtils';

// Helper: Haversine distance formula
function getHaversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// Helper: Calculate initial heading from one point to another
function calculateHeading(from: [number, number], to: [number, number]): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Helper: Finds closest segment index
function getClosestCoordinateIndex(pos: [number, number], coordinates: [number, number][]): number {
  let minDistance = Infinity;
  let closestIndex = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const d = getHaversineDistance(pos, coordinates[i]);
    if (d < minDistance) {
      minDistance = d;
      closestIndex = i;
    }
  }
  return closestIndex;
}

interface MapContainerProps {
  // Places state
  selectedPlace: GeocodingPlace | null;
  onSelectPlace: (place: GeocodingPlace | null) => void;
  
  // Routing state
  route: RouteData | null;
  startPlace: GeocodingPlace | null;
  endPlace: GeocodingPlace | null;
  onSetStartPoint: (place: GeocodingPlace) => void;
  onSetEndPoint: (place: GeocodingPlace) => void;
  darkMode: boolean;

  // Navigation props
  isNavigating: boolean;
  onExitNavigation: () => void;
  onCalculateRoute?: (start: GeocodingPlace, end: GeocodingPlace) => void;
}

export default function MapContainer({
  selectedPlace,
  onSelectPlace,
  route,
  startPlace,
  endPlace,
  onSetStartPoint,
  onSetEndPoint,
  darkMode,
  isNavigating,
  onExitNavigation,
  onCalculateRoute
}: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayerType>(MapLayerType.STREETS);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hoverCoords, setHoverCoords] = useState<[number, number] | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [bearing, setBearing] = useState(0);
  
  // Click popup options state
  const [clickPopupCoords, setClickPopupCoords] = useState<{ lat: number; lon: number; address?: string } | null>(null);

  // Geolocation state for the live GPS blue dot
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [is3DMode, setIs3DMode] = useState(false);

  // Navigation Active States
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);

  // References for all active markers to easily remove them
  const selectedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const clickPopupRef = useRef<maplibregl.Popup | null>(null);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);

  // 1. Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Define the style containing all base layer raster sources
    // This allows instant switching by altering visibility without tearing down layers/sources
    const initialStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'osm-source': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19
        },
        'dark-source': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© CartoDB, © OpenStreetMap contributors',
          maxzoom: 19
        },
        'esri-source': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Esri, Maxar, Earthstar Geographics',
          maxzoom: 19
        },
        'esri-transportation-source': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Esri',
          maxzoom: 19
        },
        'esri-boundaries-source': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Esri',
          maxzoom: 19
        }
      },
      layers: [
        {
          id: 'esri-layer',
          type: 'raster',
          source: 'esri-source',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' }
        },
        {
          id: 'esri-transportation-layer',
          type: 'raster',
          source: 'esri-transportation-source',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' }
        },
        {
          id: 'esri-boundaries-layer',
          type: 'raster',
          source: 'esri-boundaries-source',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' }
        },
        {
          id: 'dark-layer',
          type: 'raster',
          source: 'dark-source',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' }
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm-source',
          minzoom: 0,
          maxzoom: 19,
          layout: { visibility: 'visible' }
        }
      ]
    };

    const isDesktop = window.innerWidth > 768;
    const initialCenter: [number, number] = VIETNAM_CENTER;
    const initialZoom = isDesktop ? 5.2 : DEFAULT_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 4.5,
      maxZoom: 18,
      maxBounds: VIETNAM_BOUNDS, // Strictly restrict panning/navigation to Vietnam
      pitchWithRotate: true,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      attributionControl: false // Configured custom in Sidebar and bottom-right
    });

    if (isDesktop) {
      map.setPadding({ left: 390, right: 0, top: 0, bottom: 0 });
    }

    // Prevent middle click (scroll wheel) default browser auto-scroll behavior
    // and implement custom smooth click-and-drag rotation/tilt for the middle mouse button.
    const container = mapContainerRef.current;
    const handleMiddleClickDrag = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault(); // Prevents Chrome autoscroll completely

        const map = mapRef.current;
        if (!map) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startBearing = map.getBearing();
        const startPitch = map.getPitch();

        const onMouseMove = (moveEvent: MouseEvent) => {
          moveEvent.preventDefault();
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;

          // Smooth rotation (bearing) and tilt (pitch)
          const newBearing = (startBearing + deltaX * 0.85) % 360;
          const newPitch = Math.max(0, Math.min(85, startPitch - deltaY * 0.65));

          map.setBearing(newBearing);
          map.setPitch(newPitch);
        };

        const onMouseUp = (upEvent: MouseEvent) => {
          if (upEvent.button === 1) {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
          }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
      }
    };

    if (container) {
      container.addEventListener('mousedown', handleMiddleClickDrag);
    }

    // Explicitly enable interaction handlers
    map.dragRotate.enable();
    map.touchZoomRotate.enable();
    map.touchPitch.enable();

    mapRef.current = map;

    map.on('load', () => {
      // Add Terrain source (DEM)
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 14
      });

      // Add OpenFreeMap Vector source for 3D buildings
      map.addSource('openfreemap-buildings', {
        type: 'vector',
        tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
        minzoom: 0,
        maxzoom: 14
      });

      // Add 3D buildings layer (hidden by default)
      map.addLayer({
        id: '3d-buildings',
        source: 'openfreemap-buildings',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': '#e2e8f0',
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            ['coalesce', ['get', 'height'], 15]
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            ['coalesce', ['get', 'min_height'], 0]
          ],
          'fill-extrusion-opacity': 0.85
        },
        layout: {
          visibility: 'none'
        }
      });

      setIsMapLoaded(true);
      // Force map.resize on load to guarantee it fills the container right away
      map.resize();
    });

    // Update bearing state on map movement/rotation
    map.on('rotate', () => {
      setBearing(map.getBearing());
    });
    map.on('move', () => {
      setBearing(map.getBearing());
    });

    // Resize observer to handle full-size rendering perfectly in responsive containers
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    // Mouse movement inside map -> track coordinates for visual display
    map.on('mousemove', (e) => {
      setHoverCoords([e.lngLat.lng, e.lngLat.lat]);
    });

    // Left click on map -> trigger reverse geocoding to find address and show popup options
    map.on('click', async (e) => {
      const { lat, lng } = e.lngLat;
      
      // Close existing click popup
      if (clickPopupRef.current) {
        clickPopupRef.current.remove();
      }

      setIsReverseGeocoding(true);
      const place = await reverseGeocode(lat, lng);
      setIsReverseGeocoding(false);

      const addressText = place ? place.display_name : 'Địa điểm chưa xác định';

      // Create standard MapLibre popup with custom actions
      const popupContent = document.createElement('div');
      popupContent.className = 'p-3 text-slate-800 space-y-2 max-w-[240px] font-sans';
      popupContent.innerHTML = `
        <div class="space-y-1">
          <p class="text-xs font-bold text-emerald-700 uppercase tracking-wide">Tọa độ đã chọn</p>
          <p class="text-[11px] text-slate-700 leading-normal line-clamp-2">${addressText}</p>
          <p class="text-[10px] font-mono text-slate-400">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
        </div>
        <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
          <button id="pop-set-start" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold py-1.5 px-2 rounded transition-all cursor-pointer text-center">
            Từ đây
          </button>
          <button id="pop-set-end" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-2 rounded transition-all cursor-pointer text-center">
            Đến đây
          </button>
        </div>
      `;

      // Set up listeners for popup buttons after insertion
      setTimeout(() => {
        const startBtn = popupContent.querySelector('#pop-set-start');
        const endBtn = popupContent.querySelector('#pop-set-end');
        
        const virtualPlace: GeocodingPlace = place || {
          place_id: Math.random(),
          display_name: `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          lat: lat.toString(),
          lon: lng.toString(),
          licence: '',
          osm_type: '',
          osm_id: 0,
          boundingbox: []
        };

        if (startBtn) {
          startBtn.addEventListener('click', () => {
            onSetStartPoint(virtualPlace);
            clickPopupRef.current?.remove();
          });
        }
        if (endBtn) {
          endBtn.addEventListener('click', () => {
            onSetEndPoint(virtualPlace);
            clickPopupRef.current?.remove();
          });
        }
      }, 50);

      const popup = new maplibregl.Popup({ closeButton: true, className: 'custom-maplibre-popup' })
        .setLngLat([lng, lat])
        .setDOMContent(popupContent)
        .addTo(map);

      clickPopupRef.current = popup;
    });

    return () => {
      if (container) {
        container.removeEventListener('mousedown', handleMiddleClickDrag);
      }
      resizeObserver.disconnect();
      map.remove();
    };
  }, []);

  // 2. Control active layer source visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // Classic Street Layer
    map.setLayoutProperty(
      'osm-layer',
      'visibility',
      activeLayer === MapLayerType.STREETS ? 'visible' : 'none'
    );

    // Dark Map Layer
    map.setLayoutProperty(
      'dark-layer',
      'visibility',
      activeLayer === MapLayerType.DARK ? 'visible' : 'none'
    );

    // High Res Esri Satellite Layer with Overlays (Transportation and Boundaries)
    const isHybrid = activeLayer === MapLayerType.HYBRID_SATELLITE;
    map.setLayoutProperty('esri-layer', 'visibility', isHybrid ? 'visible' : 'none');
    map.setLayoutProperty('esri-transportation-layer', 'visibility', isHybrid ? 'visible' : 'none');
    map.setLayoutProperty('esri-boundaries-layer', 'visibility', isHybrid ? 'visible' : 'none');
  }, [activeLayer, isMapLoaded]);

  // 2b. Automatically sync active base map with dark mode toggle
  useEffect(() => {
    if (darkMode) {
      if (activeLayer === MapLayerType.STREETS) {
        setActiveLayer(MapLayerType.DARK);
      }
    } else {
      if (activeLayer === MapLayerType.DARK) {
        setActiveLayer(MapLayerType.STREETS);
      }
    }
  }, [darkMode]);

  // 2c. Control 3D Mode (Terrain and Buildings)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (is3DMode) {
      // Enable Terrain DEM
      map.setTerrain({
        source: 'terrain-dem',
        exaggeration: 1.5
      });

      // Show 3D Buildings
      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
        map.setPaintProperty(
          '3d-buildings',
          'fill-extrusion-color',
          darkMode ? '#334155' : '#e2e8f0'
        );
      }

      // Smoothly tilt the map to 3D angle (pitch)
      const currentPitch = map.getPitch();
      if (currentPitch < 30) {
        map.easeTo({
          pitch: 55,
          bearing: map.getBearing() || -15,
          duration: 1000
        });
      }
    } else {
      // Disable Terrain DEM
      map.setTerrain(null);

      // Hide 3D Buildings
      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'none');
      }

      // Smoothly level the map (0 pitch)
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 800
      });
    }
  }, [is3DMode, isMapLoaded, darkMode]);

  // 3. Render markers when selectedPlace, startPlace, or endPlace change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // Selected place marker
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }

    if (selectedPlace) {
      const lat = parseFloat(selectedPlace.lat);
      const lon = parseFloat(selectedPlace.lon);

      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="absolute w-8 h-8 rounded-full bg-emerald-500/30 animate-ping"></div>
        <div class="relative bg-emerald-600 border-2 border-white shadow-md p-1.5 rounded-full text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
      `;

      selectedMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);

      // Pan to the selected location smoothly
      const isDesktop = window.innerWidth > 768;
      map.flyTo({
        center: [lon, lat],
        zoom: Math.max(map.getZoom(), 13),
        padding: isDesktop ? { left: 390, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 },
        essential: true
      });
    }

    // Start point marker
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    if (startPlace) {
      const lat = parseFloat(startPlace.lat);
      const lon = parseFloat(startPlace.lon);

      const el = document.createElement('div');
      el.className = 'relative flex flex-col items-center justify-center';
      el.innerHTML = `
        <div class="bg-emerald-700 border-2 border-white text-white font-bold text-[10px] shadow-lg px-2 py-0.5 rounded-full flex items-center space-x-1">
          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          <span>Bắt đầu</span>
        </div>
        <div class="w-2 h-2 bg-emerald-700 border border-white transform rotate-45 -mt-1 shadow-md"></div>
      `;

      startMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
    }

    // End point marker
    if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }

    if (endPlace) {
      const lat = parseFloat(endPlace.lat);
      const lon = parseFloat(endPlace.lon);

      const el = document.createElement('div');
      el.className = 'relative flex flex-col items-center justify-center';
      el.innerHTML = `
        <div class="bg-red-600 border-2 border-white text-white font-bold text-[10px] shadow-lg px-2 py-0.5 rounded-full flex items-center space-x-1 animate-bounce">
          <div class="w-1.5 h-1.5 bg-white"></div>
          <span>Kết thúc</span>
        </div>
        <div class="w-2 h-2 bg-red-600 border border-white transform rotate-45 -mt-1 shadow-md"></div>
      `;

      endMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
    }
  }, [selectedPlace, startPlace, endPlace, isMapLoaded]);

  // 4. Handle route geometry drawing on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // Clean up existing route layers and sources
    if (map.getLayer('route-layer')) map.removeLayer('route-layer');
    if (map.getLayer('route-casing-layer')) map.removeLayer('route-casing-layer');
    if (map.getSource('route-source')) map.removeSource('route-source');

    if (route && route.geometry) {
      // Add source
      map.addSource('route-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: route.geometry
        }
      });

      // Add white outer casing for high visibility on satellite layers
      map.addLayer({
        id: 'route-casing-layer',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.9
        }
      });

      // Add main emerald line
      map.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#059669', // Emerald-600
          'line-width': 6,
          'line-opacity': 0.95
        }
      });

      // Calculate bounds of route to fit screen
      const coordinates = route.geometry.coordinates;
      if (coordinates.length > 0) {
        const bounds = coordinates.reduce((acc, coord) => {
          return acc.extend(coord);
        }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 420, right: 80 }, // Account for Sidebar on left
          maxZoom: 14,
          duration: 1000
        });
      }
    }
  }, [route, isMapLoaded]);

  // A. Configure map camera when entering or leaving Navigation Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isNavigating && route?.geometry?.coordinates?.length) {
      setCurrentStepIndex(0);

      // Camera driving perspective
      const centerCoords = userLocation || route.geometry.coordinates[0];
      map.setPadding({ top: 80, bottom: 220, left: 0, right: 0 });
      map.easeTo({
        center: centerCoords,
        zoom: 17,
        pitch: 55,
        bearing: userHeading || 0,
        duration: 1200
      });
    } else {
      // Restore normal 2D map view
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      map.easeTo({
        pitch: 0,
        bearing: 0,
        zoom: 13,
        duration: 1000
      });
    }
  }, [isNavigating, isMapLoaded, route]);

  // B. Follow user's real-time position on map in Navigation Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !isNavigating || !userLocation) return;

    map.easeTo({
      center: userLocation,
      bearing: userHeading || map.getBearing(),
      pitch: 55,
      zoom: 17,
      duration: 1000
    });
  }, [userLocation, userHeading, isNavigating, isMapLoaded]);

  // C. Watch Orientation / Mobile Compass Heading
  useEffect(() => {
    if (!isNavigating) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // Use real compass/gyro orientation to rotate map if GPS heading is not actively moving/available
      if (mapRef.current && !userHeading) {
        const heading = (e as any).webkitCompassHeading || e.alpha;
        if (heading !== undefined && heading !== null) {
          mapRef.current.easeTo({
            bearing: -heading,
            duration: 300
          });
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isNavigating, userHeading]);

  // D. Track/Advance Steps Progress and check Off-Route recalculation based on real GPS
  useEffect(() => {
    if (!isNavigating || !userLocation || !route) return;

    // 1. Advance step by step
    const currentStep = route.steps[currentStepIndex];
    if (currentStep) {
      const distToManeuver = getHaversineDistance(userLocation, currentStep.maneuver.location);
      if (distToManeuver < 30 && currentStepIndex < route.steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      }
    }

    // 2. Real GPS Off-Route verification (more than 60m deviation)
    let minDist = Infinity;
    for (const coord of route.geometry.coordinates) {
      const d = getHaversineDistance(userLocation, coord);
      if (d < minDist) minDist = d;
    }

    if (minDist > 60 && onCalculateRoute && route.endPlace) {
      const virtualStart: GeocodingPlace = {
        place_id: Math.random(),
        licence: 'recalculated-gps',
        osm_type: 'node',
        osm_id: Math.random(),
        lat: userLocation[1].toString(),
        lon: userLocation[0].toString(),
        display_name: `Vị trí của tôi (${userLocation[1].toFixed(5)}, ${userLocation[0].toFixed(5)})`,
        boundingbox: [
          (userLocation[1] - 0.01).toString(),
          (userLocation[1] + 0.01).toString(),
          (userLocation[0] - 0.01).toString(),
          (userLocation[0] + 0.01).toString()
        ]
      };
      onCalculateRoute(virtualStart, route.endPlace);
    }
  }, [isNavigating, userLocation, currentStepIndex, route, onCalculateRoute]);

  // 6. Watch real-time user GPS location and handle permissions/status
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Thiết bị hoặc trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude, heading } = position.coords;
        setUserLocation([longitude, latitude]);
        if (heading !== null && heading !== undefined) {
          setUserHeading(heading);
        }
        setGpsError(null);
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Yêu cầu quyền truy cập vị trí. Vui lòng cấp quyền trong cài đặt.');
        } else {
          setGpsError('Đang chờ tín hiệu GPS...');
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isMapLoaded]);

  // 7. Render and update the GPS blue dot marker (100% real location only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.remove();
      userLocationMarkerRef.current = null;
    }

    if (userLocation) {
      const [lon, lat] = userLocation;

      // Create a custom pulsing blue dot element, made 3x bigger as requested
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.style.width = '72px';
      el.style.height = '72px';
      el.innerHTML = `
        <div class="absolute w-[72px] h-[72px] rounded-full bg-blue-500/30 animate-ping"></div>
        <div class="relative w-[42px] h-[42px] bg-blue-500 border-[6px] border-white rounded-full shadow-2xl"></div>
      `;

      userLocationMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
    }

    return () => {
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
        userLocationMarkerRef.current = null;
      }
    };
  }, [userLocation, isMapLoaded]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }

    setIsTrackingLocation(true);

    const onSuccess = (position: any) => {
      const { longitude, latitude } = position.coords;
      setUserLocation([longitude, latitude]);
      setIsTrackingLocation(false);

      if (mapRef.current) {
        const isDesktop = window.innerWidth > 768;
        mapRef.current.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          padding: isDesktop ? { left: 390, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 },
          essential: true
        });
      }
    };

    const onError = (error: any) => {
      console.warn('High accuracy geolocation failed, trying low accuracy...', error);
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          console.error('Error getting geolocation:', err);
          setIsTrackingLocation(false);
          let errorMsg = 'Không thể lấy vị trí hiện tại của bạn.';
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = 'Quyền truy cập vị trí bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt hoặc mở ứng dụng trong tab mới.';
          }
          alert(errorMsg);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  // Helper controls
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleResetMap = () => {
    const isDesktop = window.innerWidth > 768;
    mapRef.current?.flyTo({
      center: VIETNAM_CENTER,
      zoom: isDesktop ? 5.2 : DEFAULT_ZOOM,
      padding: isDesktop ? { left: 390, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 },
      pitch: 0,
      bearing: 0,
      essential: true
    });
  };

  return (
    <div className="w-full h-full relative" id="map-root-container">
      {/* Map Target Div */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Coordinates and Layer Switch Control stacked cleanly */}
      <div className="absolute top-4 right-4 z-20 flex flex-col space-y-3 items-end pointer-events-none">
        
        {/* Layer Selector Widget */}
        {!isNavigating && (
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 shadow-md rounded-2xl p-1.5 flex space-x-1.5 items-center pointer-events-auto">
            <button
              onClick={() => setActiveLayer(MapLayerType.STREETS)}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeLayer === MapLayerType.STREETS
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
              }`}
            >
              <MapIcon size={14} />
              <span>Đường phố</span>
            </button>

            <button
              onClick={() => setActiveLayer(MapLayerType.DARK)}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeLayer === MapLayerType.DARK
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
              }`}
            >
              <Globe size={14} />
              <span>Bản đồ tối</span>
            </button>

            <button
              onClick={() => setActiveLayer(MapLayerType.HYBRID_SATELLITE)}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeLayer === MapLayerType.HYBRID_SATELLITE
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
              }`}
            >
              <Layers size={14} />
              <span>Vệ tinh</span>
            </button>

            <div className="w-[1px] bg-slate-200 dark:bg-slate-800 h-5 self-center" />

            <button
              onClick={() => setIs3DMode(!is3DMode)}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                is3DMode
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
              }`}
              title="Bật/Tắt chế độ 3D (Mô hình nhà & Địa hình)"
            >
              <Box size={14} className={is3DMode ? "animate-pulse" : ""} />
              <span><span className="hidden sm:inline">Chế độ </span>3D</span>
            </button>
          </div>
        )}

        {/* Small stack of map actions */}
        {!isNavigating && (
          <div className="flex flex-col space-y-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-md pointer-events-auto">
            <button
              onClick={handleGeolocate}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                userLocation 
                  ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/80 bg-blue-50/50 dark:bg-blue-950/40' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Định vị vị trí hiện tại (GPS)"
            >
              {isTrackingLocation ? (
                <RefreshCw size={18} className="animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <Navigation size={18} className={`rotate-45 ${userLocation ? 'fill-blue-600 dark:fill-blue-400 text-blue-600 dark:text-blue-400' : ''}`} />
              )}
            </button>
            <hr className="border-slate-100 dark:border-slate-800/80 mx-1" />
            <button
              onClick={handleZoomIn}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut size={18} />
            </button>
            <hr className="border-slate-100 dark:border-slate-800/80 mx-1" />
            <button
              onClick={() => {
                mapRef.current?.easeTo({
                  bearing: 0,
                  pitch: 0,
                  duration: 500
                });
              }}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
              title="Đặt lại hướng Bắc và góc nghiêng"
            >
              <Compass 
                size={18} 
                style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.15s ease-out' }}
                className={bearing !== 0 ? "text-emerald-600 dark:text-emerald-400 animate-pulse" : "text-slate-600 dark:text-slate-400"}
              />
            </button>
            <button
              onClick={handleResetMap}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Đặt lại bản đồ Việt Nam"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Reverse geocoding loading overlay */}
      {isReverseGeocoding && !isNavigating && (
        <div className="absolute bottom-16 right-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-[11px] shadow-md flex items-center space-x-2 pointer-events-none">
          <RefreshCw size={12} className="animate-spin text-emerald-600 dark:text-emerald-400" />
          <span>Đang phân tích tọa độ...</span>
        </div>
      )}

      {/* Floating bottom status showing coordinates under mouse or map center */}
      {!isNavigating && (
        <div className="absolute bottom-4 right-4 z-20 bg-white/95 dark:bg-slate-900/80 backdrop-blur-sm text-slate-800 dark:text-white/95 px-3 py-1.5 rounded-xl font-mono text-[10px] border border-slate-200/60 dark:border-slate-800 shadow-md select-none pointer-events-none">
          {hoverCoords ? (
            <span className="flex items-center space-x-2">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">KINH ĐỘ:</span>
              <span>{hoverCoords[0].toFixed(5)}</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">VĨ ĐỘ:</span>
              <span>{hoverCoords[1].toFixed(5)}</span>
            </span>
          ) : (
            <span>Di chuyển chuột trên bản đồ để xem tọa độ</span>
          )}
        </div>
      )}

      {/* NAVIGATION MODE OVERLAYS (Google Maps-like) */}
      {isNavigating && route && (() => {
        // Helper to map modifiers and types to specific requested Lucide icons
        const getNavManeuverIcon = (modifier?: string, type?: string, size = 24) => {
          if (!modifier) {
            if (type === 'depart') return <MoveUp size={size} />;
            if (type === 'arrive') return <MapPin size={size} className="text-red-500 animate-bounce" />;
            return <MoveUp size={size} />;
          }

          const mod = modifier.toLowerCase();
          if (mod.includes('slight left')) return <MoveUpLeft size={size} />;
          if (mod.includes('slight right')) return <MoveUpRight size={size} />;
          if (mod.includes('sharp left')) return <CornerUpLeft size={size} />;
          if (mod.includes('sharp right')) return <CornerRightUp size={size} />;
          if (mod.includes('left')) return <CornerLeftUp size={size} />;
          if (mod.includes('right')) return <CornerRightUp size={size} />;
          if (mod.includes('uturn')) return <MoveDown size={size} />;
          if (mod.includes('straight')) return <MoveUp size={size} />;

          return <MoveUp size={size} />;
        };

        const getRemainingStats = () => {
          const coords = route.geometry.coordinates;
          const currentPos = userLocation || coords[0];
          const currentCoordIdx = getClosestCoordinateIndex(currentPos, coords);

          let sumDist = 0;
          if (currentCoordIdx < coords.length - 1) {
            sumDist += getHaversineDistance(currentPos, coords[currentCoordIdx + 1]);
            for (let i = currentCoordIdx + 1; i < coords.length - 1; i++) {
              sumDist += getHaversineDistance(coords[i], coords[i + 1]);
            }
          }

          const ratio = route.distance > 0 ? sumDist / route.distance : 0;
          const remainingDuration = Math.max(0, Math.round(route.duration * ratio));

          const etaDate = new Date();
          etaDate.setSeconds(etaDate.getSeconds() + remainingDuration);
          const hours = etaDate.getHours().toString().padStart(2, '0');
          const minutes = etaDate.getMinutes().toString().padStart(2, '0');
          const etaString = `${hours}:${minutes}`;

          return {
            remainingDistance: sumDist,
            remainingDuration,
            etaString
          };
        };

        const { remainingDistance, remainingDuration, etaString } = getRemainingStats();
        const currentStep = route.steps[currentStepIndex];
        const nextStep = route.steps[currentStepIndex + 1];

        // Distance to upcoming step's maneuver
        const distToUpcomingManeuver = currentStep 
          ? getHaversineDistance(userLocation || route.geometry.coordinates[0], currentStep.maneuver.location)
          : 0;

        return (
          <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 pb-24">
            
            {/* Top Instruction Panels Container */}
            <div className="w-full max-w-md mx-auto flex flex-col space-y-2 items-center pointer-events-auto">
              
              {/* Main Navigation Instruction Panel */}
              <div className="w-full bg-emerald-600 dark:bg-emerald-800 text-white rounded-2xl shadow-xl p-4 flex items-center space-x-4 border border-emerald-500/20 animate-fade-in">
                <div className="bg-white/15 p-3 rounded-2xl flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
                  {currentStep ? (
                    getNavManeuverIcon(currentStep.maneuver.modifier, currentStep.maneuver.type, 28)
                  ) : (
                    <MoveUp size={28} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-emerald-100 font-mono text-[10px] uppercase tracking-wider font-bold">
                    {currentStep ? `CÒN ${formatDistance(distToUpcomingManeuver)}` : 'TIẾP TỤC ĐI THẲNG'}
                  </div>
                  <p className="text-sm md:text-base font-bold leading-tight">
                    {currentStep ? (
                      `Sau ${formatDistance(distToUpcomingManeuver)}, ${getVietnameseInstruction(currentStep)}`
                    ) : (
                      'Tiếp tục di chuyển theo lộ trình'
                    )}
                  </p>
                </div>
              </div>

              {/* Next Instruction Preview */}
              {nextStep && (
                <div className="w-[90%] max-w-sm bg-emerald-800/95 dark:bg-emerald-950/95 backdrop-blur text-white rounded-xl shadow-lg px-3.5 py-2.5 flex items-center space-x-3 border border-emerald-700/30 transition-all">
                  <div className="bg-white/10 p-1.5 rounded-lg flex items-center justify-center shrink-0">
                    {getNavManeuverIcon(nextStep.maneuver.modifier, nextStep.maneuver.type, 16)}
                  </div>
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="text-emerald-200 font-semibold mr-1">Tiếp theo:</span>
                    <span className="font-medium truncate opacity-95">{getVietnameseInstruction(nextStep)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Fixed Navigation Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-2xl px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between pointer-events-auto z-40">
              {/* Exit Button */}
              <button
                onClick={onExitNavigation}
                className="flex items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 font-bold px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <X size={16} className="mr-1.5" />
                <span>Thoát</span>
              </button>

              {/* Real-time GPS Status Indicator */}
              <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800/80">
                {gpsError ? (
                  <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400">
                    <AlertCircle size={14} className="animate-bounce" />
                    <span className="text-[11px] font-semibold">{gpsError}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Định vị GPS thực tế</span>
                  </div>
                )}
              </div>

              {/* Navigation Status and Countdown (ETA / Dist) */}
              <div className="text-right flex flex-col justify-center">
                <div className="flex items-center justify-end space-x-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400 text-lg md:text-xl font-extrabold tracking-tight">
                    {formatDuration(remainingDuration)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-600 font-medium text-xs">•</span>
                  <span className="text-slate-700 dark:text-slate-200 text-sm md:text-base font-bold">
                    {formatDistance(remainingDistance)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center justify-end space-x-1">
                  <Compass size={11} className="animate-spin-slow text-emerald-600 dark:text-emerald-400" />
                  <span>Dự kiến đến: <strong>{etaString}</strong></span>
                </div>
              </div>

            </div>

          </div>
        );
      })()}


    </div>
  );
}
