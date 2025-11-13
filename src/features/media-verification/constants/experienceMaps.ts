import type { VisionWebEntity } from "@/features/media-verification/api/google-vision";

export type CoordinatePair = [number, number];

export interface MapViewport {
  center?: CoordinatePair;
  wkid?: number;
  level?: number;
}

export interface ExperienceWebMap {
  id: string;
  title: string;
  description: string;
  baseUrl: string;
  widgetId?: string;
  keywords: string[];
  /** Optional tags we can surface in the UI for filtering later. */
  tags?: string[];
}

export interface ExperienceMapMatch {
  map: ExperienceWebMap;
  score: number;
  matchedTerms: string[];
}

export const DEFAULT_CANADA_VIEWPORT: MapViewport = {
  center: [-106.3468, 56.1304],
  wkid: 4326,
  level: 11,
};

const sanitizeBaseUrl = (url: string): string => {
  const hashIndex = url.indexOf("#");
  return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
};

const formatHashValue = (value: string | number): string => encodeURIComponent(String(value));

export const buildExperienceUrl = (map: ExperienceWebMap, viewport: MapViewport = DEFAULT_CANADA_VIEWPORT): string => {
  const params: string[] = [];
  const widgetId = map.widgetId ?? "map_1";

  if (viewport.center) {
    const wkid = viewport.wkid ?? 4326;
    const [x, y] = viewport.center;
    const centerValue = `${x},${y},${wkid}`;
    params.push(`center:${formatHashValue(centerValue)}`);
  }

  if (typeof viewport.level === "number") {
    params.push(`level:${formatHashValue(viewport.level)}`);
  }

  if (params.length === 0) {
    return sanitizeBaseUrl(map.baseUrl);
  }

  return `${sanitizeBaseUrl(map.baseUrl)}#${widgetId}=${params.join(",")}`;
};

export const EXPERIENCE_WEB_MAPS: ExperienceWebMap[] = [
  {
    id: "wildland-fires",
    title: "Wildland Fires (Canada)",
    description:
      "Bilingual experience highlighting current wildland fire activity, hotspots, and situational layers curated by Public Safety Canada.",
    baseUrl:
      "https://experience.arcgis.com/experience/2a458732ad5a437bb4e0034064ab3907/page/Wildland-Fires-Webmap-%2F-Carte-Web-des-feux-de-v%C3%A9g%C3%A9tation?views=Layers&org=PSCanada",
    widgetId: "widget_49",
    keywords: ["wildfire", "forest fire", "wildland fire", "smoke", "burn", "fire", "hotspot", "tree"],
    tags: ["hazards", "fires"],
  },
  {
    id: "federal-properties",
    title: "Government of Canada Properties",
    description: "Inventory of federal properties to cross-reference facilities, ownership, and proximity context.",
    baseUrl:
      "https://experience.arcgis.com/experience/09e1167ed85d4bee8bc47a30d235bf8b/page/Government-of-Canada-Properties-%2F-Propri%C3%A9t%C3%A9s-du-gouvernement-du-Canada-?views=Layers&org=PSCanada",
    keywords: ["building", "facility", "government property", "infrastructure", "campus", "office"],
    tags: ["infrastructure", "properties"],
  },
  {
    id: "critical-infrastructure",
    title: "National Critical Infrastructure",
    description: "Critical infrastructure layers including utilities, transportation corridors, and key assets.",
    baseUrl:
      "https://experience.arcgis.com/experience/51205886ce3143db92629244ddd3274a/page/Infrastructure?views=Layers&org=PSCanada",
    keywords: ["infrastructure", "bridge", "pipeline", "power", "utility", "rail", "road"],
    tags: ["infrastructure"],
  },
  {
    id: "tropical-cyclones",
    title: "Tropical Cyclones Monitor",
    description: "Atlantic and global tropical cyclone tracking layers with forecasted paths.",
    baseUrl:
      "https://experience.arcgis.com/experience/f4a3c8bdb5c0438681f31574c272fb77/page/Tropical-Cyclones-%2F-Cyclones-tropicaux?views=Layers",
    keywords: ["hurricane", "cyclone", "typhoon", "tropical storm", "storm", "wind"],
    tags: ["hazards", "weather"],
  },
  {
    id: "earthquakes",
    title: "Earthquake Situational Awareness",
    description: "Recent seismic activity with intensity contours and impact layers.",
    baseUrl:
      "https://experience.arcgis.com/experience/030aa146b1994eacbc8ec61ecf84d515/page/Earthquake-%2F-Tremblement-de-terre?views=Layers",
    keywords: ["earthquake", "seismic", "tremor", "fault", "aftershock", "quake"],
    tags: ["hazards", "seismic"],
  },
];

const normalizeTerm = (term: string): string => term.trim().toLowerCase();

const getSearchTerms = (entities: VisionWebEntity[] = [], bestGuesses: string[] = []): string[] => {
  const fromEntities = entities
    .map((entity) => entity.description)
    .filter((description): description is string => typeof description === "string" && description.trim().length > 0);

  return [...fromEntities, ...bestGuesses]
    .map((term) => normalizeTerm(term))
    .filter((term, index, array) => term.length > 0 && array.indexOf(term) === index);
};

const getMatchedTerms = (keywords: string[], searchTerms: string[]): string[] => {
  const matches = new Set<string>();

  keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeTerm(keyword);

    searchTerms.forEach((term) => {
      if (term.includes(normalizedKeyword) || normalizedKeyword.includes(term)) {
        matches.add(keyword);
      }
    });
  });

  return Array.from(matches);
};

export const rankWebMaps = (
  entities: VisionWebEntity[] | undefined,
  bestGuesses: string[] | undefined,
): ExperienceMapMatch[] => {
  const searchTerms = getSearchTerms(entities ?? [], bestGuesses ?? []);

  return EXPERIENCE_WEB_MAPS.map((map) => {
    const matchedTerms = getMatchedTerms(map.keywords, searchTerms);
    return {
      map,
      matchedTerms,
      score: matchedTerms.length,
    };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
};
