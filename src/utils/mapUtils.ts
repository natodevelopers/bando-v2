/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeocodingPlace, RouteData, RouteStep } from '../types';

// Vietnam Geographic Boundaries (including mainland and coastal regions)
// [[West (Lon), South (Lat)], [East (Lon), North (Lat)]]
export const VIETNAM_BOUNDS: [[number, number], [number, number]] = [
  [94.0, 4.5],  // SW corner: generous padding for Phu Quoc, Western borders and southern seas
  [114.5, 26.0]  // NE corner: generous padding for northern borders
];

export const VIETNAM_CENTER: [number, number] = [108.2772, 14.0583]; // [longitude, latitude]

export const DEFAULT_ZOOM = 6;

/**
 * Format meters to kilometers or meters in Vietnamese style
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Format seconds to hours and minutes in Vietnamese style
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} giây`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} phút`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} giờ`;
  }
  return `${hours} giờ ${remainingMinutes} phút`;
}

/**
 * Translate and beautify OSRM maneuvers into natural Vietnamese instructions
 */
export function getVietnameseInstruction(step: RouteStep): string {
  // If the OSRM step already has a valid instruction, we can use it, but OSRM standard
  // instructions are often in English or poorly translated. Creating a custom map provides high quality.
  const { type, modifier } = step.maneuver;
  const name = step.name ? `đường ${step.name}` : 'đường';

  let action = '';
  switch (type) {
    case 'depart':
      action = 'Khởi hành';
      break;
    case 'arrive':
      action = 'Điểm đến của bạn ở';
      break;
    case 'merge':
      action = 'Nhập làn';
      break;
    case 'fork':
      action = 'Đi theo ngả rẽ';
      break;
    case 'on ramp':
      action = 'Đi vào đường nhánh';
      break;
    case 'off ramp':
      action = 'Rẽ ra đường nhánh';
      break;
    case 'continue':
      action = 'Tiếp tục đi thẳng';
      break;
    case 'new name':
      action = 'Đi tiếp vào';
      break;
    case 'roundabout':
      action = 'Đi vào vòng xuyến';
      break;
    case 'turn':
    default:
      action = 'Rẽ';
      break;
  }

  let direction = '';
  if (modifier) {
    switch (modifier) {
      case 'left':
        direction = 'trái';
        break;
      case 'right':
        direction = 'phải';
        break;
      case 'sharp left':
        direction = 'gắt bên trái';
        break;
      case 'sharp right':
        direction = 'gắt bên phải';
        break;
      case 'slight left':
        direction = 'chếch sang trái';
        break;
      case 'slight right':
        direction = 'chếch sang phải';
        break;
      case 'straight':
        direction = 'đi thẳng';
        break;
      case 'uturn':
        direction = 'quay đầu';
        break;
    }
  }

  // Compose the phrase
  if (type === 'depart') {
    return `Khởi hành hướng ${direction || 'đi thẳng'} trên ${name}.`;
  }
  if (type === 'arrive') {
    return `${action} ${modifier === 'left' ? 'bên trái' : modifier === 'right' ? 'bên phải' : ''}.`;
  }
  if (type === 'roundabout') {
    return `Đi vào vòng xuyến và đi theo lối ra trên ${name}.`;
  }
  if (type === 'continue') {
    return `Tiếp tục đi thẳng trên ${name}.`;
  }

  const turnPhrase = direction ? `${action} ${direction}` : action;
  return `${turnPhrase} vào ${name}.`;
}

/**
 * Clean house number or alley/kiệt numbers from query to provide a robust fallback
 */
export function cleanAddressQuery(query: string): string | null {
  let q = query.trim();
  
  // Remove starting words like "số", "kiệt", "hẻm", "ngõ" (case-insensitive)
  q = q.replace(/^(số|kiệt|hẻm|ngõ)\s+/i, '');

  // Match house numbers or alley prefix like "21", "21/4", "K12/4", "21A", "12-14"
  // We want to match letters/digits/slashes at the very start of the string, followed by space.
  const houseNumberRegex = /^[a-zA-Z]?[0-9]+([\/\-][0-9]+[a-zA-Z]?)*/;
  
  const match = q.match(houseNumberRegex);
  if (match) {
    const matchedPrefix = match[0];
    const cleaned = q.substring(matchedPrefix.length).trim();
    if (cleaned.length >= 2) {
      return cleaned;
    }
  }
  
  return null;
}

// Normalize Vietnamese text for comparing street names and query tokens accurately
export function normalizeVietnamese(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' '); // remove punctuation
}

/**
 * Score a geocoding place against the query to prioritize exact matching numbers and streets
 */
export function scorePlace(place: GeocodingPlace, query: string): number {
  const normQuery = normalizeVietnamese(query);
  const normPlace = normalizeVietnamese(place.display_name);

  const queryWords = normQuery.split(/\s+/).filter(Boolean);
  const placeWords = normPlace.split(/\s+/).filter(Boolean);

  let score = 0;

  // Extract numeric digits from query (e.g. "9", "21")
  const queryNumbers = queryWords.filter(w => /^\d+$/.test(w));
  // Extract numeric digits from place display name
  const placeNumbers = placeWords.filter(w => /^\d+$/.test(w));

  // If query specifies numbers, check if they exist in place
  for (const qNum of queryNumbers) {
    if (placeNumbers.includes(qNum)) {
      score += 15; // High reward for matching exact numbers (like street '9' or house number '21')
    } else {
      score -= 3; // Penalty if query number is missing
    }
  }

  // Check for mismatched numbers
  // e.g., if place is "Phong Bắc 20" (contains "20") but query had "21" and "9" (neither is "20")
  if (queryNumbers.length > 0) {
    for (const pNum of placeNumbers) {
      if (!queryNumbers.includes(pNum)) {
        if (pNum.length < 5) { // don't penalize postal codes which are usually 5-6 digits
          score -= 10; // Heavy penalty for having a completely different number (mismatch)
        }
      }
    }
  }

  // Textual overlap matching
  let matchedWords = 0;
  for (const qWord of queryWords) {
    if (placeWords.includes(qWord)) {
      matchedWords++;
    }
  }
  score += (matchedWords / queryWords.length) * 8;

  // Substring boost
  if (normPlace.includes(normQuery)) {
    score += 10;
  }

  return score;
}

/**
 * Generate intelligent query variations to better handle specific local business names,
 * regional vernacular, and English/Vietnamese combinations like "Romance Hotel in Huế" or "Homestay Phú Thường Beach".
 */
export function getSearchQueries(query: string): string[] {
  const queries = [query.trim()];

  // 1. Handle English preposition " in " (e.g., "Romance Hotel in Huế" -> "Romance Hotel Huế")
  if (/\bin\b/i.test(query)) {
    queries.push(query.replace(/\bin\b/gi, '').replace(/\s+/g, ' ').trim());
    queries.push(query.replace(/\bin\b/gi, ',').replace(/\s+/g, ' ').trim());
  }

  // 2. Map common English regional tourist terms to Vietnamese and vice-versa
  let vnQuery = query;
  const terms: { [key: string]: string } = {
    'hotel': 'khách sạn',
    'homestay': 'homestay',
    'beach': 'bãi biển',
    'restaurant': 'nhà hàng',
    'cafe': 'cà phê',
    'café': 'cà phê',
    'bridge': 'cầu',
    'pagoda': 'chùa',
    'temple': 'đền',
    'market': 'chợ',
    'airport': 'sân bay',
    'station': 'ga',
    'hospital': 'bệnh viện',
    'university': 'trường đại học',
    'school': 'trường',
    'park': 'công viên'
  };

  let replaced = false;
  for (const [eng, vn] of Object.entries(terms)) {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    if (regex.test(vnQuery)) {
      vnQuery = vnQuery.replace(regex, vn);
      replaced = true;
    }
  }

  if (replaced) {
    queries.push(vnQuery.trim());
    // Try without "in" on the translated version too
    if (/\bin\b/i.test(vnQuery)) {
      queries.push(vnQuery.replace(/\bin\b/gi, '').replace(/\s+/g, ' ').trim());
    }
  }

  // 3. Fallback to cleanAddressQuery if it yields a valid alternate string
  const fallback = cleanAddressQuery(query);
  if (fallback) {
    queries.push(fallback);
  }

  // De-duplicate and filter short queries
  return Array.from(new Set(queries.map(q => q.trim()))).filter(q => q.length >= 2);
}

/**
 * Nominatim Geocoding API Search helper for Vietnam
 */
export async function searchPlacesInVietnam(query: string): Promise<GeocodingPlace[]> {
  if (!query || query.trim().length < 2) return [];
  
  const fetchWithUrl = async (qString: string) => {
    // Add viewbox bounding box for Vietnam to prioritize/bias the results correctly
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      qString
    )}&countrycodes=vn&viewbox=102.1,8.1,109.5,23.4&bounded=0&limit=15&accept-language=vi,en&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Bando-Vietnam-Maps-Clone/1.0 (developers.nato@gmail.com)'
      }
    });
    
    if (!response.ok) throw new Error('Search request failed');
    return await response.json() as GeocodingPlace[];
  };

  try {
    const queriesToTry = getSearchQueries(query);
    
    // Execute Nominatim requests in parallel for all query variations to maximize matches
    const allResultsArrays = await Promise.all(
      queriesToTry.map(q => fetchWithUrl(q).catch(() => [] as GeocodingPlace[]))
    );

    // Flatten and de-duplicate by place_id
    const combined: GeocodingPlace[] = [];
    for (const results of allResultsArrays) {
      for (const place of results) {
        if (!combined.some(r => r.place_id === place.place_id)) {
          combined.push(place);
        }
      }
    }

    // Score all results and sort descending by their custom score
    combined.sort((a, b) => {
      const scoreA = scorePlace(a, query);
      const scoreB = scorePlace(b, query);
      return scoreB - scoreA;
    });

    return combined;
  } catch (error) {
    console.error('Error fetching places:', error);
    return [];
  }
}

/**
 * Nominatim Reverse Geocoding API helper
 */
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodingPlace | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=vi&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Bando-Vietnam-Maps-Clone/1.0 (developers.nato@gmail.com)'
      }
    });
    
    if (!response.ok) throw new Error('Reverse geocoding failed');
    return await response.json();
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * OSRM Routing API helper
 */
export async function fetchRoute(
  start: GeocodingPlace,
  end: GeocodingPlace
): Promise<RouteData | null> {
  try {
    const startLon = parseFloat(start.lon);
    const startLat = parseFloat(start.lat);
    const endLon = parseFloat(end.lon);
    const endLat = parseFloat(end.lat);

    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Routing request failed');
    
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) return null;
    
    const route = data.routes[0];
    
    // Parse OSRM steps
    const rawSteps = route.legs?.[0]?.steps || [];
    const steps: RouteStep[] = rawSteps.map((s: any) => ({
      name: s.name || '',
      distance: s.distance || 0,
      duration: s.duration || 0,
      maneuver: {
        type: s.maneuver?.type || 'turn',
        modifier: s.maneuver?.modifier || '',
        instruction: s.maneuver?.instruction || '',
        location: s.maneuver?.location || [0, 0]
      }
    }));

    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      steps,
      startPlace: start,
      endPlace: end
    };
  } catch (error) {
    console.error('Error fetching route:', error);
    return null;
  }
}
