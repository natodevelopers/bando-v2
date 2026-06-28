/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import MapContainer from './components/MapContainer';
import { GeocodingPlace, RouteData } from './types';
import { fetchRoute, reverseGeocode } from './utils/mapUtils';
import { Info, AlertCircle, Compass, X } from 'lucide-react';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<GeocodingPlace | null>(null);
  
  // Dark mode state
  const [darkMode, setDarkMode] = useState(false);

  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Routing states
  const [startPlace, setStartPlace] = useState<GeocodingPlace | null>(null);
  const [endPlace, setEndPlace] = useState<GeocodingPlace | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // App UI feedback states
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const handleUseCurrentLocationAsStart = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }
    
    setIsRoutingLoading(true);

    const onSuccess = async (position: any) => {
      const { longitude, latitude } = position.coords;
      try {
        const place = await reverseGeocode(latitude, longitude);
        const virtualPlace: GeocodingPlace = place || {
          place_id: Math.random(),
          display_name: `Vị trí của tôi (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
          lat: latitude.toString(),
          lon: longitude.toString(),
          licence: '',
          osm_type: '',
          osm_id: 0,
          boundingbox: []
        };
        setStartPlace(virtualPlace);
        setRouteError(null);
      } catch (err) {
        console.error(err);
      } finally {
        setIsRoutingLoading(false);
      }
    };

    const onError = (error: any) => {
      console.warn('High accuracy geolocation failed for routing, trying low accuracy...', error);
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          console.error(err);
          setIsRoutingLoading(false);
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

  const handleSelectPlace = (place: GeocodingPlace | null) => {
    setSelectedPlace(place);
    if (place) {
      setRouteError(null);
    }
  };

  const handleSetStartPoint = (place: GeocodingPlace) => {
    setStartPlace(place);
    setRouteError(null);
  };

  const handleSetEndPoint = (place: GeocodingPlace) => {
    setEndPlace(place);
    setRouteError(null);
  };

  const handleClearRoute = () => {
    setStartPlace(null);
    setEndPlace(null);
    setRoute(null);
    setRouteError(null);
    setIsNavigating(false);
  };

  const handleCalculateRoute = async (start: GeocodingPlace, end: GeocodingPlace) => {
    if (!start || !end) return;
    
    setIsRoutingLoading(true);
    setRouteError(null);
    
    try {
      const routeResult = await fetchRoute(start, end);
      if (routeResult) {
        setRoute(routeResult);
      } else {
        setRouteError('Không tìm thấy tuyến đường khả thi giữa hai địa điểm này tại Việt Nam.');
        setRoute(null);
      }
    } catch (err) {
      console.error('Routing calculation failed:', err);
      setRouteError('Lỗi kết nối với hệ thống dẫn đường OSRM. Vui lòng thử lại sau.');
      setRoute(null);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 flex font-sans" id="app-root">
      
      {/* Primary Map Visual Viewport */}
      <div className="flex-1 h-full relative z-10">
        <MapContainer
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          route={route}
          startPlace={startPlace}
          endPlace={endPlace}
          onSetStartPoint={handleSetStartPoint}
          onSetEndPoint={handleSetEndPoint}
          darkMode={darkMode}
          isNavigating={isNavigating}
          onExitNavigation={() => setIsNavigating(false)}
          onCalculateRoute={handleCalculateRoute}
        />
      </div>

      {/* Floating Alerts Overlay for Route errors / Loading status */}
      <div className="absolute top-4 left-4 md:left-[410px] z-20 flex flex-col space-y-2 pointer-events-none max-w-sm">
        {isRoutingLoading && (
          <div className="bg-emerald-900/90 backdrop-blur text-white px-4 py-3 rounded-2xl shadow-lg border border-emerald-700/50 flex items-center space-x-3 pointer-events-auto animate-pulse">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Đang tính toán tuyến đường đi tối ưu...</span>
          </div>
        )}

        {routeError && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 p-4 rounded-2xl shadow-lg flex items-start space-x-3 pointer-events-auto relative">
            <AlertCircle size={18} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h5 className="text-xs font-bold uppercase tracking-wider">Lỗi lộ trình</h5>
              <p className="text-xs mt-1 leading-relaxed">{routeError}</p>
            </div>
            <button
              onClick={() => setRouteError(null)}
              className="text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-950/55 cursor-pointer pointer-events-auto"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Controller Sidebar containing core menus */}
      <Sidebar
        selectedPlace={selectedPlace}
        onSelectPlace={handleSelectPlace}
        route={route}
        onCalculateRoute={handleCalculateRoute}
        onClearRoute={handleClearRoute}
        onSetStartPoint={handleSetStartPoint}
        onSetEndPoint={handleSetEndPoint}
        startPlace={startPlace}
        endPlace={endPlace}
        onUseCurrentLocationAsStart={handleUseCurrentLocationAsStart}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        isNavigating={isNavigating}
        onStartNavigation={() => setIsNavigating(true)}
      />
    </main>
  );
}
