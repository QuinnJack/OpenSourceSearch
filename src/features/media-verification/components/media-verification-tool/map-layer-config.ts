import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, MultiPolygon, Point, Polygon } from "geojson";
import { XMLParser } from "fast-xml-parser";

import type { SelectItemType } from "@/components/ui/select/select";

export type ViewType = "general" | "wildfires" | "hurricanes" | "infrastructure" | "population";

export const VIEW_TYPE_OPTIONS: SelectItemType[] = [
  { id: "general", label: "General" },
  { id: "wildfires", "label": "Wildfires" },
  { id: "hurricanes", label: "Hurricanes" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "population", label: "Population" },
];



export type MapBounds = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

interface MapLayerBaseConfig {
  id: string;
  label: string;
  description: string;
  viewTypes: ViewType[];
  colorHex?: string;
  hoverColorHex?: string;
}

export interface DataMapLayerConfig<TData = unknown> extends MapLayerBaseConfig {
  kind: "data";
  fetcher: (context: { signal: AbortSignal; bbox?: MapBounds | null }) => Promise<TData[]>;
}

export interface CameraLayerConfig extends MapLayerBaseConfig {
  kind: "camera";
}

export interface PlaceholderLayerConfig extends MapLayerBaseConfig {
  kind: "placeholder";
}

export type MapLayerConfig = DataMapLayerConfig | CameraLayerConfig | PlaceholderLayerConfig;

const DOB_INCIDENTS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/DOB_Incidents_public/FeatureServer/0/query?f=json&where=1%3D1&outFields=*&returnGeometry=true&spatialRel=esriSpatialRelIntersects";
const ACTIVE_WILDFIRES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/cwfis_active_fires_updated_view/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const FIRE_DANGER_URL =
  "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=public:fdr_current_shp&outputFormat=json&srsName=EPSG:4326";
const PERIMETERS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/perimeters/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const AERODROMES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/Aerodromes/FeatureServer/6/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const RAILWAYS_URL =
  "https://services.arcgis.com/zmLUiqh7X11gGV2d/ArcGIS/rest/services/Canada_National_Railway_System_FEB2020/FeatureServer/6/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const HIGHWAYS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/highways_merged/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const RECENT_HURRICANES_URL =
  "https://rhvpkkiftonktxq3.svcs9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Recent_Hurricanes_v1/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const HYDROMETRIC_STATIONS_URL =
  "https://services.arcgis.com/lGOekm0RsNxYnT3j/ArcGIS/rest/services/Hydrometric_Stations/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const BUILDING_FOOTPRINTS_URL =
  "https://idgsi-rpgdi-arcgis.spac-pspc.gc.ca/gisserver/rest/services/Hosted/DFRP_PUBLIC/FeatureServer/3/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const PROPERTY_BOUNDARIES_URL =
  "https://idgsi-rpgdi-arcgis.spac-pspc.gc.ca/gisserver/rest/services/Hosted/DFRP_PUBLIC/FeatureServer/4/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const INDIGENOUS_LAND_BOUNDARIES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Aboriginal_Lands_Boundaries_INAC/FeatureServer/0/query?where=1%3D1&fullText=&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset={offset}&resultRecordCount={recordCount}&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=geojson&token=";
const INUIT_COMMUNITIES_URL =
  "https://data.sac-isc.gc.ca/geomatics/rest/services/Donnees_Ouvertes-Open_Data/Communaute_inuite_Inuit_Community/MapServer/0/query?where=1%3D1&text=&objectIds=&time=&timeRelation=esriTimeRelationOverlaps&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&returnExtentOnly=false&sqlFormat=none&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&uniqueIds=&returnUniqueIdsOnly=false&featureEncoding=esriDefault&f=geojson";
const CENSUS_2021_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Census_2021_Population_by_Dissemination_Area/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson";
const SOURCES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/survey123_49a2b7c731a241faa4f8309496dc794c_results/FeatureServer/0/query?where=1%3D1&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const CHC_RESPONSE_ZONE_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/CHC_response_zone/FeatureServer/0/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const WEATHER_ALERTS_URL =
  "https://services.arcgis.com/wjcPoefzjpzCgffS/ArcGIS/rest/services/Environment_Canada_Weather_Alerts___Test/FeatureServer/0/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const GEOMET_WFS_BASE_URL = "https://geo.weather.gc.ca/geomet";
const HURRICANE_WFS_LAYER_NAMES = {
  centers: "HURRICANE_CENTRE",
  tracks: "HURRICANE_LINE",
  error: "HURRICANE_ERR",
  wind: "HURRICANE_RAD",
} as const;
const MAX_WEB_MERCATOR_EXTENT = 20037508.34;
const POINT_OF_ENTRY_BASE_URL = "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/Point_of_Entry/FeatureServer";
const POINT_OF_ENTRY_LAYERS: Array<{ id: number; type: BorderEntryType }> = [
  { id: 0, type: "air" },
  { id: 1, type: "crossing" },
  { id: 2, type: "land" },
];

const DOB_STATUS_LABELS: Record<string, string> = {
  "1": "Open",
  "2": "Closed",
  "3": "Inactive",
  "4": "Resolved",
  "5": "Upcoming",
};

const WILDFIRE_STAGE_LABELS: Record<string, string> = {
  UC: "Under Control",
  BH: "Being Held",
  OC: "Out of Control",
  NW: "Not Yet Under Control",
};

const WILDFIRE_RESPONSE_LABELS: Record<string, string> = {
  FUL: "Full Response",
  MOD: "Modified Response",
  MON: "Monitor Response",
};

export interface DobIncidentFeature {
  id: string;
  title: string;
  description: string;
  location: string;
  status: string;
  categoryCode: string | null;
  scope: string | null;
  approved: string | null;
  longitude: number;
  latitude: number;
  attributes: Record<string, unknown>;
}

export interface WildfireFeature {
  id: string;
  agency: string;
  name: string;
  longitude: number;
  latitude: number;
  hectares: number | null;
  stageOfControl: string;
  responseType: string;
  startDate: string | null;
  timezone: string | null;
}

export type FireDangerLevel = "low" | "moderate" | "high" | "very-high" | "extreme" | "nil";

export interface FireDangerFeature {
  id: string;
  uid: number | null;
  hcount: number | null;
  area: number | null;
  firstDate: string | null;
  lastDate: string | null;
  consisId: number | null;
  dangerLevel: FireDangerLevel | null;
  dangerLabel: string | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface PerimeterFeature {
  id: string;
  fid: number | null;
  uid: number | null;
  hcount: number | null;
  area: number | null;
  firstDate: string | null;
  lastDate: string | null;
  consisId: number | null;
  shapeArea: number | null;
  shapeLength: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface AerodromeFeature {
  id: string;
  icao: string | null;
  name: string | null;
  elevation: number | null;
  elevationUnit: string | null;
  organisation: string | null;
  latitude: number;
  longitude: number;
  province: string | null;
  runwayNumbers: string | null;
  facilityType: string | null;
  surfaceType: string | null;
  lightingType: string | null;
  lightingIntensity: string | null;
  properties: Record<string, unknown>;
}

export interface RailwayFeature {
  id: string;
  name: string | null;
  classLabel: string | null;
  regulator: string | null;
  status: string | null;
  useType: string | null;
  gauge: string | null;
  numTracks: number | null;
  speedFreight: number | null;
  speedPassenger: number | null;
  length: number | null;
  center: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface HighwayFeature {
  id: string;
  name: string | null;
  province: string | null;
  length: number | null;
  center: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export type HurricaneFeatureType = "center" | "track" | "error-cone" | "wind-radius";

interface HurricaneFeatureBase {
  id: string;
  stormName: string | null;
  active: boolean | null;
  timestamp: string | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface HurricaneQuadrantRadii {
  ne: number | null;
  se: number | null;
  sw: number | null;
  nw: number | null;
}

export interface HurricaneCenterFeature extends HurricaneFeatureBase {
  featureType: "center";
  geometry: Point;
  stormType: string | null;
  basin: string | null;
  advisoryDate: string | null;
  validTime: string | null;
  timezone: string | null;
  tau: string | null;
  stormForce: string | null;
  maxWind: number | null;
  meanSeaLevelPressure: number | null;
  development: string | null;
  errorConeLabel: string | null;
  radii34: HurricaneQuadrantRadii;
  radii48: HurricaneQuadrantRadii;
  radii64: HurricaneQuadrantRadii;
}

export interface HurricaneTrackFeature extends HurricaneFeatureBase {
  featureType: "track";
  geometry: LineString | MultiLineString;
  stormType: string | null;
  basin: string | null;
}

export interface HurricaneErrorFeature extends HurricaneFeatureBase {
  featureType: "error-cone";
  geometry: Polygon | MultiPolygon;
}

export interface HurricaneWindRadiusFeature extends HurricaneFeatureBase {
  featureType: "wind-radius";
  geometry: Polygon | MultiPolygon;
  windForce: string | null;
  validTime: string | null;
}

export type HurricaneFeature =
  | HurricaneCenterFeature
  | HurricaneTrackFeature
  | HurricaneErrorFeature
  | HurricaneWindRadiusFeature;

export interface RecentHurricaneFeature {
  id: string;
  stormName: string | null;
  stormType: string | null;
  basin: string | null;
  intensity: number | null;
  pressure: number | null;
  advisoryTimestamp: string | null;
  tau: number | null;
  category: number | null;
  longitude: number;
  latitude: number;
  geometry: Point;
  properties: Record<string, unknown>;
}

export interface HydrometricStationFeature {
  id: string;
  stationNumber: string | null;
  stationName: string | null;
  region: string | null;
  currentLevel: number | null;
  currentFlow: number | null;
  levelChange: number | null;
  flowChange: number | null;
  levelPercentile: string | null;
  flowPercentile: string | null;
  lastUpdate: string | null;
  url: string | null;
  longitude: number;
  latitude: number;
  properties: Record<string, unknown>;
}

export interface BuildingFootprintFeature {
  id: string;
  structureNumber: string | null;
  propertyNumber: string | null;
  parcelNumber: string | null;
  nameEn: string | null;
  nameFr: string | null;
  custodianEn: string | null;
  custodianFr: string | null;
  interestEn: string | null;
  interestFr: string | null;
  addressEn: string | null;
  addressFr: string | null;
  municipalityEn: string | null;
  municipalityFr: string | null;
  provinceEn: string | null;
  provinceFr: string | null;
  floorAreaSqm: number | null;
  constructionYear: string | null;
  conditionEn: string | null;
  conditionFr: string | null;
  useEn: string | null;
  useFr: string | null;
  security: string | null;
  securite: string | null;
  structureLinkEn: string | null;
  structureLinkFr: string | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface PropertyBoundaryFeature {
  id: string;
  propertyNumber: string | null;
  parcelNumber: string | null;
  nameEn: string | null;
  nameFr: string | null;
  custodianEn: string | null;
  custodianFr: string | null;
  interestEn: string | null;
  interestFr: string | null;
  addressEn: string | null;
  addressFr: string | null;
  municipalityEn: string | null;
  municipalityFr: string | null;
  provinceEn: string | null;
  provinceFr: string | null;
  landAreaHa: number | null;
  buildingCount: number | null;
  floorAreaSqm: number | null;
  primaryUseEn: string | null;
  primaryUseFr: string | null;
  districtEn: string | null;
  districtFr: string | null;
  propertyLinkEn: string | null;
  propertyLinkFr: string | null;
  security: string | null;
  securite: string | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface IndigenousLandBoundaryFeature {
  id: string;
  fid: number | null;
  acquisitionTechnique: string | null;
  metaCoverage: string | null;
  createdDate: string | null;
  revisedDate: string | null;
  accuracy: number | null;
  provider: string | null;
  datasetName: string | null;
  specVersion: string | null;
  nid: string | null;
  alCode: string | null;
  names: Array<{ language: string | null; name: string | null }>;
  jurisdictions: string[];
  webReference: string | null;
  shapeArea: number | null;
  shapeLength: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface SourceLayerFeature {
  id: string;
  objectId: number | null;
  globalId: string | null;
  creationDate: unknown;
  creator: string | null;
  editDate: unknown;
  editor: string | null;
  sourceName: string | null;
  reportingCriteria: string[];
  reportingCriteriaOther: string | null;
  region: string | null;
  sourceType: string | null;
  scope: string | null;
  linkToSource: string | null;
  comments: string | null;
  exceptionalSource: string | null;
  latitude: number;
  longitude: number;
  tags: string[];
  tagOther: string | null;
  properties: Record<string, unknown>;
}

export interface EnvironmentCanadaWeatherAlertFeature {
  id: string;
  polyId: number | null;
  zoneCode: string | null;
  featureId: string | null;
  nameEn: string | null;
  nameFr: string | null;
  alertType: string | null;
  alertNameEn: string | null;
  alertNameFr: string | null;
  alertDescriptionEn: string | null;
  alertDescriptionFr: string | null;
  urgency: string | null;
  effectiveDate: unknown;
  expireDate: unknown;
  websiteUrl: string | null;
  provinceCode: string | null;
  countryCode: string | null;
  alertRiskColorCode: string | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface CHCResponseZoneFeature {
  id: string;
  geometry: Geometry;
  centroid: { longitude: number; latitude: number } | null;
  properties: Record<string, unknown>;
}

export type BorderEntryType = "air" | "land" | "crossing";

export interface BorderEntryFeature {
  id: string;
  name: string;
  code?: string;
  region?: string;
  province?: string;
  address?: string;
  postalCode?: string;
  place?: string;
  longitude: number;
  latitude: number;
  entryType: BorderEntryType;
  url?: string;
}

export interface InuitCommunityFeature {
  id: string;
  identifier: string | null;
  name: string | null;
  nameInuktitut: string | null;
  traditionalName: string | null;
  traditionalNameMeaningEn: string | null;
  traditionalNameMeaningFr: string | null;
  region: string | null;
  regionInuktitut: string | null;
  population: number | null;
  postalAddressEn: string | null;
  postalAddressFr: string | null;
  postalCode: string | null;
  provinceCode: string | null;
  phone: string | null;
  fax: string | null;
  website: string | null;
  memberParliamentEn: string | null;
  memberParliamentFr: string | null;
  memberLegislativeEn: string | null;
  memberLegislativeFr: string | null;
  landClaimOrgName: string | null;
  landClaimOrgAddressEn: string | null;
  landClaimOrgAddressFr: string | null;
  landClaimOrgCity: string | null;
  landClaimOrgProvinceCode: string | null;
  landClaimOrgPostalCode: string | null;
  landClaimOrgPhone: string | null;
  landClaimOrgWebsite: string | null;
  otherLinks: string | null;
  communityBackgroundEn: string | null;
  communityBackgroundFr: string | null;
  longitude: number | null;
  latitude: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface Census2021DisseminationAreaFeature {
  id: string;
  dauid: string;
  daugid: string;
  landArea: number;
  prUid: string;
  prName: string;
  geoName: string;
  popCount: number;
  privateDwellings: number;
  totalPrivateDwellings: number;
  popDensity: number;
  geometry: Geometry;
  centroid: { longitude: number; latitude: number } | null;
  properties: Record<string, unknown>;
}



const convertWebMercatorToLngLat = (x?: number, y?: number) => {
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  const longitude = (x / MAX_WEB_MERCATOR_EXTENT) * 180;
  let latitude = (y / MAX_WEB_MERCATOR_EXTENT) * 180;
  latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);
  return { longitude, latitude };
};

const normalizeDobIncidents = (features: Array<{ attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }>) => {
  return (
    features
      ?.map((feature, index) => {
        if (!feature?.attributes) {
          return null;
        }
        const coords = convertWebMercatorToLngLat(feature.geometry?.x, feature.geometry?.y);
        if (!coords) {
          return null;
        }
        const statusValue = (feature.attributes.display_status ?? feature.attributes.Status) as string | undefined;
        const statusLabel = (() => {
          if (!statusValue) {
            return "Unknown";
          }
          const trimmed = String(statusValue).trim();
          return DOB_STATUS_LABELS[trimmed] ?? trimmed;
        })();
        return {
          id: String(
            feature.attributes.GlobalID ??
            feature.attributes.OBJECTID ??
            feature.attributes.display_IncidentNum ??
            feature.attributes.IncidentNum ??
            `incident-${index}`,
          ),
          title: String(feature.attributes.display_Title_EN ?? feature.attributes.Title_EN ?? "Untitled"),
          description: String(feature.attributes.display_Description_EN ?? feature.attributes.Description_EN ?? ""),
          location: String(feature.attributes.display_location ?? feature.attributes.Location ?? "Unknown location"),
          status: statusLabel,
          categoryCode: typeof feature.attributes.display_IncidentCat === "string" ? feature.attributes.display_IncidentCat : null,
          scope: typeof feature.attributes.display_Scope === "string" ? feature.attributes.display_Scope : null,
          approved: typeof feature.attributes.Approved === "string" ? feature.attributes.Approved : null,
          longitude: coords.longitude,
          latitude: coords.latitude,
          attributes: feature.attributes,
        } satisfies DobIncidentFeature;
      })
      .filter((feature): feature is DobIncidentFeature => Boolean(feature))
  );
};

export const formatWildfireDate = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const formatFromEpoch = (valueIn: number) => {
    if (!Number.isFinite(valueIn)) {
      return null;
    }
    const timestamp = valueIn >= 1e12 ? valueIn : valueIn * 1000;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : formatDate(date);
  };
  if (typeof value === "number") {
    return formatFromEpoch(value);
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) {
    return null;
  }
  if (/^\d{8}$/.test(cleaned)) {
    const year = Number(cleaned.slice(0, 4));
    const month = Number(cleaned.slice(4, 6)) - 1;
    const day = Number(cleaned.slice(6, 8));
    const date = new Date(Date.UTC(year, month, day));
    return formatDate(date);
  }
  const numericCandidate = Number(cleaned);
  const epochFormatted = formatFromEpoch(numericCandidate);
  if (epochFormatted) {
    return epochFormatted;
  }
  const parsedDate = new Date(cleaned);
  if (!Number.isNaN(parsedDate.getTime())) {
    return formatDate(parsedDate);
  }
  return cleaned || null;
};

export const formatWildfireArea = (value?: number | null, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits ?? (value < 10 ? 1 : 0),
    maximumFractionDigits: options?.maximumFractionDigits ?? (value < 10 ? 1 : 0),
  });
  return formatter.format(value);
};

const DEFAULT_FIRE_DANGER_PALETTE = {
  colorHex: "#94a3b8",
  hoverColorHex: "#64748b",
};

export const FIRE_DANGER_LEVEL_METADATA: Record<
  FireDangerLevel | "unknown",
  { label: string; colorHex: string; hoverColorHex: string; description: string }
> = {
  low: {
    label: "Low",
    colorHex: "#3b82f6",
    hoverColorHex: "#2563eb",
    description: "Fires likely to be self-extinguishing and new ignitions unlikely. Any existing fires limited to smoldering in deep, drier layers.",
  },
  moderate: {
    label: "Moderate",
    colorHex: "#22c55e",
    hoverColorHex: "#16a34a",
    description: "Creeping or gentle surface fires. Fires easily contained by ground crews with pumps and hand tools.",
  },
  high: {
    label: "High",
    colorHex: "#eab308",
    hoverColorHex: "#ca8a04",
    description:
      "Moderate to vigorous surface fire with intermittent crown involvement. Challenging for ground crews; heavy equipment often required.",
  },
  "very-high": {
    label: "Very High",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    description:
      "High-intensity fire with partial to full crown involvement. Head fire conditions beyond ground crews; retardant drops required for the head.",
  },
  extreme: {
    label: "Extreme",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    description:
      "Fast-spreading, high-intensity crown fire. Very difficult to control. Suppression limited to flanks with indirect action on the head.",
  },
  nil: {
    label: "Nil",
    colorHex: "#94a3b8",
    hoverColorHex: "#64748b",
    description: "No calculations were performed for this region.",
  },
  unknown: {
    label: "Fire Danger",
    colorHex: DEFAULT_FIRE_DANGER_PALETTE.colorHex,
    hoverColorHex: DEFAULT_FIRE_DANGER_PALETTE.hoverColorHex,
    description: "No fire danger metadata is available for this polygon.",
  },
};

export const CAMERA_LAYER_ID = "ottawa-cameras";

const PAGINATED_GEOJSON_BATCH_SIZE = 2000;

type PolygonalFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
type PolygonalFeatureCollection = FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>> & {
  properties?: { exceededTransferLimit?: boolean };
};
const DANGER_PROPERTY_KEYS = [
  "danger_level",
  "DANGER_LEVEL",
  "Danger_Level",
  "dangerlevel",
  "DangerLevel",
  "DANGERLEVEL",
  "danger",
  "fire_danger",
  "Fire_Danger",
  "FIREDANGER",
  "GRIDCODE",
];

const normalizeDangerString = (value?: string | null) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDangerLevelFromCode = (code?: number | string | null): FireDangerLevel | null => {
  if (code === null || code === undefined) {
    return null;
  }
  const numericCode = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(numericCode)) {
    return null;
  }
  // GRIDCODE mapping: 0=Low, 1=Moderate, 2=High, 3=Very High, 4=Extreme
  switch (numericCode) {
    case 0:
      return "low";
    case 1:
      return "moderate";
    case 2:
      return "high";
    case 3:
      return "very-high";
    case 4:
      return "extreme";
    default:
      return "nil";
  }
};

const parseDangerLevelFromString = (value?: string | null): FireDangerLevel | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("low")) return "low";
  if (normalized.startsWith("moderate") || normalized.startsWith("mod")) return "moderate";
  if (normalized.startsWith("high") && !normalized.includes("very")) return "high";
  if (normalized.startsWith("very")) return "very-high";
  if (normalized.startsWith("extreme")) return "extreme";
  if (normalized.startsWith("nil")) return "nil";
  return null;
};

const extractDangerLevelMetadata = (properties: Record<string, unknown>): { level: FireDangerLevel | null; label: string | null } => {
  // First check for GRIDCODE (numeric code from WFS)
  if (Object.prototype.hasOwnProperty.call(properties, "GRIDCODE")) {
    const gridCode = properties.GRIDCODE;
    if (typeof gridCode === "number" || typeof gridCode === "string" || gridCode === null || gridCode === undefined) {
      const level = parseDangerLevelFromCode(gridCode as number | string | null | undefined);
      if (level) {
        const label = FIRE_DANGER_LEVEL_METADATA[level].label;
        return { level, label };
      }
    }
  }
  // Fallback to text-based danger level parsing
  for (const key of DANGER_PROPERTY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const raw = properties[key];
      if (typeof raw === "string") {
        const label = normalizeDangerString(raw);
        const level = parseDangerLevelFromString(label);
        return { level, label };
      }
    }
  }
  return { level: null, label: null };
};

const fetchPaginatedArcGisGeoJson = async (baseUrl: string, signal: AbortSignal): Promise<PolygonalFeatureCollection> => {
  const features: PolygonalFeature[] = [];
  let resultOffset = 0;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("resultOffset", String(resultOffset));
    url.searchParams.set("resultRecordCount", String(PAGINATED_GEOJSON_BATCH_SIZE));

    const response = await fetch(url.toString(), { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load fire danger polygons (${response.status})`);
    }
    const data = (await response.json()) as PolygonalFeatureCollection;
    const batch = data.features;
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    features.push(...batch);

    if (!data.properties?.exceededTransferLimit) {
      break;
    }
    resultOffset += PAGINATED_GEOJSON_BATCH_SIZE;
  }

  return { type: "FeatureCollection", features };
};

const fetchBoundedArcGisGeoJson = async (
  baseUrl: string,
  signal: AbortSignal,
  bbox?: MapBounds | null,
): Promise<FeatureCollection> => {
  // If no bbox, define a default or fetch nothing (or fetch all? risky for large layers).
  // For these layers, fetching ALL is too heavy. We should fail gracefully or fetch a known extent.
  // We'll proceed without geometry filter if bbox is missing, but warn.
  let url = new URL(baseUrl);

  // Remove offset placeholders if present in specific URLs
  const cleanUrlString = url.toString().replace("resultOffset={offset}&resultRecordCount={recordCount}&", "");
  url = new URL(cleanUrlString);

  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    // ArcGIS REST API geometry param
    const geometry = `${minLng},${minLat},${maxLng},${maxLat}`;
    url.searchParams.set("geometry", geometry);
    url.searchParams.set("geometryType", "esriGeometryEnvelope");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("inSR", "4326");
  }

  // Ensure we ask for WGS84
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");

  // We rely on the server to limit results or we might implement pagination if needed,
  // but for "in view" queries usually we get a reasonable chunk.
  // Let's add a safe record count limit just in case.
  if (!url.searchParams.has("resultRecordCount")) {
    url.searchParams.set("resultRecordCount", "1000"); // Safety
  }

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Failed to load bounded GeoJSON (${response.status})`);
  }

  return (await response.json()) as FeatureCollection;
};


const formatArcGisTimestamp = (value?: string | null) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const isoCandidate = trimmed.includes("T") ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }
  return date.toLocaleString();
};

const computeGeometryCentroid = (geometry?: Geometry): { longitude: number; latitude: number } | null => {
  if (!geometry) {
    return null;
  }
  const collectCoordinates = (coords: unknown): Array<[number, number]> => {
    if (!Array.isArray(coords)) {
      return [];
    }
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      return [[coords[0], coords[1]]];
    }
    return coords.flatMap((child) => collectCoordinates(child));
  };

  const points =
    geometry.type === "GeometryCollection"
      ? geometry.geometries.flatMap((geom) => collectCoordinates((geom as Geometry & { coordinates?: unknown }).coordinates))
      : collectCoordinates((geometry as Geometry & { coordinates?: unknown }).coordinates);
  if (points.length === 0) {
    return null;
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  points.forEach(([lng, lat]) => {
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  });
  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return null;
  }
  return {
    longitude: (minLng + maxLng) / 2,
    latitude: (minLat + maxLat) / 2,
  };
};

const parseNumericField = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseStringField = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toTitleCase = (value: string) => {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const normalizeDelimitedValues = (value?: unknown): string[] => {
  const str = parseStringField(value);
  if (!str) {
    return [];
  }
  return str
    .split(",")
    .map((item) => item.trim())
    .map((item) => {
      if (!item) {
        return null;
      }
      return toTitleCase(item.replace(/_/g, " "));
    })
    .filter((item): item is string => Boolean(item));
};

const resolveWildfireStageLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Unknown status";
  }
  const normalizedKey = trimmed.replace(/\s+/g, "").toUpperCase();
  return WILDFIRE_STAGE_LABELS[normalizedKey] ?? toTitleCase(trimmed);
};

const resolveWildfireResponseLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Unknown response";
  }
  const normalizedKey = trimmed.replace(/\s+/g, "").toUpperCase();
  return WILDFIRE_RESPONSE_LABELS[normalizedKey] ?? toTitleCase(trimmed);
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

type RawWfsFeature = {
  id: string;
  geometry: Geometry | null;
  attributes: Record<string, unknown>;
};

const ensureArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
};

const readTextNode = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value !== null && "#text" in (value as Record<string, unknown>)) {
    const textValue = (value as Record<string, unknown>)["#text"];
    return typeof textValue === "string" ? textValue : null;
  }
  return null;
};

const parseNumberSequence = (text: string | null): number[] => {
  if (!text) {
    return [];
  }
  return text
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
};

const toLonLatPairs = (values: number[]): Array<[number, number]> => {
  const coords: Array<[number, number]> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const lat = values[index];
    const lon = values[index + 1];
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      coords.push([lon, lat]);
    }
  }
  return coords;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const parsePointCoordinates = (node?: Record<string, unknown>): [number, number] | null => {
  if (!node) {
    return null;
  }
  const text = readTextNode(node.pos ?? node.posList ?? node.coordinates ?? null);
  const pairs = toLonLatPairs(parseNumberSequence(text));
  if (pairs.length > 0) {
    return pairs[0];
  }
  const lat = parseNumericField((node as Record<string, unknown>).LAT ?? (node as Record<string, unknown>).lat);
  const lon = parseNumericField((node as Record<string, unknown>).LON ?? (node as Record<string, unknown>).lon);
  if (lat !== null && lon !== null) {
    return [lon, lat];
  }
  return null;
};

const parseLineStringCoordinates = (node?: Record<string, unknown>): Array<[number, number]> => {
  if (!node) {
    return [];
  }
  const text = readTextNode(node.posList ?? node.pos ?? null);
  return toLonLatPairs(parseNumberSequence(text));
};

const parseCurveCoordinates = (node?: Record<string, unknown>): Array<[number, number]> => {
  if (!node) {
    return [];
  }
  const segmentsContainer = asRecord(node.segments);
  const segmentsSource =
    segmentsContainer?.["LineStringSegment"] ??
    segmentsContainer?.["Segment"] ??
    node.segment;
  const segments = ensureArray(segmentsSource);
  const coordinates: Array<[number, number]> = [];
  segments.forEach((segment) => {
    if (!segment || typeof segment !== "object") {
      return;
    }
    const text = readTextNode((segment as Record<string, unknown>).posList ?? (segment as Record<string, unknown>).pos ?? null);
    const pairs = toLonLatPairs(parseNumberSequence(text));
    if (pairs.length === 0) {
      return;
    }
    if (coordinates.length > 0) {
      const last = coordinates[coordinates.length - 1];
      const [firstLon, firstLat] = pairs[0];
      if (last[0] === firstLon && last[1] === firstLat) {
        pairs.shift();
      }
    }
    coordinates.push(...pairs);
  });
  return coordinates;
};

const parseLinearRing = (node?: Record<string, unknown>): Array<[number, number]> => {
  if (!node) {
    return [];
  }
  const text = readTextNode(node.posList ?? node.pos ?? null);
  const coords = toLonLatPairs(parseNumberSequence(text));
  if (coords.length >= 2) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([...first]);
    }
  }
  return coords;
};

const parsePolygonCoordinates = (node?: Record<string, unknown>): Array<Array<[number, number]>> => {
  if (!node) {
    return [];
  }
  const exteriorContainer = asRecord(node.exterior);
  const exteriorNode = asRecord(exteriorContainer?.["LinearRing"]);
  const exteriorRing = exteriorNode ? parseLinearRing(exteriorNode) : [];
  const interiorRings = ensureArray(node.interior).map((interior) => {
    if (!interior || typeof interior !== "object") {
      return [];
    }
    const aInterior = asRecord(interior);
    const ringNode = asRecord(aInterior?.["LinearRing"]);
    return parseLinearRing(ringNode);
  });
  return [exteriorRing, ...interiorRings.filter((ring) => ring.length > 0)].filter((ring) => ring.length > 0);
};

const parseSurfaceCoordinates = (node?: Record<string, unknown>): Array<Array<[number, number]>> => {
  if (!node) {
    return [];
  }
  const patches = asRecord(node.patches);
  if (patches?.["PolygonPatch"]) {
    return parsePolygonCoordinates(asRecord(patches["PolygonPatch"]));
  }
  if (node.Polygon) {
    return parsePolygonCoordinates(node.Polygon as Record<string, unknown>);
  }
  return parsePolygonCoordinates(node as Record<string, unknown>);
};

const parseGmlGeometry = (geometryContainer?: Record<string, unknown>): Geometry | null => {
  if (!geometryContainer) {
    return null;
  }
  const pointNode = (geometryContainer.Point ?? geometryContainer.point) as Record<string, unknown> | undefined;
  if (pointNode) {
    const coordinates = parsePointCoordinates(pointNode);
    return coordinates ? ({ type: "Point", coordinates } as Point) : null;
  }
  const lineNode = (geometryContainer.LineString ?? geometryContainer.lineString) as Record<string, unknown> | undefined;
  if (lineNode) {
    const coordinates = parseLineStringCoordinates(lineNode);
    return coordinates.length > 0 ? ({ type: "LineString", coordinates } as LineString) : null;
  }
  const curveNode = (geometryContainer.Curve ?? geometryContainer.curve) as Record<string, unknown> | undefined;
  if (curveNode) {
    const coordinates = parseCurveCoordinates(curveNode);
    return coordinates.length > 0 ? ({ type: "LineString", coordinates } as LineString) : null;
  }
  const multiCurveNode = (geometryContainer.MultiCurve ?? geometryContainer.multiCurve) as Record<string, unknown> | undefined;
  if (multiCurveNode) {
    const curveMembers = ensureArray(multiCurveNode.curveMember);
    const coordinates = curveMembers
      .map((member) => {
        if (!member || typeof member !== "object") {
          return null;
        }
        const memberCurve = (member as Record<string, unknown>).Curve as Record<string, unknown> | undefined;
        const memberLine = (member as Record<string, unknown>).LineString as Record<string, unknown> | undefined;
        if (memberCurve) {
          const curveCoords = parseCurveCoordinates(memberCurve);
          return curveCoords.length > 0 ? curveCoords : null;
        }
        if (memberLine) {
          const lineCoords = parseLineStringCoordinates(memberLine);
          return lineCoords.length > 0 ? lineCoords : null;
        }
        return null;
      })
      .filter((coords): coords is Array<[number, number]> => Boolean(coords));
    if (coordinates.length > 0) {
      return { type: "MultiLineString", coordinates };
    }
  }
  const multiLineNode = (geometryContainer.MultiLineString ?? geometryContainer.multiLineString) as Record<string, unknown> | undefined;
  if (multiLineNode) {
    const lineMembers = ensureArray(multiLineNode.lineStringMember);
    const coordinates = lineMembers
      .map((member) => {
        if (!member || typeof member !== "object") {
          return null;
        }
        const lineNodeMember = (member as Record<string, unknown>).LineString as Record<string, unknown> | undefined;
        if (!lineNodeMember) {
          return null;
        }
        const lineCoords = parseLineStringCoordinates(lineNodeMember);
        return lineCoords.length > 0 ? lineCoords : null;
      })
      .filter((coords): coords is Array<[number, number]> => Boolean(coords));
    if (coordinates.length > 0) {
      return { type: "MultiLineString", coordinates };
    }
  }
  const polygonNode = (geometryContainer.Polygon ?? geometryContainer.polygon) as Record<string, unknown> | undefined;
  if (polygonNode) {
    const rings = parsePolygonCoordinates(polygonNode);
    return rings.length > 0 ? ({ type: "Polygon", coordinates: rings } as Polygon) : null;
  }
  const surfaceNode = (geometryContainer.Surface ?? geometryContainer.surface) as Record<string, unknown> | undefined;
  if (surfaceNode) {
    const rings = parseSurfaceCoordinates(surfaceNode);
    return rings.length > 0 ? ({ type: "Polygon", coordinates: rings } as Polygon) : null;
  }
  const multiSurfaceNode = (geometryContainer.MultiSurface ?? geometryContainer.multiSurface) as Record<string, unknown> | undefined;
  if (multiSurfaceNode) {
    const surfaceMembers = ensureArray(multiSurfaceNode.surfaceMember);
    const polygons = surfaceMembers
      .map((member) => {
        if (!member || typeof member !== "object") {
          return null;
        }
        const surface = (member as Record<string, unknown>).Surface as Record<string, unknown> | undefined;
        const polygon = (member as Record<string, unknown>).Polygon as Record<string, unknown> | undefined;
        if (surface) {
          const rings = parseSurfaceCoordinates(surface);
          return rings.length > 0 ? rings : null;
        }
        if (polygon) {
          const rings = parsePolygonCoordinates(polygon);
          return rings.length > 0 ? rings : null;
        }
        return null;
      })
      .filter((rings): rings is Array<Array<[number, number]>> => Boolean(rings));
    if (polygons.length > 0) {
      return { type: "MultiPolygon", coordinates: polygons };
    }
  }
  const multiPolygonNode = (geometryContainer.MultiPolygon ?? geometryContainer.multiPolygon) as Record<string, unknown> | undefined;
  if (multiPolygonNode) {
    const polygonMembers = ensureArray(multiPolygonNode.polygonMember);
    const polygons = polygonMembers
      .map((member) => {
        if (!member || typeof member !== "object") {
          return null;
        }
        const polygon = (member as Record<string, unknown>).Polygon as Record<string, unknown> | undefined;
        if (!polygon) {
          return null;
        }
        const rings = parsePolygonCoordinates(polygon);
        return rings.length > 0 ? rings : null;
      })
      .filter((rings): rings is Array<Array<[number, number]>> => Boolean(rings));
    if (polygons.length > 0) {
      return { type: "MultiPolygon", coordinates: polygons };
    }
  }
  return null;
};

const parseBooleanField = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const createPointFromLatLon = (longitude: number | null, latitude: number | null): Point | null => {
  if (typeof longitude === "number" && typeof latitude === "number") {
    return { type: "Point", coordinates: [longitude, latitude] };
  }
  return null;
};

const parseWfsFeatureCollection = (xml: string, fallbackPrefix: string): RawWfsFeature[] => {
  const parsed = xmlParser.parse(xml);
  const members = ensureArray(parsed?.FeatureCollection?.member);
  return members
    .map((member, index) => {
      if (!member || typeof member !== "object") {
        return null;
      }
      const entries = Object.entries(member as Record<string, unknown>).filter(([key]) => key !== "boundedBy");
      const featureEntry = entries.find(([, value]) => value && typeof value === "object");
      if (!featureEntry) {
        return null;
      }
      const [, rawFeatureValue] = featureEntry;
      if (!rawFeatureValue || typeof rawFeatureValue !== "object") {
        return null;
      }
      const featureValue = rawFeatureValue as Record<string, unknown>;
      const geometry = parseGmlGeometry(featureValue.msGeometry as Record<string, unknown> | undefined);
      const attributes: Record<string, unknown> = {};
      Object.entries(featureValue).forEach(([attributeKey, attributeValue]) => {
        if (attributeKey === "msGeometry" || attributeKey === "boundedBy" || attributeKey.startsWith("@_")) {
          return;
        }
        if (attributeValue && typeof attributeValue === "object" && "#text" in (attributeValue as Record<string, unknown>)) {
          attributes[attributeKey] = (attributeValue as Record<string, unknown>)["#text"] ?? "";
        } else {
          attributes[attributeKey] = attributeValue;
        }
      });
      const rawId = (featureValue["@_id"] ??
        featureValue["@_gml:id"] ??
        attributes.id ??
        attributes.ID ??
        attributes.OBJECTID) as string | number | undefined;
      return {
        id: rawId ? String(rawId) : `${fallbackPrefix}-${index}`,
        geometry,
        attributes,
      };
    })
    .filter((feature): feature is RawWfsFeature => Boolean(feature));
};

const normalizeFireDangerFeatures = (collection: PolygonalFeatureCollection): FireDangerFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: FireDangerFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
      return;
    }
    const properties = feature.properties ?? {};
    const { level, label } = extractDangerLevelMetadata(properties);
    const id = String(properties.FID ?? properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `fire-danger-${index}`);
    const centroid = computeGeometryCentroid(feature.geometry);
    const normalizedFeature: FireDangerFeature = {
      id,
      uid: parseNumericField(properties.UID),
      hcount: parseNumericField(properties.HCOUNT),
      area: parseNumericField(properties.AREA),
      firstDate: formatArcGisTimestamp(typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null),
      lastDate: formatArcGisTimestamp(typeof properties.LASTDATE === "string" ? properties.LASTDATE : null),
      consisId: parseNumericField(properties.CONSIS_ID),
      dangerLevel: level,
      dangerLabel: label,
      centroid,
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizePerimeterFeatures = (collection: PolygonalFeatureCollection): PerimeterFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: PerimeterFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
      return;
    }
    const properties = feature.properties ?? {};
    const id = String(properties.FID ?? properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `perimeter-${index}`);
    const centroid = computeGeometryCentroid(feature.geometry);
    const normalizedFeature: PerimeterFeature = {
      id,
      fid: parseNumericField(properties.FID),
      uid: parseNumericField(properties.UID),
      hcount: parseNumericField(properties.HCOUNT),
      area: parseNumericField(properties.AREA),
      firstDate: formatArcGisTimestamp(typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null),
      lastDate: formatArcGisTimestamp(typeof properties.LASTDATE === "string" ? properties.LASTDATE : null),
      consisId: parseNumericField(properties.CONSIS_ID),
      shapeArea: parseNumericField(properties.Shape__Area),
      shapeLength: parseNumericField(properties.Shape__Length),
      centroid,
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeAerodromeFeatures = (collection: FeatureCollection): AerodromeFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: AerodromeFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    const coords = feature.geometry.type === "Point" ? feature.geometry.coordinates : null;
    const longitude = parseNumericField((coords as [number, number] | null)?.[0]) ?? parseNumericField(properties.DD_Lon);
    const latitude = parseNumericField((coords as [number, number] | null)?.[1]) ?? parseNumericField(properties.DD_Lat);
    if (longitude === null || latitude === null) {
      return;
    }
    const normalizedFeature: AerodromeFeature = {
      id: String(properties.GlobalID ?? properties.OBJECTID ?? feature.id ?? `aerodrome-${index}`),
      icao: parseStringField(properties.Identifica),
      name: parseStringField(properties.Name),
      elevation: parseNumericField(properties.Elevation),
      elevationUnit: parseStringField(properties.Unit_of_me),
      organisation: parseStringField(properties.Organisati),
      longitude,
      latitude,
      province: parseStringField(properties.Prov),
      runwayNumbers: parseStringField(properties.allRWY),
      facilityType: parseStringField(properties.Facility),
      surfaceType: parseStringField(properties.Surface_Type),
      lightingType: parseStringField(properties.Lighting_Type),
      lightingIntensity: parseStringField(properties.Lighting_Intensity),
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeRailwayFeatures = (collection: FeatureCollection): RailwayFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: RailwayFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    if (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString") {
      return;
    }
    const properties = feature.properties ?? {};
    const normalizedFeature: RailwayFeature = {
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `railway-${index}`),
      name: parseStringField(properties.TRACKNAME),
      classLabel: parseStringField(properties.TRACKCLASS),
      regulator: parseStringField(properties.REGULATOR),
      status: parseStringField(properties.STATUS),
      useType: parseStringField(properties.USETYPE),
      gauge: parseStringField(properties.GAUGE),
      numTracks: parseNumericField(properties.NUMTRACKS),
      speedFreight: parseNumericField(properties.SPEEDFREIT),
      speedPassenger: parseNumericField(properties.SPEEDPASSE),
      length: parseNumericField(properties.Shape__Length),
      center: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeHighwayFeatures = (collection: FeatureCollection): HighwayFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: HighwayFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    if (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString") {
      return;
    }
    const properties = feature.properties ?? {};
    const normalizedFeature: HighwayFeature = {
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `highway-${index}`),
      name: parseStringField(properties.NAME),
      province: parseStringField(properties.PRNAME_R),
      length: parseNumericField(properties.Shape__Length),
      center: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeRecentHurricaneFeatures = (collection: FeatureCollection): RecentHurricaneFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: RecentHurricaneFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || feature.geometry.type !== "Point") {
      return;
    }
    const coordinates = feature.geometry.coordinates as [number, number] | undefined;
    const properties = feature.properties ?? {};
    const longitude = parseNumericField(coordinates?.[0]) ?? parseNumericField(properties.LON);
    const latitude = parseNumericField(coordinates?.[1]) ?? parseNumericField(properties.LAT);
    if (longitude === null || latitude === null) {
      return;
    }
    normalized.push({
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `recent-hurricane-${index}`),
      stormName: parseStringField(properties.STORMNAME),
      stormType: parseStringField(properties.STORMTYPE),
      basin: parseStringField(properties.BASIN),
      intensity: parseNumericField(properties.INTENSITY),
      pressure: parseNumericField(properties.MSLP),
      advisoryTimestamp: formatArcGisTimestamp(typeof properties.DTG === "string" ? properties.DTG : null),
      tau: parseNumericField(properties.TAU),
      category: parseNumericField(properties.SS),
      longitude,
      latitude,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties,
    });
  });
  return normalized;
};

const normalizeHydrometricStationFeatures = (collection: FeatureCollection): HydrometricStationFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: HydrometricStationFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || feature.geometry.type !== "Point") {
      return;
    }
    const coordinates = feature.geometry.coordinates as [number, number] | undefined;
    const properties = feature.properties ?? {};
    const longitude = parseNumericField(coordinates?.[0]);
    const latitude = parseNumericField(coordinates?.[1]);
    if (longitude === null || latitude === null) {
      return;
    }
    normalized.push({
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `hydrometric-${index}`),
      stationNumber: parseStringField(properties.STATION_NUMBER),
      stationName: parseStringField(properties.STATION_NAME),
      region: parseStringField(properties.REGION),
      currentLevel: parseNumericField(properties.LEVEL_CURRENT),
      currentFlow: parseNumericField(properties.FLOW_CURRENT),
      levelChange: parseNumericField(properties.LEVEL_DIFFERENCE),
      flowChange: parseNumericField(properties.FLOW_DIFFERENCE),
      levelPercentile: parseStringField(properties.LEVEL_PERCENTILE),
      flowPercentile: parseStringField(properties.FLOW_PERCENTILE),
      lastUpdate: parseStringField(properties.LAST_UPDATE),
      url: parseStringField(properties.URL),
      longitude,
      latitude,
      properties,
    });
  });
  return normalized;
};

const normalizeBuildingFootprintFeatures = (collection: FeatureCollection): BuildingFootprintFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: BuildingFootprintFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    normalized.push({
      id: String(properties.OBJECTID ?? properties.objectid ?? feature.id ?? `building-${index}`),
      structureNumber: parseStringField(properties.structure_number),
      propertyNumber: parseStringField(properties.property_number),
      parcelNumber: parseStringField(properties.parcel_number),
      nameEn: parseStringField(properties.name_en),
      nameFr: parseStringField(properties.name_fr),
      custodianEn: parseStringField(properties.custodian_en),
      custodianFr: parseStringField(properties.custodian_fr),
      interestEn: parseStringField(properties.interest_en),
      interestFr: parseStringField(properties.interest_fr),
      addressEn: parseStringField(properties.address_en),
      addressFr: parseStringField(properties.address_fr),
      municipalityEn: parseStringField(properties.municipality_en),
      municipalityFr: parseStringField(properties.municipality_fr),
      provinceEn: parseStringField(properties.province_en),
      provinceFr: parseStringField(properties.province_fr),
      floorAreaSqm: parseNumericField(properties.floor_area),
      constructionYear: parseStringField(properties.construction_year),
      conditionEn: parseStringField(properties.condition_en),
      conditionFr: parseStringField(properties.condition_fr),
      useEn: parseStringField(properties.use_en),
      useFr: parseStringField(properties.use_fr),
      security: parseStringField(properties.security),
      securite: parseStringField(properties.securite),
      structureLinkEn: parseStringField(properties.structure_link_en),
      structureLinkFr: parseStringField(properties.structure_link_fr),
      centroid: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    });
  });
  return normalized;
};

const normalizePropertyBoundaryFeatures = (collection: FeatureCollection): PropertyBoundaryFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: PropertyBoundaryFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    normalized.push({
      id: String(properties.OBJECTID ?? properties.objectid ?? feature.id ?? `property-${index}`),
      propertyNumber: parseStringField(properties.property_number),
      parcelNumber: parseStringField(properties.parcel_number),
      nameEn: parseStringField(properties.name_en),
      nameFr: parseStringField(properties.name_fr),
      custodianEn: parseStringField(properties.custodian_en),
      custodianFr: parseStringField(properties.custodian_fr),
      interestEn: parseStringField(properties.interest_en),
      interestFr: parseStringField(properties.interest_fr),
      addressEn: parseStringField(properties.address_en),
      addressFr: parseStringField(properties.address_fr),
      municipalityEn: parseStringField(properties.municipality_en),
      municipalityFr: parseStringField(properties.municipality_fr),
      provinceEn: parseStringField(properties.province_en),
      provinceFr: parseStringField(properties.province_fr),
      landAreaHa: parseNumericField(properties.land_area),
      buildingCount: parseNumericField(properties.building_count),
      floorAreaSqm: parseNumericField(properties.floor_area),
      primaryUseEn: parseStringField(properties.primary_use_en),
      primaryUseFr: parseStringField(properties.primary_use_fr),
      districtEn: parseStringField(properties.district_en),
      districtFr: parseStringField(properties.district_fr),
      propertyLinkEn: parseStringField(properties.property_link_en),
      propertyLinkFr: parseStringField(properties.property_link_fr),
      security: parseStringField(properties.security),
      securite: parseStringField(properties.securite),
      centroid: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    });
  });
  return normalized;
};

const normalizeIndigenousLandBoundaries = (
  collection: FeatureCollection,
): IndigenousLandBoundaryFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: IndigenousLandBoundaryFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    const names: Array<{ language: string | null; name: string | null }> = [];
    for (let i = 1; i <= 5; i += 1) {
      const language = parseStringField(properties[`LANGUAGE${i}`]);
      const name = parseStringField(properties[`NAME${i}`]);
      if (language || name) {
        names.push({ language, name });
      }
    }
    const jurisdictions = [
      parseStringField(properties.JUR1),
      parseStringField(properties.JUR2),
      parseStringField(properties.JUR3),
      parseStringField(properties.JUR4),
    ].filter((jurisdiction): jurisdiction is string => Boolean(jurisdiction));

    normalized.push({
      id: String(properties.FID ?? properties.OBJECTID ?? feature.id ?? `indigenous-boundary-${index}`),
      fid: parseNumericField(properties.FID),
      acquisitionTechnique: parseStringField(properties.ACQTECH),
      metaCoverage: parseStringField(properties.METACOVER),
      createdDate: parseStringField(properties.CREDATE),
      revisedDate: parseStringField(properties.REVDATE),
      accuracy: parseNumericField(properties.ACCURACY),
      provider: parseStringField(properties.PROVIDER),
      datasetName: parseStringField(properties.DATASETNAM),
      specVersion: parseStringField(properties.SPECVERS),
      nid: parseStringField(properties.NID),
      alCode: parseStringField(properties.ALCODE),
      names,
      jurisdictions,
      webReference: parseStringField(properties.WEBREF),
      shapeArea: parseNumericField(properties.Shape__Area),
      shapeLength: parseNumericField(properties.Shape__Length),
      centroid: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    });
  });
  return normalized;
};

const normalizeCHCResponseZones = (collection: FeatureCollection): CHCResponseZoneFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      if (!feature?.geometry) {
        return null;
      }
      const id = String(feature.properties?.FID ?? feature.id ?? `chc-zone-${index}`);
      const centroid = computeGeometryCentroid(feature.geometry);
      return {
        id,
        geometry: feature.geometry,
        centroid,
        properties: feature.properties ?? {},
      };
    })
    .filter((feature): feature is CHCResponseZoneFeature => Boolean(feature));
};

const normalizeSourceFeatures = (collection: FeatureCollection): SourceLayerFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const geometry =
        feature.geometry && feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [unknown, unknown] | undefined)
          : undefined;
      const longitude =
        parseNumericField(
          properties.longitude ??
          properties.Longitude ??
          properties.LONGITUDE ??
          properties.Lon ??
          properties.LON,
        ) ?? (geometry ? parseNumericField(geometry[0]) : null);
      const latitude =
        parseNumericField(
          properties.latitude ??
          properties.Latitude ??
          properties.LATITUDE ??
          properties.Lat ??
          properties.LAT,
        ) ?? (geometry ? parseNumericField(geometry[1]) : null);
      if (longitude === null || latitude === null) {
        return null;
      }
      const id =
        String(
          properties.objectid ??
          properties.OBJECTID ??
          properties.ObjectId ??
          properties.objectID ??
          feature.id ??
          `source-${index}`,
        );
      const objectId =
        parseNumericField(
          properties.objectid ?? properties.OBJECTID ?? properties.ObjectId ?? properties.objectID,
        ) ?? null;
      return {
        id,
        objectId,
        globalId: parseStringField(properties.globalid ?? properties.GlobalID ?? properties.GLOBALID),
        creationDate: properties.CreationDate ?? properties.creationdate ?? null,
        creator: parseStringField(properties.Creator ?? properties.creator),
        editDate: properties.EditDate ?? properties.editdate ?? null,
        editor: parseStringField(properties.Editor ?? properties.editor),
        sourceName: parseStringField(
          properties.source_name ?? properties.Source_Name ?? properties.SourceName,
        ),
        reportingCriteria: normalizeDelimitedValues(
          properties.reporting_criteria ??
          properties.Reporting_Criteria ??
          properties.ReportingCriteria,
        ),
        reportingCriteriaOther: parseStringField(
          properties.reporting_criteria_other ??
          properties.Reporting_Criteria_Other ??
          properties.reportingCriteriaOther,
        ),
        region: parseStringField(properties.region ?? properties.Region),
        sourceType: parseStringField(
          properties.source_type ?? properties.Source_Type ?? properties.sourceType,
        ),
        scope: parseStringField(properties._scope ?? properties.Scope),
        linkToSource: parseStringField(
          properties.Link_to_source ??
          properties.Link_to_Source ??
          properties.link_to_source ??
          properties.LinkToSource,
        ),
        comments: parseStringField(properties.comments ?? properties.Comments),
        exceptionalSource: parseStringField(properties.ExceptionalSource ?? properties.exceptionalSource),
        latitude,
        longitude,
        tags: normalizeDelimitedValues(
          properties.tag ?? properties.Tag ?? properties.tags ?? properties.Tags,
        ),
        tagOther: parseStringField(
          properties.tag_other ?? properties.Tag_Other ?? properties.tagOther,
        ),
        properties,
      } as SourceLayerFeature;
    })
    .filter((feature): feature is SourceLayerFeature => feature !== null);
};

const normalizeEnvironmentCanadaWeatherAlerts = (
  collection: FeatureCollection,
): EnvironmentCanadaWeatherAlertFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      if (!feature?.geometry) {
        return null;
      }
      const properties = feature.properties ?? {};
      const id = String(
        properties.ObjectId ??
        properties.OBJECTID ??
        properties.objectid ??
        properties.ObjectID ??
        feature.id ??
        `weather-alert-${index}`,
      );
      const getProp = (key: string) => properties[key as keyof typeof properties];
      return {
        id,
        polyId: parseNumericField(properties.POLY_ID ?? properties.poly_id ?? properties.POLYID),
        zoneCode: parseStringField(properties.F_PMESOZA ?? getProp("F_PMESOZA_1656966277284")),
        featureId: parseStringField(properties.FEATURE_ID),
        nameEn: parseStringField(properties.NAME ?? getProp("NAME_1656966277284") ?? properties.Alrt_Nam_E),
        nameFr: parseStringField(properties.NOM ?? getProp("NOM_1656966277284") ?? properties.Alrt_Nam_F),
        alertType: parseStringField(properties.Alert_Type ?? properties.ALERT_TYPE),
        alertNameEn: parseStringField(properties.Alrt_Nam_E ?? properties.NAME ?? getProp("Alrt_Nam_E_1656966277284")),
        alertNameFr: parseStringField(properties.Alrt_Nam_F ?? properties.NOM ?? getProp("Alrt_Nam_F_1656966277284")),
        alertDescriptionEn: parseStringField(properties.Alrt_Des_E),
        alertDescriptionFr: parseStringField(properties.Alrt_Des_F),
        urgency: parseStringField(properties.Urgency),
        effectiveDate: properties.Effective_Date ?? properties.EffectiveDate ?? null,
        expireDate: properties.Expire_Date ?? properties.ExpireDate ?? null,
        websiteUrl: parseStringField(properties.Website_URL ?? properties.WebsiteUrl),
        provinceCode: parseStringField(properties.PROVINCE_C),
        countryCode: parseStringField(properties.COUNTRY_C),
        alertRiskColorCode: parseStringField(
          properties.Alert_Risk_Colour_Code ??
          properties.Alert_Risk_Color_Code ??
          properties.AlertRiskColourCode ??
          properties.AlertRiskColorCode ??
          properties.alert_risk_colour_code ??
          properties.alert_risk_color_code,
        ),
        centroid: computeGeometryCentroid(feature.geometry),
        geometry: feature.geometry,
        properties,
      };
    })
    .filter((feature): feature is EnvironmentCanadaWeatherAlertFeature => Boolean(feature));
};

const buildQuadrantRadii = (attributes: Record<string, unknown>, prefix: string): HurricaneQuadrantRadii => {
  return {
    ne: parseNumericField(attributes[`${prefix}NE` as keyof typeof attributes]),
    se: parseNumericField(attributes[`${prefix}SE` as keyof typeof attributes]),
    sw: parseNumericField(attributes[`${prefix}SW` as keyof typeof attributes]),
    nw: parseNumericField(attributes[`${prefix}NW` as keyof typeof attributes]),
  };
};

const normalizeHurricaneCenterFeatures = (features: RawWfsFeature[]): HurricaneCenterFeature[] => {
  return features
    .map((feature, index) => {
      const attributes = feature.attributes;
      const geometry =
        feature.geometry && feature.geometry.type === "Point"
          ? (feature.geometry as Point)
          : createPointFromLatLon(parseNumericField(attributes.LON), parseNumericField(attributes.LAT));
      if (!geometry) {
        return null;
      }
      return {
        id: feature.id ?? `hurricane-center-${index}`,
        featureType: "center",
        geometry,
        stormName: parseStringField(attributes.STORMNAME) ?? null,
        stormType: parseStringField(attributes.STORMTYPE),
        basin: parseStringField(attributes.BASIN),
        advisoryDate: parseStringField(attributes.ADVDATE ?? attributes.DATELBL),
        validTime: parseStringField(attributes.VALIDTIME),
        timezone: parseStringField(attributes.TIMEZONE),
        tau: parseStringField(attributes.TAU),
        stormForce: parseStringField(attributes.STORMFORCE),
        maxWind: parseNumericField(attributes.MAXWIND),
        meanSeaLevelPressure: parseNumericField(attributes.MSLP),
        development: parseStringField(attributes.TCDVLP),
        errorConeLabel: parseStringField(attributes.ERRCT),
        active: parseBooleanField(attributes.active),
        timestamp: parseStringField(attributes.TIMESTAMP ?? attributes.filedate ?? attributes.filename),
        radii34: buildQuadrantRadii(attributes, "R34"),
        radii48: buildQuadrantRadii(attributes, "R48"),
        radii64: buildQuadrantRadii(attributes, "R64"),
        properties: attributes,
      };
    })
    .filter((feature): feature is HurricaneCenterFeature => Boolean(feature));
};

const normalizeHurricaneTrackFeatures = (features: RawWfsFeature[]): HurricaneTrackFeature[] => {
  return features
    .map((feature, index) => {
      if (!feature.geometry || (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString")) {
        return null;
      }
      const attributes = feature.attributes;
      return {
        id: feature.id ?? `hurricane-track-${index}`,
        featureType: "track",
        geometry: feature.geometry as LineString | MultiLineString,
        stormName: parseStringField(attributes.STORMNAME) ?? null,
        stormType: parseStringField(attributes.STORMTYPE),
        basin: parseStringField(attributes.BASIN),
        active: parseBooleanField(attributes.active),
        timestamp: parseStringField(attributes.TIMESTAMP ?? attributes.filedate ?? attributes.filename),
        properties: attributes,
      };
    })
    .filter((feature): feature is HurricaneTrackFeature => Boolean(feature));
};

const normalizeHurricaneErrorFeatures = (features: RawWfsFeature[]): HurricaneErrorFeature[] => {
  return features
    .map((feature, index) => {
      if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
        return null;
      }
      const attributes = feature.attributes;
      return {
        id: feature.id ?? `hurricane-error-${index}`,
        featureType: "error-cone",
        geometry: feature.geometry as Polygon | MultiPolygon,
        stormName: parseStringField(attributes.STORMNAME) ?? null,
        active: parseBooleanField(attributes.active),
        timestamp: parseStringField(attributes.TIMESTAMP ?? attributes.filedate ?? attributes.filename),
        properties: attributes,
      };
    })
    .filter((feature): feature is HurricaneErrorFeature => Boolean(feature));
};

const normalizeHurricaneWindRadiusFeatures = (features: RawWfsFeature[]): HurricaneWindRadiusFeature[] => {
  return features
    .map((feature, index) => {
      if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
        return null;
      }
      const attributes = feature.attributes;
      return {
        id: feature.id ?? `hurricane-wind-${index}`,
        featureType: "wind-radius",
        geometry: feature.geometry as Polygon | MultiPolygon,
        stormName: parseStringField(attributes.STORMNAME) ?? null,
        active: parseBooleanField(attributes.active),
        timestamp: parseStringField(attributes.TIMESTAMP ?? attributes.filedate ?? attributes.filename),
        windForce: parseStringField(attributes.WINDFORCE),
        validTime: parseStringField(attributes.VALIDTIME),
        properties: attributes,
      };
    })
    .filter((feature): feature is HurricaneWindRadiusFeature => Boolean(feature));
};

const normalizeWildfires = (featureCollection: {
  features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }>;
}) => {
  return (
    featureCollection?.features
      ?.map((feature, index) => {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties ?? {};
        const longitude = typeof coordinates?.[0] === "number" ? coordinates[0] : (properties.lon as number | undefined);
        const latitude = typeof coordinates?.[1] === "number" ? coordinates[1] : (properties.lat as number | undefined);
        if (typeof longitude !== "number" || typeof latitude !== "number") {
          return null;
        }
        const stageValue =
          parseStringField(properties.stage_of_control ?? properties.STAGE_OF_CONTROL) ?? undefined;
        const responseValue =
          parseStringField(properties.response_type ?? properties.RESPONSE_TYPE) ?? undefined;
        const startDateValue = properties.startdate ?? properties.STARTDATE;
        const hectares = parseNumericField(properties.hectares ?? properties.HECTARES);
        return {
          id: String(properties.ObjectId ?? properties.OBJECTID ?? `wildfire-${index}`),
          agency: parseStringField(properties.agency ?? properties.AGENCY) ?? "Unknown jurisdiction",
          name: parseStringField(properties.firename ?? properties.FIRENAME) ?? "Unnamed Fire",
          longitude,
          latitude,
          hectares,
          stageOfControl: resolveWildfireStageLabel(stageValue),
          responseType: resolveWildfireResponseLabel(responseValue),
          startDate:
            typeof startDateValue === "string" || typeof startDateValue === "number"
              ? formatWildfireDate(startDateValue)
              : null,
          timezone: parseStringField(properties.timezone ?? properties.TIMEZONE),
        } satisfies WildfireFeature;
      })
      .filter((feature): feature is WildfireFeature => Boolean(feature))
  );
};

const fetchRawHurricaneLayer = async (layerName: string, signal: AbortSignal): Promise<RawWfsFeature[]> => {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: `ec-msc:${layerName}`,
    srsName: "EPSG:4326",
    outputFormat: "application/gml+xml; version=3.2",
  });
  const response = await fetch(`${GEOMET_WFS_BASE_URL}?${params.toString()}`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${layerName.toLowerCase().replace(/_/g, " ")} (${response.status})`);
  }
  const xml = await response.text();
  return parseWfsFeatureCollection(xml, layerName.toLowerCase());
};

const fetchActiveHurricanes = async ({ signal }: { signal: AbortSignal }): Promise<HurricaneFeature[]> => {
  const requests: Array<Promise<HurricaneFeature[]>> = [
    fetchRawHurricaneLayer(HURRICANE_WFS_LAYER_NAMES.centers, signal).then((features) =>
      normalizeHurricaneCenterFeatures(features),
    ),
    fetchRawHurricaneLayer(HURRICANE_WFS_LAYER_NAMES.tracks, signal).then((features) =>
      normalizeHurricaneTrackFeatures(features),
    ),
    fetchRawHurricaneLayer(HURRICANE_WFS_LAYER_NAMES.error, signal).then((features) =>
      normalizeHurricaneErrorFeatures(features),
    ),
    fetchRawHurricaneLayer(HURRICANE_WFS_LAYER_NAMES.wind, signal).then((features) =>
      normalizeHurricaneWindRadiusFeatures(features),
    ),
  ];
  const results = await Promise.allSettled(requests);
  const features = results
    .filter((result): result is PromiseFulfilledResult<HurricaneFeature[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);
  if (features.length === 0) {
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw new Error(
      (firstError?.reason as Error | undefined)?.message ?? "Failed to load active hurricanes in the Canadian response zone.",
    );
  }
  return features;
};

const fetchDobIncidents = async ({ signal }: { signal: AbortSignal }): Promise<DobIncidentFeature[]> => {
  const response = await fetch(DOB_INCIDENTS_URL, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load DOB incidents (${response.status})`);
  }
  const json = await response.json();
  return normalizeDobIncidents(json?.features ?? []) ?? [];
};

const fetchActiveWildfires = async ({ signal }: { signal: AbortSignal }): Promise<WildfireFeature[]> => {
  const response = await fetch(ACTIVE_WILDFIRES_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load active wildfires (${response.status})`);
  }
  const json = await response.json();
  return normalizeWildfires(json) ?? [];
};

const fetchFireDangerAreas = async ({ signal }: { signal: AbortSignal }): Promise<FireDangerFeature[]> => {
  // WFS endpoint returns GeoJSON directly (not paginated ArcGIS format)
  const response = await fetch(FIRE_DANGER_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load fire danger polygons (${response.status})`);
  }
  const collection = (await response.json()) as PolygonalFeatureCollection;
  return normalizeFireDangerFeatures(collection) ?? [];
};

const fetchPerimeters = async ({ signal }: { signal: AbortSignal }): Promise<PerimeterFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(PERIMETERS_URL, signal);
  return normalizePerimeterFeatures(collection) ?? [];
};

const fetchRecentHurricanes = async ({ signal }: { signal: AbortSignal }): Promise<RecentHurricaneFeature[]> => {
  const response = await fetch(RECENT_HURRICANES_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load recent hurricanes (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeRecentHurricaneFeatures(collection) ?? [];
};

const fetchAerodromes = async ({ signal }: { signal: AbortSignal }): Promise<AerodromeFeature[]> => {
  const response = await fetch(AERODROMES_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load aerodromes (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeAerodromeFeatures(collection) ?? [];
};

const fetchRailways = async ({ signal }: { signal: AbortSignal }): Promise<RailwayFeature[]> => {
  const response = await fetch(RAILWAYS_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load railways (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeRailwayFeatures(collection) ?? [];
};

const fetchHighways = async ({ signal }: { signal: AbortSignal }): Promise<HighwayFeature[]> => {
  const response = await fetch(HIGHWAYS_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load highways (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeHighwayFeatures(collection) ?? [];
};

const fetchHydrometricStations = async ({ signal }: { signal: AbortSignal }): Promise<HydrometricStationFeature[]> => {
  const response = await fetch(HYDROMETRIC_STATIONS_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load hydrometric stations (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeHydrometricStationFeatures(collection) ?? [];
};

const fetchBuildingFootprints = async ({ signal }: { signal: AbortSignal }): Promise<BuildingFootprintFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(BUILDING_FOOTPRINTS_URL, signal);
  return normalizeBuildingFootprintFeatures(collection) ?? [];
};

const fetchPropertyBoundaries = async ({ signal }: { signal: AbortSignal }): Promise<PropertyBoundaryFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(PROPERTY_BOUNDARIES_URL, signal);
  return normalizePropertyBoundaryFeatures(collection) ?? [];
};

const normalizeCensus2021Features = (collection: FeatureCollection): Census2021DisseminationAreaFeature[] => {
  if (!collection?.features) return [];
  return collection.features
    .map((feature) => {
      const props = feature.properties ?? {};
      const id = String(props.OBJECTID_12 ?? props.OBJECTID ?? "unknown");
      const centroid = feature.geometry ? computeGeometryCentroid(feature.geometry) : null;
      return {
        id,
        dauid: String(props.DAUID),
        daugid: String(props.DGUID),
        landArea: Number(props.LANDAREA),
        prUid: String(props.PRUID),
        prName: String(props.PRNAME_PRN),
        geoName: String(props.GEO_NAME),
        popCount: Number(props.POP_COUNT_),
        privateDwellings: Number(props.Private_dw),
        totalPrivateDwellings: Number(props.Tpw),
        popDensity: Number(props.Pop_den_sk),
        geometry: feature.geometry,
        centroid,
        properties: props,
      } satisfies Census2021DisseminationAreaFeature;
    })
    .filter((f): f is Census2021DisseminationAreaFeature => Boolean(f));
};

const fetchIndigenousLandBoundaries = async ({
  signal,
  bbox,
}: {
  signal: AbortSignal;
  bbox?: MapBounds | null;
}): Promise<IndigenousLandBoundaryFeature[]> => {
  const collection = await fetchBoundedArcGisGeoJson(INDIGENOUS_LAND_BOUNDARIES_URL, signal, bbox);
  return normalizeIndigenousLandBoundaries(collection) ?? [];
};

const fetchCensus2021Pop = async ({
  signal,
  bbox,
}: {
  signal: AbortSignal;
  bbox?: MapBounds | null;
}): Promise<Census2021DisseminationAreaFeature[]> => {
  const collection = await fetchBoundedArcGisGeoJson(CENSUS_2021_URL, signal, bbox);
  return normalizeCensus2021Features(collection) ?? [];
};

const fetchCHCResponseZones = async ({ signal }: { signal: AbortSignal }): Promise<CHCResponseZoneFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(CHC_RESPONSE_ZONE_URL, signal);
  return normalizeCHCResponseZones(collection);
};

const fetchSources = async ({ signal }: { signal: AbortSignal }): Promise<SourceLayerFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(SOURCES_URL, signal);
  return normalizeSourceFeatures(collection);
};

const fetchEnvironmentCanadaWeatherAlerts = async ({
  signal,
}: {
  signal: AbortSignal;
}): Promise<EnvironmentCanadaWeatherAlertFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(WEATHER_ALERTS_URL, signal);
  return normalizeEnvironmentCanadaWeatherAlerts(collection);
};

const fetchInuitCommunities = async ({ signal }: { signal: AbortSignal }): Promise<InuitCommunityFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(INUIT_COMMUNITIES_URL, signal);
  return normalizeInuitCommunityFeatures(collection);
};

const normalizeBorderEntries = (
  features: Array<{ attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }>,
  entryType: BorderEntryType,
): BorderEntryFeature[] => {
  if (!features) {
    return [];
  }
  const normalized: BorderEntryFeature[] = [];
  features.forEach((feature, index) => {
    if (!feature?.attributes) {
      return;
    }
    const coords = convertWebMercatorToLngLat(feature.geometry?.x, feature.geometry?.y);
    if (!coords) {
      return;
    }
    const attributes = feature.attributes;
    const objectIdComponent = attributes.objectid ?? attributes.OBJECTID ?? index;
    const normalizedFeature: BorderEntryFeature = {
      id: `${entryType}-${objectIdComponent}`,
      name: String(attributes.office_name ?? attributes.office_name__short_ ?? attributes.Name ?? "Unnamed Port"),
      code: typeof attributes.office_code === "string" ? attributes.office_code : undefined,
      region: typeof attributes.region === "string" ? attributes.region : undefined,
      province: typeof attributes.province === "string" ? attributes.province : undefined,
      address: typeof attributes.address === "string" ? attributes.address : undefined,
      postalCode: typeof attributes.postal_code === "string" ? attributes.postal_code : undefined,
      place: typeof attributes.place === "string" ? attributes.place : undefined,
      longitude: coords.longitude,
      latitude: coords.latitude,
      entryType,
      url: typeof attributes.url === "string" ? attributes.url : undefined,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeInuitCommunityFeatures = (collection: FeatureCollection): InuitCommunityFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry;
      const id = String(properties.OBJECTID ?? properties.objectid ?? feature.id ?? `inuit-community-${index}`);

      let longitude: number | null = null;
      let latitude: number | null = null;

      if (geometry && geometry.type === "Point") {
        const coords = geometry.coordinates;
        if (coords.length >= 2) {
          longitude = coords[0];
          latitude = coords[1];
        }
      }

      if (longitude === null || latitude === null) {
        // Attempt to convert from Mercator if needed, but the URL says f=geojson which usually returns lat/lon
        // If the data is empty or invalid, skip it? Or just null checks.
        // For safe measure, try the computeGeometryCentroid helper if we had access, but we can just use the provided geometry.
        // If it's null, we'll leave it null.
      }

      return {
        id,
        identifier: parseStringField(properties.ID),
        name: parseStringField(properties.NAME),
        nameInuktitut: parseStringField(properties.NAME_INUKTITUT),
        traditionalName: parseStringField(properties.TRADITIONAL_NAME),
        traditionalNameMeaningEn: parseStringField(properties.TRADITIONAL_NAME_MEANING_E),
        traditionalNameMeaningFr: parseStringField(properties.TRADITIONAL_NAME_MEANING_F),
        region: parseStringField(properties.REGION),
        regionInuktitut: parseStringField(properties.REGION_INUKTITUT),
        population: parseNumericField(properties.POPULATION),
        postalAddressEn: parseStringField(properties.POSTAL_ADDRESS_E),
        postalAddressFr: parseStringField(properties.POSTAL_ADDRESS_F),
        postalCode: parseStringField(properties.POSTAL_CODE),
        provinceCode: parseStringField(properties.PROVINCE_CODE),
        phone: parseStringField(properties.PHONE),
        fax: parseStringField(properties.FAX),
        website: parseStringField(properties.WEBSITE),
        memberParliamentEn: parseStringField(properties.MEMBER_PARL_NAME_E),
        memberParliamentFr: parseStringField(properties.MEMBER_PARL_NAME_F),
        memberLegislativeEn: parseStringField(properties.MEMBER_LEGSL_ASSEMBLY_NAME_E),
        memberLegislativeFr: parseStringField(properties.MEMBER_LEGSL_ASSEMBLY_NAME_F),
        landClaimOrgName: parseStringField(properties.LCO_NAME),
        landClaimOrgAddressEn: parseStringField(properties.LCO_POSTAL_ADDRESS_E),
        landClaimOrgAddressFr: parseStringField(properties.LCO_POSTAL_ADDRESS_F),
        landClaimOrgCity: parseStringField(properties.LCO_CITY),
        landClaimOrgProvinceCode: parseStringField(properties.LCO_PROVINCE_CODE),
        landClaimOrgPostalCode: parseStringField(properties.LCO_POSTAL_CODE),
        landClaimOrgPhone: parseStringField(properties.LCO_PHONE),
        landClaimOrgWebsite: parseStringField(properties.LCO_WEBSITE),
        otherLinks: parseStringField(properties.OTHER_LINKS),
        communityBackgroundEn: parseStringField(properties.COMMUNITY_BACKGROUND_E),
        communityBackgroundFr: parseStringField(properties.COMMUNITY_BACKGROUND_F),
        longitude,
        latitude,
        centroid: geometry ? computeGeometryCentroid(geometry) : null,
        geometry: geometry ?? null,
        properties,
      } as InuitCommunityFeature;
    })
    .filter((feature): feature is InuitCommunityFeature => Boolean(feature));
};

const fetchBorderEntries = async ({ signal }: { signal: AbortSignal }): Promise<BorderEntryFeature[]> => {
  const layerRequests = POINT_OF_ENTRY_LAYERS.map(async ({ id, type }) => {
    const url = `${POINT_OF_ENTRY_BASE_URL}/${id}/query?where=1%3D1&outFields=*&returnGeometry=true&f=json`;
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load border entry layer ${id} (${response.status})`);
    }
    const json = await response.json();
    return normalizeBorderEntries(json?.features ?? [], type) ?? [];
  });

  const results = await Promise.all(layerRequests);
  return results.flat();
};

const createPlaceholderLayers = (): PlaceholderLayerConfig[] => {
  return VIEW_TYPE_OPTIONS.map((view) => {
    const viewId = (view.id as ViewType) ?? "general";
    const viewLabel = typeof view.label === "string" && view.label.length > 0 ? view.label : viewId;
    return {
      id: `${viewId}-placeholder-2`,
      label: viewId === "wildfires" ? "WILDFIRE TOGGLE 2" : `${viewLabel.toUpperCase()} TOGGLE 2`,
      description: `Placeholder data feed for the ${viewLabel.toLowerCase()} view.`,
      colorHex: "#94a3b8",
      hoverColorHex: "#64748b",
      viewTypes: [viewId],
      kind: "placeholder",
    };
  });
};

export const MAP_LAYER_CONFIGS: MapLayerConfig[] = [
  {
    id: "dob-incidents",
    label: "DOB Incidents",
    description: "Live Department Operations Branch incident feed.",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    viewTypes: ["general"],
    kind: "data",
    fetcher: fetchDobIncidents,
  },
  {
    id: "active-wildfires",
    label: "Active Wildfires",
    description: "Current wildfires sourced from the CWFIS national overview.",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchActiveWildfires,
  },
  {
    id: "fire-danger",
    label: "Fire Danger",
    description: "Polygons representing current wildland fire danger assessments.",
    colorHex: FIRE_DANGER_LEVEL_METADATA.extreme.colorHex,
    hoverColorHex: FIRE_DANGER_LEVEL_METADATA.extreme.hoverColorHex,
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchFireDangerAreas,
  },
  {
    id: "perimeters",
    label: "Perimeters",
    description: "Fire perimeter polygons from the National Wildland Fire database.",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchPerimeters,
  },
  {
    id: "active-hurricanes",
    label: "Active Hurricanes in Canadian Response Zone",
    description: "Canadian Hurricane Centre forecast centers, wind radii, and track cones.",
    colorHex: "#0ea5e9",
    hoverColorHex: "#0284c7",
    viewTypes: ["hurricanes"],
    kind: "data",
    fetcher: fetchActiveHurricanes,
  },
  {
    id: "recent-hurricanes",
    label: "Recent Hurricanes, Cyclones & Typhoons (US NHC)",
    description: "Recent atlantic, pacific, and international storms tracked by the US NHC.",
    colorHex: "#f472b6",
    hoverColorHex: "#ec4899",
    viewTypes: ["hurricanes"],
    kind: "data",
    fetcher: fetchRecentHurricanes,
  },
  {
    id: "border-entries",
    label: "Border Points of Entry",
    description: "Air, land, and crossing offices maintained by CBSA.",
    colorHex: "#0f172a",
    hoverColorHex: "#1e293b",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchBorderEntries,
  },
  {
    id: "aerodromes",
    label: "Aerodromes",
    description: "Canadian aerodromes with ICAO codes, elevation, and runway info.",
    colorHex: "#7c3aed",
    hoverColorHex: "#6d28d9",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchAerodromes,
  },
  {
    id: "railways",
    label: "National Railway Network",
    description: "National railway track segments and operational attributes.",
    colorHex: "#f59e0b",
    hoverColorHex: "#d97706",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchRailways,
  },
  {
    id: "highways",
    label: "National Highway System",
    description: "National highway corridors and provincial ownership details.",
    colorHex: "#059669",
    hoverColorHex: "#047857",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchHighways,
  },
  {
    id: "hydrometric-stations",
    label: "Hydrometric Stations",
    description: "Water level & streamflow monitoring sites across Canada.",
    colorHex: "#10b981",
    hoverColorHex: "#059669",
    viewTypes: ["general"],
    kind: "data",
    fetcher: fetchHydrometricStations,
  },
  {
    id: "chc-response-zone",
    label: "CHC Response Zone",
    description: "Canadian Hurricane Centre response zone extent.",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    viewTypes: ["general", "hurricanes"],
    kind: "data",
    fetcher: fetchCHCResponseZones,
  },
  {
    id: "environment-canada-weather-alerts",
    label: "Environment Canada Weather Alerts",
    description: "Active warnings and advisories published by Environment and Climate Change Canada.",
    colorHex: "#fb923c",
    hoverColorHex: "#ea580c",
    viewTypes: ["general", "hurricanes"],
    kind: "data",
    fetcher: fetchEnvironmentCanadaWeatherAlerts,
  },
  {
    id: "sources",
    label: "Sources",
    description: "Government-reported sources and references.",
    colorHex: "#a855f7",
    hoverColorHex: "#9333ea",
    viewTypes: ["general"],
    kind: "data",
    fetcher: fetchSources,
  },
  {
    id: "inuit-communities",
    label: "Inuit Communities",
    description: "Community contact, representation, and background data published by ISC.",
    colorHex: "#0d9488",
    hoverColorHex: "#14b8a6",
    viewTypes: ["population"],
    kind: "data",
    fetcher: fetchInuitCommunities,
  },
  {
    id: "indigenous-land-boundaries",
    label: "Indigenous Land Boundaries",
    description: "Aboriginal land boundaries with multilingual naming and jurisdiction metadata.",
    colorHex: "#facc15",
    hoverColorHex: "#eab308",
    viewTypes: ["population"],
    kind: "data",
    fetcher: fetchIndigenousLandBoundaries,
  },
  {
    id: "census-2021-da",
    label: "2021 Census (DA)",
    description: "Population and dwelling counts by Dissemination Area (2021 Census).",
    colorHex: "#e879f9",
    hoverColorHex: "#c026d3",
    viewTypes: ["population"],
    kind: "data",
    fetcher: fetchCensus2021Pop,
  },
  {
    id: "building-footprints",
    label: "Building Footprints (GoC)",
    description: "Government of Canada building footprints from the Directory of Federal Real Property.",
    colorHex: "#c084fc",
    hoverColorHex: "#a855f7",
    viewTypes: ["general", "infrastructure"],
    kind: "data",
    fetcher: fetchBuildingFootprints,
  },
  {
    id: "property-boundaries",
    label: "Property Boundaries (GoC)",
    description: "Federal property outlines and custodial details from the Directory of Federal Real Property.",
    colorHex: "#7dd3fc",
    hoverColorHex: "#38bdf8",
    viewTypes: ["general", "infrastructure"],
    kind: "data",
    fetcher: fetchPropertyBoundaries,
  },

  {
    id: CAMERA_LAYER_ID,
    label: "Ottawa traffic cameras",
    description: "City of Ottawa & MTO roadside feeds with live stills.",
    colorHex: "#0ea5e9",
    hoverColorHex: "#0284c7",
    viewTypes: ["general", "infrastructure"],
    kind: "camera",
  },
  ...createPlaceholderLayers(),
];

export const DATA_LAYER_CONFIGS = MAP_LAYER_CONFIGS.filter((layer): layer is DataMapLayerConfig => layer.kind === "data");

export const MAP_LAYER_LOOKUP = MAP_LAYER_CONFIGS.reduce<Record<string, MapLayerConfig>>((acc, layer) => {
  acc[layer.id] = layer;
  return acc;
}, {});
