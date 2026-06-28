/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Navigation, X, ArrowUpDown, ChevronLeft, ChevronRight, 
  Map, Copy, Info, Navigation2, CheckCircle2, Route, Compass
} from 'lucide-react';
import { GeocodingPlace, RouteData } from '../types';
import { formatDistance, formatDuration, searchPlacesInVietnam, getVietnameseInstruction } from '../utils/mapUtils';

interface SidebarProps {
  // Search state
  selectedPlace: GeocodingPlace | null;
  onSelectPlace: (place: GeocodingPlace | null) => void;
  
  // Routing state
  route: RouteData | null;
  onCalculateRoute: (start: GeocodingPlace, end: GeocodingPlace) => void;
  onClearRoute: () => void;
  
  // Direct interaction triggers
  onSetStartPoint: (place: GeocodingPlace) => void;
  onSetEndPoint: (place: GeocodingPlace) => void;
  startPlace: GeocodingPlace | null;
  endPlace: GeocodingPlace | null;
  onUseCurrentLocationAsStart: () => void;

  // Dark mode states
  darkMode: boolean;
  onToggleDarkMode: () => void;

  // Navigation states
  isNavigating: boolean;
  onStartNavigation: () => void;
}

export default function Sidebar({
  selectedPlace,
  onSelectPlace,
  route,
  onCalculateRoute,
  onClearRoute,
  onSetStartPoint,
  onSetEndPoint,
  startPlace,
  endPlace,
  onUseCurrentLocationAsStart,
  darkMode,
  onToggleDarkMode,
  isNavigating,
  onStartNavigation
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState<'search' | 'route'>('search');
  
  // Search tab inputs & autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Route tab inputs & autocomplete
  const [startQuery, setStartQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<GeocodingPlace[]>([]);
  const [isSearchingStart, setIsSearchingStart] = useState(false);
  const [activeRouteInput, setActiveRouteInput] = useState<'start' | 'end' | null>(null);

  const [endQuery, setEndQuery] = useState('');
  const [endSuggestions, setEndSuggestions] = useState<GeocodingPlace[]>([]);
  const [isSearchingEnd, setIsSearchingEnd] = useState(false);
  
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Quick Locations for Vietnamese users
  const QUICK_LOCATIONS = [
    { name: 'Hồ Hoàn Kiếm, Hà Nội', query: 'Hồ Hoàn Kiếm, Hà Nội' },
    { name: 'Chợ Bến Thành, TP.HCM', query: 'Chợ Bến Thành, Quận 1, Hồ Chí Minh' },
    { name: 'Cầu Rồng, Đà Nẵng', query: 'Cầu Rồng, Đà Nẵng' },
    { name: 'Vịnh Hạ Long, Quảng Ninh', query: 'Vịnh Hạ Long, Quảng Ninh' },
    { name: 'Dinh Thống Nhất, TP.HCM', query: 'Dinh Thống Nhất, Hồ Chí Minh' }
  ];

  // Debounce hook/effect for General Search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (selectedPlace && searchQuery === selectedPlace.display_name) {
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchPlacesInVietnam(searchQuery);
      setSuggestions(results);
      setIsSearching(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedPlace]);

  // Debounce for Route Start
  useEffect(() => {
    if (startQuery.trim().length < 2) {
      setStartSuggestions([]);
      return;
    }
    if (startPlace && startQuery === startPlace.display_name) {
      return;
    }
    setIsSearchingStart(true);
    const timer = setTimeout(async () => {
      const results = await searchPlacesInVietnam(startQuery);
      setStartSuggestions(results);
      setIsSearchingStart(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [startQuery, startPlace]);

  // Debounce for Route End
  useEffect(() => {
    if (endQuery.trim().length < 2) {
      setEndSuggestions([]);
      return;
    }
    if (endPlace && endQuery === endPlace.display_name) {
      return;
    }
    setIsSearchingEnd(true);
    const timer = setTimeout(async () => {
      const results = await searchPlacesInVietnam(endQuery);
      setEndSuggestions(results);
      setIsSearchingEnd(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [endQuery, endPlace]);

  // Sync state if start/end places change externally (like clicking map)
  useEffect(() => {
    if (startPlace) {
      setStartQuery(startPlace.display_name);
    } else {
      setStartQuery('');
    }
  }, [startPlace]);

  useEffect(() => {
    if (endPlace) {
      setEndQuery(endPlace.display_name);
    } else {
      setEndQuery('');
    }
  }, [endPlace]);

  // Auto calculate route when both are defined
  useEffect(() => {
    if (startPlace && endPlace) {
      onCalculateRoute(startPlace, endPlace);
    }
  }, [startPlace, endPlace]);

  const handleCopyCoords = (lat: string, lon: string) => {
    navigator.clipboard.writeText(`${lat}, ${lon}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleSwapRoute = () => {
    if (startPlace && endPlace) {
      const temp = startPlace;
      onSetStartPoint(endPlace);
      onSetEndPoint(temp);
    } else {
      const tempQuery = startQuery;
      setStartQuery(endQuery);
      setEndQuery(tempQuery);
    }
  };

  // Helper to split display name for cleaner formatting
  const parsePlaceName = (fullName: string) => {
    const parts = fullName.split(',');
    const mainName = parts[0].trim();
    const address = parts.slice(1).join(',').trim();
    return { mainName, address };
  };

  const getManeuverIcon = (modifier?: string) => {
    const cls = "w-5 h-5 text-emerald-600 shrink-0";
    if (!modifier) return <Navigation className={cls} style={{ transform: 'rotate(90deg)' }} />;
    switch (modifier) {
      case 'left':
      case 'sharp left':
      case 'slight left':
        return <Navigation className={`${cls} -rotate-90`} />;
      case 'right':
      case 'sharp right':
      case 'slight right':
        return <Navigation className={`${cls} rotate-90`} />;
      case 'uturn':
        return <ArrowUpDown className={cls} />;
      default:
        return <Navigation className={cls} />;
    }
  };

  return (
    <>
      {/* Main Sidebar Wrapper */}
      <div
        id="main-sidebar"
        className={`fixed top-0 left-0 h-full z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 w-[320px] max-w-[calc(100vw-48px)] md:w-[390px] ${
          isNavigating 
            ? '-translate-x-full pointer-events-none opacity-0' 
            : isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Collapse/Expand Toggle Button */}
        {!isNavigating && (
          <button
            id="sidebar-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute right-0 translate-x-[calc(100%-1px)] top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-r-lg shadow-md p-1.5 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer flex"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        )}
        {/* Brand Header */}
        <div className="p-4 bg-emerald-700 dark:bg-emerald-950 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 p-1.5 rounded-lg shadow-sm">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight font-sans">Bando</h1>
              <p className="text-[10px] text-emerald-100/90 dark:text-emerald-300/90 font-mono">BẢN ĐỒ VIỆT NAM</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-lg bg-emerald-800/60 dark:bg-emerald-900/60 hover:bg-emerald-800 dark:hover:bg-emerald-900 border border-emerald-600 dark:border-emerald-800 text-emerald-100 hover:text-white transition-colors cursor-pointer"
              title={darkMode ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              )}
            </button>
            <div className="text-xs bg-emerald-800/60 dark:bg-emerald-900/60 px-2 py-1 rounded border border-emerald-600 dark:border-emerald-800 font-mono">
              <span>VN 🇻🇳</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <button
            id="tab-search"
            onClick={() => setActiveTab('search')}
            className={`py-3 text-center text-sm font-semibold transition-colors border-b-2 flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'search'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40'
            }`}
          >
            <Search size={16} />
            <span>Tìm kiếm</span>
          </button>
          <button
            id="tab-route"
            onClick={() => {
              setActiveTab('route');
              if (selectedPlace && !startPlace && !endPlace) {
                onSetEndPoint(selectedPlace);
              }
            }}
            className={`py-3 text-center text-sm font-semibold transition-colors border-b-2 flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'route'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40'
            }`}
          >
            <Route size={16} />
            <span>Đường đi</span>
          </button>
        </div>

        {/* Tab Contents Scrollable container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          
          {/* SEARCH TAB */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              {/* Search Bar Input Container */}
              <div className="relative">
                <div className="flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden pr-2">
                  <Search className="w-5 h-5 text-slate-400 ml-3 shrink-0" />
                  <input
                    id="search-input"
                    type="text"
                    placeholder="Tìm địa điểm tại Việt Nam..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-0 py-3 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent"
                  />
                  {searchQuery && (
                    <button
                      id="clear-search-btn"
                      onClick={() => {
                        setSearchQuery('');
                        setSuggestions([]);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {isSearching && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 p-4 text-center text-xs text-slate-400">
                    <div className="inline-block w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Đang tìm kiếm...
                  </div>
                )}

                {!isSearching && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden max-h-[250px] overflow-y-auto">
                    {suggestions.map((place) => {
                      const { mainName, address } = parsePlaceName(place.display_name);
                      return (
                        <button
                          key={place.place_id}
                          onClick={() => {
                            onSelectPlace(place);
                            setSearchQuery(place.display_name);
                            setSuggestions([]);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 flex items-start space-x-2.5 transition-colors cursor-pointer"
                        >
                          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">{mainName}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 mt-0.5">{address || 'Việt Nam'}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Place Card */}
              {selectedPlace && (
                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-emerald-600"></div>
                  <div className="pl-2 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <span className="inline-block bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded mb-1">
                          ĐỊA ĐIỂM ĐÃ CHỌN
                        </span>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                          {parsePlaceName(selectedPlace.display_name).mainName}
                        </h3>
                      </div>
                      <button
                        onClick={() => onSelectPlace(null)}
                        className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {parsePlaceName(selectedPlace.display_name).address || 'Việt Nam'}
                    </p>

                    <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2 rounded-lg text-slate-500 dark:text-slate-400">
                      <Compass size={14} className="text-slate-400 shrink-0" />
                      <span className="text-[11px] font-mono select-all">
                        {parseFloat(selectedPlace.lat).toFixed(6)}, {parseFloat(selectedPlace.lon).toFixed(6)}
                      </span>
                      <button
                        onClick={() => handleCopyCoords(selectedPlace.lat, selectedPlace.lon)}
                        className="ml-auto p-1 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Sao chép tọa độ"
                      >
                        {copiedCoords ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      </button>
                    </div>

                    {/* Navigation Actions */}
                    <div className="flex space-x-2 pt-2">
                      <button
                        onClick={() => {
                          onSetEndPoint(selectedPlace);
                          setActiveTab('route');
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-2 px-3 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-sm shadow-emerald-200 dark:shadow-none cursor-pointer"
                      >
                        <Navigation size={12} className="fill-white" />
                        <span>Chỉ đường đi</span>
                      </button>
                      <button
                        onClick={() => {
                          onSetStartPoint(selectedPlace);
                          setActiveTab('route');
                        }}
                        className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs py-2 px-3 rounded-xl flex items-center justify-center space-x-1 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        <Navigation2 size={12} className="text-slate-500 rotate-45" />
                        <span>Điểm xuất phát</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Suggestions list (only visible if search query and selection are empty) */}
              {!searchQuery && !selectedPlace && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center">
                    <Compass size={12} className="mr-1.5 text-emerald-600" />
                    Địa điểm nổi bật gợi ý
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {QUICK_LOCATIONS.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={async () => {
                          setSearchQuery(loc.query);
                          const results = await searchPlacesInVietnam(loc.query);
                          if (results.length > 0) {
                            onSelectPlace(results[0]);
                          }
                        }}
                        className="w-full text-left p-3 bg-white dark:bg-slate-950 border border-slate-200/65 dark:border-slate-800/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 hover:bg-emerald-50/10 dark:hover:bg-emerald-950/10 rounded-xl flex items-center space-x-3 transition-all group cursor-pointer"
                      >
                        <div className="bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-100/50 dark:group-hover:bg-emerald-950/40 p-2 rounded-lg transition-colors shrink-0">
                          <MapPin size={14} className="text-slate-500 dark:text-slate-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-emerald-800 dark:group-hover:text-emerald-100 truncate">
                          {loc.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ROUTE TAB */}
          {activeTab === 'route' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                
                <div className="flex items-center space-x-3">
                  {/* Inputs Column */}
                  <div className="flex-1 space-y-3">
                    {/* Start input */}
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Điểm xuất phát
                      </label>
                      <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white dark:focus-within:bg-slate-950 overflow-hidden">
                        <div className="w-2 h-2 rounded-full bg-emerald-600 ml-3 shrink-0"></div>
                        <input
                          type="text"
                          placeholder="Chọn điểm xuất phát..."
                          value={startQuery}
                          onChange={(e) => {
                            setStartQuery(e.target.value);
                            setActiveRouteInput('start');
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (startSuggestions.length > 0) {
                                const topPlace = startSuggestions[0];
                                onSetStartPoint(topPlace);
                                setStartQuery(topPlace.display_name);
                                setStartSuggestions([]);
                                setActiveRouteInput(null);
                              } else if (startQuery.trim()) {
                                const results = await searchPlacesInVietnam(startQuery);
                                if (results.length > 0) {
                                  onSetStartPoint(results[0]);
                                  setStartQuery(results[0].display_name);
                                  setStartSuggestions([]);
                                  setActiveRouteInput(null);
                                }
                              }
                            }
                          }}
                          className="flex-1 min-w-0 py-2.5 px-3 text-xs text-slate-800 dark:text-slate-100 outline-none bg-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                        {startQuery && (
                          <button
                            onClick={() => {
                              setStartQuery('');
                              onSetStartPoint(null as any);
                              setStartSuggestions([]);
                            }}
                            className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-full mr-1 shrink-0"
                            title="Xóa tìm kiếm"
                          >
                            <X size={14} />
                          </button>
                        )}
                        
                        {/* Vertical line separator exactly as drawn ("Change to separate") */}
                        <div className="w-[1px] h-8 bg-slate-200 dark:bg-slate-800 shrink-0"></div>

                        {/* GPS Blue Dot button, integrated cleanly inside, dot and outer ring made 3x bigger */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            onUseCurrentLocationAsStart();
                          }}
                          className="px-4 py-2 hover:bg-blue-50/55 dark:hover:bg-blue-950/20 transition-colors cursor-pointer shrink-0 flex items-center justify-center text-blue-500"
                          title="Sử dụng vị trí hiện tại của tôi (GPS)"
                          style={{ height: '42px' }}
                        >
                          <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
                            {/* Inner blue ring with white gap and solid blue dot (3x size & border) */}
                            <div className="absolute w-7 h-7 rounded-full border-[3px] border-blue-500 bg-transparent animate-pulse"></div>
                            <div className="w-3.5 h-3.5 bg-blue-500 rounded-full"></div>
                          </div>
                        </button>
                      </div>

                      {/* Autocomplete for Start Input */}
                      {activeRouteInput === 'start' && isSearchingStart && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 p-2.5 text-center text-[11px] text-slate-400">
                          Đang tìm...
                        </div>
                      )}

                      {activeRouteInput === 'start' && startSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden max-h-[180px] overflow-y-auto">
                          {startSuggestions.map((place) => (
                            <button
                              key={place.place_id}
                              onClick={() => {
                                onSetStartPoint(place);
                                setStartQuery(place.display_name);
                                setStartSuggestions([]);
                                setActiveRouteInput(null);
                              }}
                              className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 text-xs flex items-start space-x-2 cursor-pointer text-slate-700 dark:text-slate-200"
                            >
                              <MapPin size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                              <span className="truncate">{place.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* End input */}
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Điểm đến
                      </label>
                      <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white dark:focus-within:bg-slate-950 overflow-hidden pr-2">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-sm ml-3 shrink-0"></div>
                        <input
                          type="text"
                          placeholder="Chọn điểm đến..."
                          value={endQuery}
                          onChange={(e) => {
                            setEndQuery(e.target.value);
                            setActiveRouteInput('end');
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (endSuggestions.length > 0) {
                                const topPlace = endSuggestions[0];
                                onSetEndPoint(topPlace);
                                setEndQuery(topPlace.display_name);
                                setEndSuggestions([]);
                                setActiveRouteInput(null);
                              } else if (endQuery.trim()) {
                                const results = await searchPlacesInVietnam(endQuery);
                                if (results.length > 0) {
                                  onSetEndPoint(results[0]);
                                  setEndQuery(results[0].display_name);
                                  setEndSuggestions([]);
                                  setActiveRouteInput(null);
                                }
                              }
                            }
                          }}
                          className="flex-1 min-w-0 py-2.5 px-3 text-xs text-slate-800 dark:text-slate-100 outline-none bg-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                        {endQuery && (
                          <button
                            onClick={() => {
                              setEndQuery('');
                              onSetEndPoint(null as any);
                              setEndSuggestions([]);
                            }}
                            className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-full"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Autocomplete for End Input */}
                      {activeRouteInput === 'end' && isSearchingEnd && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 p-2.5 text-center text-[11px] text-slate-400">
                          Đang tìm...
                        </div>
                      )}

                      {activeRouteInput === 'end' && endSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden max-h-[180px] overflow-y-auto">
                          {endSuggestions.map((place) => (
                            <button
                              key={place.place_id}
                              onClick={() => {
                                onSetEndPoint(place);
                                setEndQuery(place.display_name);
                                setEndSuggestions([]);
                                setActiveRouteInput(null);
                              }}
                              className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 text-xs flex items-start space-x-2 cursor-pointer text-slate-700 dark:text-slate-200"
                            >
                              <MapPin size={12} className="text-red-500 mt-0.5 shrink-0" />
                              <span className="truncate">{place.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Swap Column centered vertically as drawn */}
                  <div className="shrink-0 flex items-center justify-center self-center">
                    <button
                      onClick={handleSwapRoute}
                      className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-full text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-sm hover:shadow transition-all cursor-pointer"
                      title="Đổi chiều xuất phát/đích"
                    >
                      <ArrowUpDown size={16} />
                    </button>
                  </div>
                </div>

                {/* Explicit routing trigger button to resolve text inputs automatically */}
                {(!startPlace || !endPlace) && (startQuery.trim() || endQuery.trim()) && (
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      setIsSearchingStart(true);
                      setIsSearchingEnd(true);
                      
                      let resolvedStart = startPlace;
                      let resolvedEnd = endPlace;

                      if (!resolvedStart && startQuery.trim()) {
                        const results = await searchPlacesInVietnam(startQuery);
                        if (results.length > 0) {
                          resolvedStart = results[0];
                          onSetStartPoint(resolvedStart);
                          setStartQuery(resolvedStart.display_name);
                        }
                      }

                      if (!resolvedEnd && endQuery.trim()) {
                        const results = await searchPlacesInVietnam(endQuery);
                        if (results.length > 0) {
                          resolvedEnd = results[0];
                          onSetEndPoint(resolvedEnd);
                          setEndQuery(resolvedEnd.display_name);
                        }
                      }

                      setIsSearchingStart(false);
                      setIsSearchingEnd(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-2.5 px-4 rounded-xl shadow transition-all text-center flex items-center justify-center space-x-1.5 cursor-pointer mt-1"
                  >
                    <span>Tìm tuyến đường</span>
                  </button>
                )}

                {/* If route is missing, friendly guide */}
                {(!startPlace || !endPlace) && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-xs flex items-start space-x-2 mt-1">
                    <Info size={14} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="leading-normal">
                      Hãy nhập cả điểm xuất phát và điểm đến hoặc nhấp chuột phải trên bản đồ để chọn nhanh vị trí. Bạn có thể nhấn Enter hoặc nút "Tìm tuyến đường" để tự động nhận dạng.
                    </p>
                  </div>
                )}
              </div>

              {/* Calculated Route Details */}
              {route && (
                <div className="space-y-4">
                  {/* Route Summary Card */}
                  <div className="bg-emerald-800 dark:bg-emerald-950 text-white rounded-2xl p-4 shadow-md space-y-2">
                    <span className="text-[10px] font-bold tracking-widest bg-emerald-700 dark:bg-emerald-900 px-2 py-0.5 rounded font-mono uppercase">
                      TUYẾN ĐƯỜNG TỐI ƯU
                    </span>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-3xl font-extrabold tracking-tight font-sans">
                        {formatDuration(route.duration)}
                      </span>
                      <span className="text-emerald-200 dark:text-emerald-300 text-sm font-semibold">
                        ({formatDistance(route.distance)})
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100 dark:text-emerald-200 flex items-center">
                      <Navigation size={12} className="mr-1 rotate-45 fill-white dark:fill-emerald-200 shrink-0" />
                      Lộ trình qua {route.steps.length} nút giao thông chính
                    </p>
                    <div className="pt-1.5 flex flex-col space-y-2">
                      <button
                        onClick={onStartNavigation}
                        className="w-full bg-white text-emerald-800 hover:bg-emerald-50 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all text-center flex items-center justify-center space-x-2 cursor-pointer border border-transparent hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Navigation size={14} className="fill-emerald-800 text-emerald-800 animate-pulse rotate-45" />
                        <span>Bắt đầu khởi hành</span>
                      </button>
                      <button
                        onClick={onClearRoute}
                        className="w-full bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-100 font-medium text-xs py-2 px-3 rounded-xl border border-white/10 transition-all text-center flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <X size={13} />
                        <span>Xóa tuyến đường</span>
                      </button>
                    </div>
                  </div>

                  {/* Step-by-Step Instructions */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center">
                      <Route size={12} className="mr-1.5 text-emerald-600" />
                      Chi tiết hành trình
                    </h4>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {route.steps.map((step, index) => {
                        const instruction = getVietnameseInstruction(step);
                        return (
                          <div
                            key={index}
                            className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-800 p-3 rounded-xl flex items-start space-x-3 transition-colors"
                          >
                            <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 mt-0.5">
                              {getManeuverIcon(step.maneuver.modifier)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-normal">
                                {instruction}
                              </p>
                              {step.distance > 0 && (
                                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1">
                                  Sau {formatDistance(step.distance)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>


      </div>
    </>
  );
}
