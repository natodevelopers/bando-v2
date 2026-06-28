/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MapLayerType {
  STREETS = 'streets',
  DARK = 'dark',
  HYBRID_SATELLITE = 'hybrid'
}

export interface GeocodingPlace {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    amenity?: string;
    road?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
    [key: string]: string | undefined;
  };
  boundingbox: string[];
}

export interface RouteStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    instruction?: string;
    location: [number, number]; // [lon, lat]
  };
}

export interface RouteData {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lon, lat][]
  };
  distance: number; // in meters
  duration: number; // in seconds
  steps: RouteStep[];
  startPlace: GeocodingPlace;
  endPlace: GeocodingPlace;
}

export interface MapViewState {
  center: [number, number]; // [lon, lat]
  zoom: number;
  bearing: number;
  pitch: number;
}
