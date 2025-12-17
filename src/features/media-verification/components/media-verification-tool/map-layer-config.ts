import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, MultiPolygon, Point, Polygon } from "geojson";
import { XMLParser } from "fast-xml-parser";

import type { SelectItemType } from "@/components/ui/select/select";
import { getApiKey, type ApiKeyId } from "@/shared/config/api-keys";

export type ViewType =
  | "general"
  | "wildfires"
  | "hurricanes"
  | "infrastructure"
  | "population"
  | "transportation"
  | "earthquakes"
  | "flooding";

export const VIEW_TYPE_OPTIONS: SelectItemType[] = [
  { id: "general", label: "General" },
  { id: "wildfires", label: "Wildfires" },
  { id: "hurricanes", label: "Hurricanes" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "population", label: "Population" },
  { id: "transportation", label: "Transportation" },
  { id: "earthquakes", label: "Earthquakes" },
  { id: "flooding", label: "Flooding" },
];

export const CAMERA_LAYER_ID = "ottawa-cameras";

interface MapLayerBaseConfig {
  id: string;
  label: string;
  description: string;
  viewTypes: ViewType[];
  colorHex?: string;
  hoverColorHex?: string;
}

export type MapBounds = { sw: { lng: number; lat: number }; ne: { lng: number; lat: number } };

export interface DataMapLayerConfig<TData = unknown> extends MapLayerBaseConfig {
  kind: "data";
  fetcher: (options: { signal: AbortSignal; bounds?: MapBounds; zoom?: number }) => Promise<TData[]>;
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
const FERRY_ROUTES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/Vessel_Routes_Ferry_WFL1/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const RECENT_HURRICANES_URL =
  "https://rhvpkkiftonktxq3.svcs9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Recent_Hurricanes_v1/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const HYDROMETRIC_STATIONS_URL =
  "https://services.arcgis.com/lGOekm0RsNxYnT3j/ArcGIS/rest/services/Hydrometric_Stations/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const DAMS_RESERVOIRS_URL =
  "https://wwf-sight-maps.org/arcgis/rest/services/Global/Dams/MapServer/3/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&outFields=*&returnGeometry=true&featureEncoding=esriDefault&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=geojson";
const BUILDING_FOOTPRINTS_URL =
  "https://idgsi-rpgdi-arcgis.spac-pspc.gc.ca/gisserver/rest/services/Hosted/DFRP_PUBLIC/FeatureServer/3/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const PROPERTY_BOUNDARIES_URL =
  "https://idgsi-rpgdi-arcgis.spac-pspc.gc.ca/gisserver/rest/services/Hosted/DFRP_PUBLIC/FeatureServer/4/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const INDIGENOUS_LAND_BOUNDARIES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Aboriginal_Lands_Boundaries_INAC/FeatureServer/0//query?where=1%3D1&fullText=&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const INUIT_COMMUNITIES_URL =
  "https://data.sac-isc.gc.ca/geomatics/rest/services/Donnees_Ouvertes-Open_Data/Communaute_inuite_Inuit_Community/MapServer/0/query?where=1%3D1&text=&objectIds=&time=&timeRelation=esriTimeRelationOverlaps&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&returnExtentOnly=false&sqlFormat=none&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&uniqueIds=&returnUniqueIdsOnly=false&featureEncoding=esriDefault&f=geojson";
const REMOTE_COMMUNITIES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Remote_Communities_Dataset/FeatureServer/0/query?where=1%3D1&fullText=&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const EARTHQUAKES_URL =
  "https://services.arcgis.com/wjcPoefzjpzCgffS/ArcGIS/rest/services/_NRCAN_Earthquake_Events_Past_30_Days/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const HISTORICAL_EARTHQUAKES_URL =
  "https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/earthquakes_en/MapServer/3/query?where=1%3D1&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&returnExtentOnly=false&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&featureEncoding=esriDefault&f=geojson";
const SEISMOGRAPH_STATIONS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/NRCAN_Seismograph_Stations_view/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const GLOBAL_FAULTS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/ActiveFaults_Static_20240621/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const NATIONAL_PARKS_URL =
  "https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/Canada_National_Parks/FeatureServer/0//query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const SOURCES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/survey123_49a2b7c731a241faa4f8309496dc794c_results/FeatureServer/0/query?where=1%3D1&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const CHC_RESPONSE_ZONE_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/CHC_response_zone/FeatureServer/0/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const WEATHER_ALERTS_URL =
  "https://services.arcgis.com/wjcPoefzjpzCgffS/ArcGIS/rest/services/Environment_Canada_Weather_Alerts___Test/FeatureServer/0/query?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&defaultSR=&spatialRel=esriSpatialRelIntersects&distance=0.0&units=esriSRUnit_Meter&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&resultOffset=0&resultRecordCount=2000&returnTrueCurves=false&returnCentroid=false&returnEnvelope=false&timeReferenceUnknownClient=false&maxRecordCountFactor=&sqlFormat=none&resultType=none&datumTransformation=&lodType=geohash&lod=&lodSR=&cacheHint=false&f=geojson";
const FIRST_ALERTS_URL =
  "https://services6.arcgis.com/dFgdXvg0lJd6OT8j/arcgis/rest/services/FA_ESRI_EMPB_288323/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson";
const FIRST_ALERTS_API_KEY_ID: ApiKeyId = "first_alerts";
const HEALTHCARE_FACILITIES_URL =
  "https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/Open_Database_of_Healthcare_Facilities_/FeatureServer/0//query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const NACEI_BASE_URL = "https://geoappext.nrcan.gc.ca/arcgis/rest/services/NACEI/energy_infrastructure_of_north_america_en/MapServer";
const CWFIS_HISTORICAL_PERIMETERS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/2024_perimeters/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
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

export interface FerryRouteFeature {
  id: string;
  fid: number | null;
  objName: string | null;
  nativeName: string | null;
  status: string | null;
  info: string | null;
  nativeInfo: string | null;
  textDescription: string | null;
  catfry: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  recordedDate: string | null;
  recordIndicator: string | null;
  sourceDate: string | null;
  sourceIndicator: string | null;
  encName: string | null;
  lnam: string | null;
  lnamRefs: string | null;
  inform: string | null;
  nativeInform: string | null;
  notes: string | null;
  prim: number | null;
  rcid: number | null;
  grup: number | null;
  objl: number | null;
  rver: number | null;
  agen: number | null;
  fidn: number | null;
  fids: number | null;
  ffptRind: string | null;
  centroid: { longitude: number; latitude: number } | null;
  lengthMeters: number | null;
  geometry: Geometry | null;
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
  previousLevel: number | null;
  previousFlow: number | null;
  normalLevelToday: number | null;
  normalFlowToday: number | null;
  meanAnnualLevel: number | null;
  meanAnnualFlow: number | null;
  historicalMaxLevel: number | null;
  historicalMinLevel: number | null;
  historicalMaxFlow: number | null;
  historicalMinFlow: number | null;
  levelChange: number | null;
  flowChange: number | null;
  diffFromMeanLevel: number | null;
  diffFromAnnualLevel: number | null;
  diffFromHistoricalMaxLevel: number | null;
  diffFromHistoricalMinLevel: number | null;
  diffFromMeanFlow: number | null;
  diffFromAnnualFlow: number | null;
  diffFromHistoricalMaxFlow: number | null;
  diffFromHistoricalMinFlow: number | null;
  levelPercentile: string | null;
  flowPercentile: string | null;
  lastUpdate: string | null;
  url: string | null;
  longitude: number;
  latitude: number;
  properties: Record<string, unknown>;
}

export interface DamReservoirFeature {
  id: string;
  grandId: number | null;
  reservoirName: string | null;
  damName: string | null;
  altName: string | null;
  river: string | null;
  altRiver: string | null;
  mainBasin: string | null;
  subBasin: string | null;
  nearCity: string | null;
  altCity: string | null;
  adminUnit: string | null;
  secondaryAdmin: string | null;
  country: string | null;
  secondaryCountry: string | null;
  year: number | null;
  altYear: number | null;
  removalYear: number | null;
  damHeightMeters: number | null;
  altHeightMeters: number | null;
  damLengthMeters: number | null;
  altLengthMeters: number | null;
  areaSqKm: number | null;
  areaPolygon: number | null;
  areaRepresentative: number | null;
  areaMax: number | null;
  areaMin: number | null;
  capacityMcm: number | null;
  capacityMax: number | null;
  capacityRep: number | null;
  capacityMin: number | null;
  depthMeters: number | null;
  dischargeAvgLs: number | null;
  dorPercent: number | null;
  elevationMasl: number | null;
  catchmentSqKm: number | null;
  catchmentRepSqKm: number | null;
  dataInfo: string | null;
  useIrrigation: string | null;
  useElectric: string | null;
  useSupply: string | null;
  useFloodControl: string | null;
  useRecreation: string | null;
  useNavigation: string | null;
  useFisheries: string | null;
  usePowerControl: string | null;
  useLivestock: string | null;
  useOther: string | null;
  mainUse: string | null;
  lakeControl: string | null;
  multiDams: string | null;
  timeline: string | null;
  comments: string | null;
  url: string | null;
  quality: string | null;
  editor: string | null;
  polygonSource: string | null;
  areaGeoSqKm: number | null;
  longitude: number | null;
  latitude: number | null;
  geometry: Geometry | null;
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

export interface HealthcareFacilityFeature {
  id: string;
  objectId: number | null;
  index: string | null;
  facilityName: string | null;
  sourceFacilityType: string | null;
  odhfFacilityType: string | null;
  provider: string | null;
  unit: string | null;
  streetNumber: string | null;
  streetName: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  fullAddress: string | null;
  csdName: string | null;
  csdUid: number | null;
  prUid: number | null;
  longitude: number | null;
  latitude: number | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface EnergyInfrastructureFeature {
  id: string;
  layerId: number;
  layerName: string;
  facility: string | null;
  owner: string | null;
  operator: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  county: string | null;
  zipCode: string | null;
  address: string | null;
  totalMw: number | null;
  renewableMw: number | null;
  primarySource: string | null;
  primaryRenewable: string | null;
  energyBreakdown: Record<string, number | null>;
  referencePeriod: string | null;
  sourceAgency: string | null;
  longitude: number | null;
  latitude: number | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface FirstAlertFeature {
  id: string;
  objectId: number | null;
  alertType: string | null;
  eventTime: string | null;
  headline: string | null;
  subHeadlineTitle: string | null;
  alertListsName: string | null;
  alertTopicsName: string | null;
  alertLists: string[];
  alertTopics: string[];
  estimatedEventLocationName: string | null;
  estimatedEventLocationRadius: number | null;
  longitude: number | null;
  latitude: number | null;
  centroid: { longitude: number; latitude: number } | null;
  firstAlertUrl: string | null;
  publicPostLink: string | null;
  publicPostText: string | null;
  publicPostTranslatedText: string | null;
  publicPostMedia: string | null;
  termsOfUse: string | null;
  epoch: string | null;
  uniqueKey: string | null;
  geometry: Geometry | null;
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

export interface RemoteCommunityFeature {
  id: string;
  objectId: number | null;
  name: string | null;
  province: string | null;
  population: string | null;
  flyInAccess: string | null;
  railAccess: string | null;
  boatAccess: string | null;
  roadAccess: string | null;
  communityType: string | null;
  communityTypeFr: string | null;
  latitudeDd: number | null;
  longitudeDd: number | null;
  mgrsCoordinates: string | null;
  latitudeDms: string | null;
  longitudeDms: string | null;
  powerGrid: string | null;
  powerGridFr: string | null;
  communityClassification: string | null;
  communityClassificationFr: string | null;
  alternateName: string | null;
  notes: string | null;
  notesFr: string | null;
  accessInformation: string | null;
  accessInformationFr: string | null;
  fid: number | null;
  longitude: number | null;
  latitude: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface EarthquakeFeature {
  id: string;
  eventId: number | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  magnitudeType: string | null;
  magnitude: number | null;
  eventLocationName: string | null;
  eventLocationNameFr: string | null;
  eventTime: string | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface HistoricalEarthquakeFeature {
  id: string;
  magnitudeCode: string | null;
  magnitude: number | null;
  magnitudeType: string | null;
  date: string | null;
  place: string | null;
  depth: number | null;
  latitude: number | null;
  longitude: number | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface SeismographStationFeature {
  id: string;
  network: string | null;
  station: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  siteName: string | null;
  startTime: string | null;
  endTime: string | null;
  seismograph: string | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface GlobalFaultFeature {
  id: string;
  catalogId: string | null;
  catalogName: string | null;
  name: string | null;
  slipType: string | null;
  slipTypeSimple: string | null;
  length: number | null;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface NationalParkFeature {
  id: string;
  clabId: string | null;
  nameEn: string | null;
  nameFr: string | null;
  clabType: string | null;
  clabCategory: string | null;
  area: number | null;
  length: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
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

const PAGINATED_GEOJSON_BATCH_SIZE = 2000;

type ArcGisFeature<TGeometry extends Geometry = Polygon | MultiPolygon> = Feature<TGeometry, Record<string, unknown>>;
type ArcGisFeatureCollection<TGeometry extends Geometry = Polygon | MultiPolygon> = FeatureCollection<
  TGeometry,
  Record<string, unknown>
> & {
  properties?: { exceededTransferLimit?: boolean };
};
type PolygonalFeatureCollection = ArcGisFeatureCollection<Polygon | MultiPolygon>;
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

const fetchPaginatedArcGisGeoJson = async <TGeometry extends Geometry = Polygon | MultiPolygon>(
  baseUrl: string,
  signal: AbortSignal,
): Promise<ArcGisFeatureCollection<TGeometry>> => {
  const features: ArcGisFeature<TGeometry>[] = [];
  let resultOffset = 0;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("resultOffset", String(resultOffset));
    url.searchParams.set("resultRecordCount", String(PAGINATED_GEOJSON_BATCH_SIZE));

    const response = await fetch(url.toString(), { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load fire danger polygons (${response.status})`);
    }
    const json = (await response.json()) as ArcGisFeatureCollection<TGeometry>;
    const batch = json?.features ?? [];
    features.push(...batch);
    const exceededLimit = json?.properties?.exceededTransferLimit;
    if (!exceededLimit || batch.length === 0) {
      break;
    }
    resultOffset += batch.length;
  }

  return {
    type: "FeatureCollection",
    features,
  } as ArcGisFeatureCollection<TGeometry>;
};

const appendBoundsToUrl = (baseUrl: string, bounds?: MapBounds) => {
  if (!bounds) {
    return baseUrl;
  }
  const url = new URL(baseUrl);
  url.searchParams.set("geometry", `${bounds.sw.lng},${bounds.sw.lat},${bounds.ne.lng},${bounds.ne.lat}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  return url.toString();
};

const fetchSimpleGeoJson = async ({ signal, url }: { signal: AbortSignal; url: string }): Promise<FeatureCollection> => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load GeoJSON from ${url}`);
  }
  return (await response.json()) as FeatureCollection;
}



const formatArcGisTimestamp = (value?: string | number | null) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
  }
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

const HISTORICAL_PERIMETER_COLORS = ["#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#a16207"] as const;

const normalizeHistoricalPerimeterFeatures = (
  collection: PolygonalFeatureCollection,
): HistoricalPerimeterFeature[] => {
  if (!collection?.features) {
    return [];
  }

  return collection.features
    .map((feature, index) => {
      if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
        return null;
      }
      const properties = feature.properties ?? {};
      const fid = parseNumericField(properties.FID);
      const uid = parseNumericField(properties.UID);
      const hcount = parseNumericField(properties.HCOUNT);
      const area = parseNumericField(properties.AREA);
      const firstDateRaw = typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null;
      const lastDateRaw = typeof properties.LASTDATE === "string" ? properties.LASTDATE : null;
      const firstDate = firstDateRaw ? formatArcGisTimestamp(firstDateRaw) ?? firstDateRaw : null;
      const lastDate = lastDateRaw ? formatArcGisTimestamp(lastDateRaw) ?? lastDateRaw : null;
      const consisId = parseNumericField(properties.CONSIS_ID);
      const shapeArea = parseNumericField(properties.Shape__Area);
      const shapeLength = parseNumericField(properties.Shape__Length);
      const yearMatch = (firstDateRaw ?? lastDateRaw ?? "").match(/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : "Unknown Year";
      const colorSeed = yearMatch ? Number(yearMatch[1]) : index;
      const color = HISTORICAL_PERIMETER_COLORS[Math.abs(colorSeed) % HISTORICAL_PERIMETER_COLORS.length];

      return {
        id: String(fid ?? feature.id ?? `historical-perimeter-${index}`),
        fid,
        uid,
        hcount,
        area,
        firstDate,
        lastDate,
        consisId,
        shapeArea,
        shapeLength,
        year,
        color,
        geometry: feature.geometry as Geometry,
        properties,
      } satisfies HistoricalPerimeterFeature;
    })
    .filter((feature): feature is HistoricalPerimeterFeature => Boolean(feature));
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

const normalizeFerryRouteFeatures = (collection: FeatureCollection): FerryRouteFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      const centroid = geometry ? computeGeometryCentroid(geometry) : null;
      const fid =
        typeof properties.FID === "number"
          ? properties.FID
          : typeof properties.fid === "number"
            ? properties.fid
            : null;
      const id =
        (fid !== null ? `ferry-route-${fid}` : null) ??
        (typeof feature.id === "string" ? feature.id : null) ??
        `ferry-route-${index}`;
      const normalizeDateString = (value: unknown) => (typeof value === "string" ? value.trim() || null : null);
      return {
        id,
        fid,
        objName: parseStringField(properties.OBJNAM ?? properties.objnam),
        nativeName: parseStringField(properties.NOBJNM ?? properties.nobjnm),
        status: parseStringField(properties.STATUS ?? properties.status),
        info: parseStringField(properties.INFORM ?? properties.inform),
        nativeInfo: parseStringField(properties.NINFOM ?? properties.ninfom),
        textDescription: parseStringField(properties.TXTDSC ?? properties.txtdsc),
        catfry: parseNumericField(properties.CATFRY ?? properties.catfry),
        scaleMin: parseNumericField(properties.SCAMIN ?? properties.scamin),
        scaleMax: parseNumericField(properties.SCAMAX ?? properties.scamax),
        periodStart: normalizeDateString(properties.PERSTA ?? properties.persta),
        periodEnd: normalizeDateString(properties.PEREND ?? properties.perend),
        dateStart: normalizeDateString(properties.DATSTA ?? properties.datsta),
        dateEnd: normalizeDateString(properties.DATEND ?? properties.datend),
        recordedDate: normalizeDateString(properties.RECDAT ?? properties.recdat),
        recordIndicator: parseStringField(properties.RECIND ?? properties.recind),
        sourceDate: normalizeDateString(properties.SORDAT ?? properties.sordat),
        sourceIndicator: parseStringField(properties.SORIND ?? properties.sorind),
        encName: parseStringField(properties.ENC_NAME ?? properties.enc_name ?? properties.ENCNAME),
        lnam: parseStringField(properties.LNAM ?? properties.lnam),
        lnamRefs: parseStringField(properties.LNAM_REFS ?? properties.lnam_refs ?? properties.LNAMREFS),
        inform: parseStringField(properties.INFORM ?? properties.inform),
        nativeInform: parseStringField(properties.NTXTDS ?? properties.ntxtds),
        notes: parseStringField(properties.NTXTDS ?? properties.ntxtds),
        prim: parseNumericField(properties.PRIM ?? properties.prim),
        rcid: parseNumericField(properties.RCID ?? properties.rcid),
        grup: parseNumericField(properties.GRUP ?? properties.grup),
        objl: parseNumericField(properties.OBJL ?? properties.objl),
        rver: parseNumericField(properties.RVER ?? properties.rver),
        agen: parseNumericField(properties.AGEN ?? properties.agen),
        fidn: parseNumericField(properties.FIDN ?? properties.fidn),
        fids: parseNumericField(properties.FIDS ?? properties.fids),
        ffptRind: parseStringField(properties.FFPT_RIND ?? properties.ffpt_rind),
        centroid,
        lengthMeters: parseNumericField(properties.Shape__Length ?? properties.shape__length),
        geometry,
        properties,
      } satisfies FerryRouteFeature;
    })
    .filter((feature): feature is FerryRouteFeature => Boolean(feature));
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
      previousLevel: parseNumericField(properties.LEVEL_PREVIOUS),
      previousFlow: parseNumericField(properties.FLOW_PREVIOUS),
      normalLevelToday: parseNumericField(properties.LEVEL_HISTORICAL_MEAN),
      normalFlowToday: parseNumericField(properties.FLOW_HISTORICAL_MEAN),
      meanAnnualLevel: parseNumericField(properties.LEVEL_HISTORICAL_ANNUAL_MEAN),
      meanAnnualFlow: parseNumericField(properties.FLOW_HISTORICAL_ANNUAL_MEAN),
      historicalMaxLevel: parseNumericField(properties.LEVEL_HISTORICAL_MAX),
      historicalMinLevel: parseNumericField(properties.LEVEL_HISTORICAL_MIN),
      historicalMaxFlow: parseNumericField(properties.FLOW_HISTORICAL_MAX),
      historicalMinFlow: parseNumericField(properties.FLOW_HISTORICAL_MIN),
      levelChange: parseNumericField(properties.LEVEL_DIFFERENCE),
      flowChange: parseNumericField(properties.FLOW_DIFFERENCE),
      diffFromMeanLevel: parseNumericField(properties.LEVEL_DIFF_FROM_MEAN),
      diffFromAnnualLevel: parseNumericField(properties.LEVEL_DIFF_FROM_ANNUAL_MEAN),
      diffFromHistoricalMaxLevel: parseNumericField(properties.LEVEL_DIFF_FROM_HISTORICAL_MAX),
      diffFromHistoricalMinLevel: parseNumericField(properties.LEVEL_DIFF_FROM_HISTORICAL_MIN),
      diffFromMeanFlow: parseNumericField(properties.FLOW_DIFF_FROM_MEAN),
      diffFromAnnualFlow: parseNumericField(properties.FLOW_DIFF_FROM_ANNUAL_MEAN),
      diffFromHistoricalMaxFlow: parseNumericField(properties.FLOW_DIFF_FROM_HISTORICAL_MAX),
      diffFromHistoricalMinFlow: parseNumericField(properties.FLOW_DIFF_FROM_HISTORICAL_MIN),
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

const normalizeDamReservoirFeatures = (collection: FeatureCollection): DamReservoirFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: DamReservoirFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.properties) {
      return;
    }
    const properties = feature.properties ?? {};
    const geometry = (feature.geometry as Geometry | null) ?? null;
    let longitude =
      parseNumericField(properties.LONG_DD ?? properties.Longitude ?? properties.longitude) ?? null;
    let latitude =
      parseNumericField(properties.LAT_DD ?? properties.Latitude ?? properties.latitude) ?? null;
    if (
      (typeof longitude !== "number" || Number.isNaN(longitude) || typeof latitude !== "number" || Number.isNaN(latitude)) &&
      geometry?.type === "Point"
    ) {
      const coords = geometry.coordinates as [number, number];
      longitude = typeof coords?.[0] === "number" ? coords[0] : longitude;
      latitude = typeof coords?.[1] === "number" ? coords[1] : latitude;
    }
    normalized.push({
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `dam-${index}`),
      grandId: parseNumericField(properties.GRAND_ID),
      reservoirName: parseStringField(properties.RES_NAME),
      damName: parseStringField(properties.DAM_NAME),
      altName: parseStringField(properties.ALT_NAME),
      river: parseStringField(properties.RIVER),
      altRiver: parseStringField(properties.ALT_RIVER),
      mainBasin: parseStringField(properties.MAIN_BASIN),
      subBasin: parseStringField(properties.SUB_BASIN),
      nearCity: parseStringField(properties.NEAR_CITY),
      altCity: parseStringField(properties.ALT_CITY),
      adminUnit: parseStringField(properties.ADMIN_UNIT),
      secondaryAdmin: parseStringField(properties.SEC_ADMIN),
      country: parseStringField(properties.COUNTRY),
      secondaryCountry: parseStringField(properties.SEC_CNTRY),
      year: parseNumericField(properties.YEAR),
      altYear: parseNumericField(properties.ALT_YEAR),
      removalYear: parseNumericField(properties.REM_YEAR),
      damHeightMeters: parseNumericField(properties.DAM_HGT_M),
      altHeightMeters: parseNumericField(properties.ALT_HGT_M),
      damLengthMeters: parseNumericField(properties.DAM_LEN_M),
      altLengthMeters: parseNumericField(properties.ALT_LEN_M),
      areaSqKm: parseNumericField(properties.AREA_SKM),
      areaPolygon: parseNumericField(properties.AREA_POLY),
      areaRepresentative: parseNumericField(properties.AREA_REP),
      areaMax: parseNumericField(properties.AREA_MAX),
      areaMin: parseNumericField(properties.AREA_MIN),
      capacityMcm: parseNumericField(properties.CAP_MCM),
      capacityMax: parseNumericField(properties.CAP_MAX),
      capacityRep: parseNumericField(properties.CAP_REP),
      capacityMin: parseNumericField(properties.CAP_MIN),
      depthMeters: parseNumericField(properties.DEPTH_M),
      dischargeAvgLs: parseNumericField(properties.DIS_AVG_LS),
      dorPercent: parseNumericField(properties.DOR_PC),
      elevationMasl: parseNumericField(properties.ELEV_MASL),
      catchmentSqKm: parseNumericField(properties.CATCH_SKM),
      catchmentRepSqKm: parseNumericField(properties.CATCH_REP),
      dataInfo: parseStringField(properties.DATA_INFO),
      useIrrigation: parseStringField(properties.USE_IRRI),
      useElectric: parseStringField(properties.USE_ELEC),
      useSupply: parseStringField(properties.USE_SUPP),
      useFloodControl: parseStringField(properties.USE_FCON),
      useRecreation: parseStringField(properties.USE_RECR),
      useNavigation: parseStringField(properties.USE_NAVI),
      useFisheries: parseStringField(properties.USE_FISH),
      usePowerControl: parseStringField(properties.USE_PCON),
      useLivestock: parseStringField(properties.USE_LIVE),
      useOther: parseStringField(properties.USE_OTHR),
      mainUse: parseStringField(properties.MAIN_USE),
      lakeControl: parseStringField(properties.LAKE_CTRL),
      multiDams: parseStringField(properties.MULTI_DAMS),
      timeline: parseStringField(properties.TIMELINE),
      comments: parseStringField(properties.COMMENTS),
      url: parseStringField(properties.URL),
      quality: parseStringField(properties.QUALITY),
      editor: parseStringField(properties.EDITOR),
      polygonSource: parseStringField(properties.POLY_SRC),
      areaGeoSqKm: parseNumericField(properties.Area_sqKm_Reservoir ?? properties.AREA_GEO),
      longitude,
      latitude,
      geometry,
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

const normalizeNationalParks = (collection: FeatureCollection): NationalParkFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: NationalParkFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    normalized.push({
      id: String(properties.FID ?? properties.OBJECTID ?? feature.id ?? `park-${index}`),
      clabId: parseStringField(properties.CLAB_ID),
      nameEn: parseStringField(properties.NAME_E),
      nameFr: parseStringField(properties.NAME_F),
      clabType: parseStringField(properties.CLAB_TYPE),
      clabCategory: parseStringField(properties.CLAB_CAT),
      area: parseNumericField(properties.Shape__Area),
      length: parseNumericField(properties.Shape__Length),
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
      shapeArea: parseNumericField(properties.Shape__Area ?? properties.SHAPE__Area ?? properties.shape_area),
      shapeLength: parseNumericField(properties.Shape__Length ?? properties.SHAPE__Length ?? properties.shape_length),
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

const normalizeFirstAlertFeatures = (collection: FeatureCollection): FirstAlertFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      const centroid = geometry ? computeGeometryCentroid(geometry) : null;
      const objectIdValue =
        typeof properties.ObjectId === "number"
          ? properties.ObjectId
          : typeof properties.OBJECTID === "number"
            ? properties.OBJECTID
            : null;
      const rawId =
        parseStringField(properties.uniqueKey ?? properties.UNIQUEKEY ?? properties.unique_key) ??
        (objectIdValue !== null ? String(objectIdValue) : null) ??
        (typeof feature.id === "string" ? feature.id : null) ??
        `first-alert-${index}`;
      let longitude =
        parseNumericField(properties.estimatedEventLocationLongitude ?? properties.ESTIMATEDEVENTLOCATIONLONGITUDE) ??
        null;
      let latitude =
        parseNumericField(properties.estimatedEventLocationLatitude ?? properties.ESTIMATEDEVENTLOCATIONLATITUDE) ??
        null;
      if (geometry?.type === "Point") {
        const coords = geometry.coordinates as [number, number] | undefined;
        if (Array.isArray(coords) && coords.length >= 2) {
          const [geomLon, geomLat] = coords;
          if (Number.isFinite(geomLon)) {
            longitude = geomLon;
          }
          if (Number.isFinite(geomLat)) {
            latitude = geomLat;
          }
        }
      }
      if ((longitude === null || latitude === null) && centroid) {
        longitude = longitude ?? centroid.longitude;
        latitude = latitude ?? centroid.latitude;
      }
      const eventTimeValue =
        typeof properties.eventTime === "number" || typeof properties.eventTime === "string"
          ? properties.eventTime
          : typeof properties.EVENTTIME === "number" || typeof properties.EVENTTIME === "string"
            ? properties.EVENTTIME
            : null;
      const alertListsName = parseStringField(properties.alertListsName ?? properties.ALERTLISTSNAME);
      const alertTopicsName = parseStringField(properties.alertTopicsName ?? properties.ALERTTOPICSNAME);
      const normalizedFeature: FirstAlertFeature = {
        id: rawId,
        objectId: objectIdValue,
        alertType: parseStringField(properties.alertType ?? properties.ALERTTYPE),
        eventTime: formatArcGisTimestamp(eventTimeValue),
        headline: parseStringField(properties.headline ?? properties.HEADLINE),
        subHeadlineTitle: parseStringField(properties.subHeadlineTitle ?? properties.SUBHEADLINETITLE),
        alertListsName,
        alertTopicsName,
        alertLists: normalizeDelimitedValues(properties.alertListsName ?? properties.ALERTLISTSNAME),
        alertTopics: normalizeDelimitedValues(properties.alertTopicsName ?? properties.ALERTTOPICSNAME),
        estimatedEventLocationName: parseStringField(
          properties.estimatedEventLocationName ?? properties.ESTIMATEDEVENTLOCATIONNAME,
        ),
        estimatedEventLocationRadius: parseNumericField(
          properties.estimatedEventLocationRadius ?? properties.ESTIMATEDEVENTLOCATIONRADIUS,
        ),
        longitude,
        latitude,
        centroid,
        firstAlertUrl: parseStringField(properties.firstAlertURL ?? properties.firstAlertUrl ?? properties.FIRSTALERTURL),
        publicPostLink: parseStringField(properties.publicPostLink ?? properties.PUBLICPOSTLINK),
        publicPostText: parseStringField(properties.publicPostText ?? properties.PUBLICPOSTTEXT),
        publicPostTranslatedText: parseStringField(
          properties.publicPostTranslatedText ?? properties.PUBLICPOSTTRANSLATEDTEXT,
        ),
        publicPostMedia: parseStringField(properties.publicPostMedia ?? properties.PUBLICPOSTMEDIA),
        termsOfUse: parseStringField(properties.TermsOfUse ?? properties.termsOfUse ?? properties.TERMSOFUSE),
        epoch: parseStringField(properties.epoch ?? properties.EPOCH),
        uniqueKey: parseStringField(properties.uniqueKey ?? properties.UNIQUEKEY ?? properties.unique_key),
        geometry,
        properties,
      };
      return normalizedFeature;
    })
    .filter((feature): feature is FirstAlertFeature => Boolean(feature));
};

const normalizeHealthcareFacilityFeatures = (collection: FeatureCollection): HealthcareFacilityFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      let longitude: number | null = parseNumericField(properties.longitude ?? properties.LONGITUDE);
      let latitude: number | null = parseNumericField(properties.latitude ?? properties.LATITUDE);
      if ((longitude === null || latitude === null) && geometry?.type === "Point") {
        const [lng, lat] = geometry.coordinates as [number, number];
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          longitude = lng;
          latitude = lat;
        }
      }
      const id =
        parseStringField(properties.index_ ?? properties.index) ??
        (typeof properties.ObjectId2 === "number" ? String(properties.ObjectId2) : null) ??
        (typeof feature.id === "string" ? feature.id : null) ??
        `healthcare-${index}`;

      const normalized: HealthcareFacilityFeature = {
        id,
        objectId: typeof properties.ObjectId === "number" ? properties.ObjectId : null,
        index: parseStringField(properties.index_ ?? properties.index),
        facilityName: parseStringField(properties.facility_name ?? properties.FACILITY_NAME),
        sourceFacilityType: parseStringField(properties.source_facility_type ?? properties.SOURCE_FACILITY_TYPE),
        odhfFacilityType: parseStringField(properties.odhf_facility_type ?? properties.ODHF_FACILITY_TYPE),
        provider: parseStringField(properties.provider ?? properties.PROVIDER),
        unit: parseStringField(properties.unit ?? properties.UNIT),
        streetNumber: parseStringField(properties.street_no ?? properties.STREET_NO),
        streetName: parseStringField(properties.street_name ?? properties.STREET_NAME),
        postalCode: parseStringField(properties.postal_code ?? properties.POSTAL_CODE),
        city: parseStringField(properties.city ?? properties.CITY),
        province: parseStringField(properties.province ?? properties.PROVINCE),
        fullAddress: parseStringField(properties.source_format_str_address ?? properties.SOURCE_FORMAT_STR_ADDRESS),
        csdName: parseStringField(properties.CSDname ?? properties.CSDNAME),
        csdUid: parseNumericField(properties.CSDuid ?? properties.CSDUID),
        prUid: parseNumericField(properties.Pruid ?? properties.PRUID),
        longitude,
        latitude,
        geometry,
        properties,
      };
      return normalized;
    })
    .filter((feature): feature is HealthcareFacilityFeature => Boolean(feature));
};

const NACEI_LAYER_LABELS: Record<number, string> = {
  0: "Border Crossings",
  1: "Electric Transmission Line",
  2: "Natural Gas Pipeline",
  3: "Liquids Pipeline",
  4: "Natural Gas Processing Plants",
  5: "Liquefied Natural Gas Terminals",
  6: "Liquefied Natural Gas Terminals (by Type)",
  7: "Export",
  8: "Import",
  9: "Import / Export",
  10: "Refineries",
  11: "Refineries (by Type)",
  12: "Refinery",
  13: "Upgrader",
  14: "Asphalt Refinery",
  15: "Power Plants (100+ MW)",
  16: "Power Plants (by Energy Source)",
  17: "Biomass",
  18: "Coal",
  19: "Geothermal",
  20: "Hydroelectric",
  21: "Natural Gas",
  22: "Nuclear",
  23: "Other",
  24: "Petroleum",
  25: "Pumped Storage",
  26: "Solar",
  27: "Wind",
  28: "Renewable Energy Power Plants (1+ MW)",
  29: "Renewable (by Energy Source)",
  30: "Biomass (Renewable)",
  31: "Geothermal (Renewable)",
  32: "Hydroelectric (Renewable)",
  33: "Pumped Storage (Renewable)",
  34: "Solar (Renewable)",
  35: "Tidal (Renewable)",
  36: "Wind (Renewable)",
  37: "Natural Gas Underground Storage",
};

const NACEI_LAYER_IDS = Object.keys(NACEI_LAYER_LABELS).map((key) => Number(key));

const normalizeEnergyInfrastructureFeatures = (collection: FeatureCollection, layerId: number): EnergyInfrastructureFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      let longitude: number | null = parseNumericField(properties.Longitude ?? properties.longitude ?? properties.LONGITUDE);
      let latitude: number | null = parseNumericField(properties.Latitude ?? properties.latitude ?? properties.LATITUDE);
      if ((longitude === null || latitude === null) && geometry?.type === "Point") {
        const coords = geometry.coordinates as [number, number];
        if (Array.isArray(coords) && coords.length >= 2) {
          const [lng, lat] = coords;
          if (Number.isFinite(lng)) longitude = lng;
          if (Number.isFinite(lat)) latitude = lat;
        }
      }
      const id =
        typeof properties.OBJECTID === "number"
          ? `${layerId}-${properties.OBJECTID}`
          : typeof feature.id === "string"
            ? `${layerId}-${feature.id}`
            : `nacei-${layerId}-${index}`;
      const energyBreakdown: Record<string, number | null> = {
        coalMw: parseNumericField(properties.Coal_MW ?? properties.coal_mw),
        naturalGasMw: parseNumericField(properties.NG_MW ?? properties.ng_mw),
        crudeMw: parseNumericField(properties.Crude_MW ?? properties.crude_mw ?? properties.Petroleum_MW),
        otherMw: parseNumericField(properties.Other_MW ?? properties.other_mw),
        hydroMw: parseNumericField(properties.Hydro_MW ?? properties.hydro_mw),
        hydroPsMw: parseNumericField(properties.HydroPS_MW ?? properties.hydroPS_mw),
        nuclearMw: parseNumericField(properties.Nuclear_MW ?? properties.nuclear_mw),
        solarMw: parseNumericField(properties.Solar_MW ?? properties.solar_mw),
        windMw: parseNumericField(properties.Wind_MW ?? properties.wind_mw),
        geoMw: parseNumericField(properties.Geo_MW ?? properties.geo_mw),
        bioMw: parseNumericField(properties.Bio_MW ?? properties.bio_mw),
        tidalMw: parseNumericField(properties.Tidal_MW ?? properties.tidal_mw),
      };
      return {
        id,
        layerId,
        layerName: NACEI_LAYER_LABELS[layerId] ?? `Layer ${layerId}`,
        facility: parseStringField(properties.Facility ?? properties.facility),
        owner: parseStringField(properties.Owner ?? properties.owner),
        operator: parseStringField(properties.Operator ?? properties.operator),
        country: parseStringField(properties.Country ?? properties.country),
        city: parseStringField(properties.City ?? properties.city),
        stateProvince: parseStringField(properties.StateProv ?? properties.stateprov ?? properties.state_province),
        county: parseStringField(properties.County ?? properties.county),
        zipCode: parseStringField(properties.ZipCode ?? properties.zipcode ?? properties.zip_code),
        address: parseStringField(properties.Address ?? properties.address),
        totalMw: parseNumericField(properties.Total_MW ?? properties.total_mw),
        renewableMw: parseNumericField(properties.Renew_MW ?? properties.renew_mw),
        primarySource: parseStringField(properties.PrimSource ?? properties.primsource),
        primaryRenewable: parseStringField(properties.PrimRenew ?? properties.primrenew),
        energyBreakdown,
        referencePeriod: parseStringField(properties.Period ?? properties.period),
        sourceAgency: parseStringField(properties.Source ?? properties.source),
        longitude,
        latitude,
        geometry,
        properties,
      } satisfies EnergyInfrastructureFeature;
    })
    .filter((feature): feature is EnergyInfrastructureFeature => Boolean(feature));
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

const fetchRailways = async ({
  signal,
  bounds,
}: {
  signal: AbortSignal;
  bounds?: MapBounds;
  zoom?: number;
}): Promise<RailwayFeature[]> => {
  const url = appendBoundsToUrl(RAILWAYS_URL, bounds);
  const collection = await fetchPaginatedArcGisGeoJson<LineString | MultiLineString>(url, signal);
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

const fetchFerryRoutes = async ({ signal }: { signal: AbortSignal }): Promise<FerryRouteFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<LineString | MultiLineString>(FERRY_ROUTES_URL, signal);
  return normalizeFerryRouteFeatures(collection) ?? [];
};

const fetchHydrometricStations = async ({
  signal,
  bounds,
  zoom,
}: {
  signal: AbortSignal;
  bounds?: MapBounds;
  zoom?: number;
}): Promise<HydrometricStationFeature[]> => {
  if (typeof zoom === "number" && zoom < 5) {
    return [];
  }
  const url = appendBoundsToUrl(HYDROMETRIC_STATIONS_URL, bounds);
  const collection = await fetchPaginatedArcGisGeoJson(url, signal);
  return normalizeHydrometricStationFeatures(collection) ?? [];
};

const fetchDamReservoirs = async ({
  signal,
  bounds,
  zoom,
}: {
  signal: AbortSignal;
  bounds?: MapBounds;
  zoom?: number;
}): Promise<DamReservoirFeature[]> => {
  if (typeof zoom === "number" && zoom < 5) {
    return [];
  }
  const url = appendBoundsToUrl(DAMS_RESERVOIRS_URL, bounds);
  const collection = await fetchPaginatedArcGisGeoJson<Polygon | MultiPolygon>(url, signal);
  return normalizeDamReservoirFeatures(collection as FeatureCollection<Polygon | MultiPolygon>);
};

const fetchBuildingFootprints = async ({ signal }: { signal: AbortSignal }): Promise<BuildingFootprintFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(BUILDING_FOOTPRINTS_URL, signal);
  return normalizeBuildingFootprintFeatures(collection) ?? [];
};

const fetchPropertyBoundaries = async ({ signal }: { signal: AbortSignal }): Promise<PropertyBoundaryFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(PROPERTY_BOUNDARIES_URL, signal);
  return normalizePropertyBoundaryFeatures(collection) ?? [];
};

const fetchNationalParks = async ({ signal }: { signal: AbortSignal }): Promise<NationalParkFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(NATIONAL_PARKS_URL, signal);
  return normalizeNationalParks(collection) ?? [];
};

const fetchIndigenousLandBoundaries = async ({
  signal,
  bounds,
  zoom,
}: {
  signal: AbortSignal;
  bounds?: MapBounds;
  zoom?: number;
}): Promise<IndigenousLandBoundaryFeature[]> => {
  if (typeof zoom === "number" && zoom < 5) {
    return [];
  }
  const url = appendBoundsToUrl(INDIGENOUS_LAND_BOUNDARIES_URL, bounds);
  const collection = await fetchPaginatedArcGisGeoJson<Polygon | MultiPolygon>(url, signal);
  return normalizeIndigenousLandBoundaries(collection as FeatureCollection<Polygon | MultiPolygon>) ?? [];
};

const fetchCHCResponseZones = async ({ signal }: { signal: AbortSignal }): Promise<CHCResponseZoneFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(CHC_RESPONSE_ZONE_URL, signal);
  return normalizeCHCResponseZones(collection);
};

const fetchSources = async ({ signal }: { signal: AbortSignal }): Promise<SourceLayerFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(SOURCES_URL, signal);
  return normalizeSourceFeatures(collection);
};

const fetchFirstAlerts = async ({ signal }: { signal: AbortSignal }): Promise<FirstAlertFeature[]> => {
  const token = getApiKey(FIRST_ALERTS_API_KEY_ID);
  if (!token) {
    throw new Error("Configure the First Alerts token in the API keys tab to load this layer.");
  }
  const url = new URL(FIRST_ALERTS_URL);
  url.searchParams.set("token", token);
  const collection = await fetchPaginatedArcGisGeoJson<Geometry>(url.toString(), signal);
  return normalizeFirstAlertFeatures(collection);
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

const fetchRemoteCommunities = async ({ signal }: { signal: AbortSignal }): Promise<RemoteCommunityFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<Point>(REMOTE_COMMUNITIES_URL, signal);
  return normalizeRemoteCommunityFeatures(collection);
};

const fetchRecentEarthquakes = async ({ signal }: { signal: AbortSignal }): Promise<EarthquakeFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<Point>(EARTHQUAKES_URL, signal);
  return normalizeEarthquakeFeatures(collection as FeatureCollection<Point>);
};

const fetchHistoricalEarthquakes = async ({
  signal,
}: {
  signal: AbortSignal;
}): Promise<HistoricalEarthquakeFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<Point>(HISTORICAL_EARTHQUAKES_URL, signal);
  return normalizeHistoricalEarthquakeFeatures(collection as FeatureCollection<Point>);
};

const fetchSeismographStations = async ({ signal }: { signal: AbortSignal }): Promise<SeismographStationFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<Point>(SEISMOGRAPH_STATIONS_URL, signal);
  return normalizeSeismographStations(collection as FeatureCollection<Point>);
};

const fetchGlobalFaults = async ({
  signal,
  bounds,
}: {
  signal: AbortSignal;
  bounds?: MapBounds;
}): Promise<GlobalFaultFeature[]> => {
  const url = appendBoundsToUrl(GLOBAL_FAULTS_URL, bounds);
  const collection = await fetchPaginatedArcGisGeoJson<LineString | MultiLineString>(url, signal);
  return normalizeGlobalFaultFeatures(collection as FeatureCollection<LineString | MultiLineString>);
};

const fetchHealthcareFacilities = async ({ signal }: { signal: AbortSignal }): Promise<HealthcareFacilityFeature[]> => {
  // Paginate like other ArcGIS feeds to handle exceededTransferLimit responses.
  const collection = await fetchPaginatedArcGisGeoJson<Point>(HEALTHCARE_FACILITIES_URL, signal);
  return normalizeHealthcareFacilityFeatures(collection);
};

const fetchEnergyInfrastructure = async ({ signal }: { signal: AbortSignal }): Promise<EnergyInfrastructureFeature[]> => {
  const requests = NACEI_LAYER_IDS.map(async (layerId) => {
    const url = `${NACEI_BASE_URL}/${layerId}/query?where=1%3D1&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&having=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&queryByDistance=&returnExtentOnly=false&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&f=geojson`;
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load NACEI layer ${layerId} (${response.status})`);
    }
    const collection = (await response.json()) as FeatureCollection;
    return normalizeEnergyInfrastructureFeatures(collection, layerId);
  });
  const results = await Promise.all(requests);
  return results.flat();
};

export interface HistoricalPerimeterFeature {
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
  year: string;
  color: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

const fetchHistoricalPerimeters = async ({ signal }: { signal: AbortSignal }): Promise<HistoricalPerimeterFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson<Polygon | MultiPolygon>(CWFIS_HISTORICAL_PERIMETERS_URL, signal);
  return normalizeHistoricalPerimeterFeatures(collection as FeatureCollection<Polygon | MultiPolygon>);
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

const normalizeRemoteCommunityFeatures = (collection: FeatureCollection): RemoteCommunityFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry;
      const readNumberField = (...keys: string[]): number | null => {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(properties, key)) {
            const parsed = parseNumericField(properties[key]);
            if (parsed !== null) {
              return parsed;
            }
          }
        }
        return null;
      };
      const readStringField = (...keys: string[]): string | null => {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(properties, key)) {
            const parsed = parseStringField(properties[key]);
            if (parsed) {
              return parsed;
            }
          }
        }
        return null;
      };

      let longitude: number | null = null;
      let latitude: number | null = null;
      if (geometry && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
        const [maybeLng, maybeLat] = geometry.coordinates;
        if (typeof maybeLng === "number" && typeof maybeLat === "number") {
          longitude = maybeLng;
          latitude = maybeLat;
        }
      }

      const fallbackLongitude = readNumberField("Longitude_DD", "longitude_dd");
      const fallbackLatitude = readNumberField("Latitude_DD", "latitude_dd");
      const finalLongitude = longitude ?? fallbackLongitude ?? null;
      const finalLatitude = latitude ?? fallbackLatitude ?? null;

      if (finalLongitude === null || finalLatitude === null) {
        return null;
      }

      const id = String(
        properties.OBJECTID ??
          properties.objectid ??
          properties.FID ??
          feature.id ??
          `remote-community-${index}`,
      );

      return {
        id,
        objectId: readNumberField("OBJECTID", "objectid"),
        name: readStringField("Name", "name"),
        province: readStringField("Province", "province"),
        population: readStringField("Population", "population"),
        flyInAccess: readStringField("Fly_In_Access", "fly_in_access"),
        railAccess: readStringField("Rail_Access", "rail_access"),
        boatAccess: readStringField("Boat_Access", "boat_access"),
        roadAccess: readStringField("Road_Access", "road_access"),
        communityType: readStringField("Community_Type", "community_type"),
        communityTypeFr: readStringField("Type_de_communaut\u00E9"),
        latitudeDd: readNumberField("Latitude_DD", "latitude_dd"),
        longitudeDd: readNumberField("Longitude_DD", "longitude_dd"),
        mgrsCoordinates: readStringField("MGRS_Coordinates", "mgrs_coordinates"),
        latitudeDms: readStringField("Latitude_DMS", "latitude_dms"),
        longitudeDms: readStringField("Longitude_DMS", "longitude_dms"),
        powerGrid: readStringField("Power_Grid", "power_grid"),
        powerGridFr: readStringField("R\u00E9seau_\u00E9lectrique", "RESEAU_ELECTRIQUE"),
        communityClassification: readStringField("Community_Classification", "community_classification"),
        communityClassificationFr: readStringField("Classification_de_la_communaut\u00E9"),
        alternateName: readStringField("Alternate_Name___Nom_alternatif"),
        notes: readStringField("Notes"),
        notesFr: readStringField("Notes___FR"),
        accessInformation: readStringField("Access_Information"),
        accessInformationFr: readStringField("Information_d_acc\u00E8s"),
        fid: readNumberField("FID"),
        longitude: finalLongitude,
        latitude: finalLatitude,
        centroid: geometry ? computeGeometryCentroid(geometry) : null,
        geometry: geometry ?? null,
        properties,
      } as RemoteCommunityFeature;
    })
    .filter((feature): feature is RemoteCommunityFeature => Boolean(feature));
};

const normalizeEarthquakeFeatures = (collection: FeatureCollection<Point>): EarthquakeFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
      const longitude = typeof coordinates[0] === "number" ? coordinates[0] : parseNumericField(properties.Longitude);
      const latitude = typeof coordinates[1] === "number" ? coordinates[1] : parseNumericField(properties.Latitude);
      if (longitude === null || latitude === null) {
        return null;
      }
      const id =
        String(properties.OBJECTID ?? properties.objectid ?? feature.id ?? `earthquake-${index}`) ||
        `earthquake-${index}`;
      return {
        id,
        eventId: parseNumericField(properties.EventID),
        latitude,
        longitude,
        depthKm: parseNumericField(properties.Depthkm),
        magnitudeType: parseStringField(properties.MagType),
        magnitude: parseNumericField(properties.Magnitude),
        eventLocationName: parseStringField(properties.EventLocationName),
        eventLocationNameFr: parseStringField(properties.EvenementEmplacementNom),
        eventTime: formatArcGisTimestamp(properties.EventTime ?? properties.EVENTTIME ?? null),
        geometry,
        properties,
      } as EarthquakeFeature;
    })
    .filter((feature): feature is EarthquakeFeature => Boolean(feature));
};

const normalizeHistoricalEarthquakeFeatures = (collection: FeatureCollection<Point>): HistoricalEarthquakeFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
      const longitude = typeof coordinates[0] === "number" ? coordinates[0] : parseNumericField(properties.longitude);
      const latitude = typeof coordinates[1] === "number" ? coordinates[1] : parseNumericField(properties.latitude);
      if (longitude === null || latitude === null) {
        return null;
      }
      const id = String(properties.OBJECTID ?? properties.objectid ?? feature.id ?? `historical-earthquake-${index}`);
      return {
        id,
        magnitudeCode: parseStringField(properties.magnitude_codelist),
        magnitude: parseNumericField(properties.magnitude),
        magnitudeType: parseStringField(properties.magnitude_type),
        date: parseStringField(properties.date),
        place: parseStringField(properties.place),
        depth: parseNumericField(properties.depth),
        latitude,
        longitude,
        geometry,
        properties,
      } as HistoricalEarthquakeFeature;
    })
    .filter((feature): feature is HistoricalEarthquakeFeature => Boolean(feature));
};

const normalizeSeismographStations = (collection: FeatureCollection<Point>): SeismographStationFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      const coords = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
      const longitude = typeof coords[0] === "number" ? coords[0] : parseNumericField(properties.Longitude);
      const latitude = typeof coords[1] === "number" ? coords[1] : parseNumericField(properties.Latitude);
      if (longitude === null || latitude === null) {
        return null;
      }
      const id = String(properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `seismograph-${index}`);
      return {
        id,
        network: parseStringField(properties.F_Network),
        station: parseStringField(properties.Station),
        latitude,
        longitude,
        elevation: parseNumericField(properties.Elevation),
        siteName: parseStringField(properties.SiteName),
        startTime: formatArcGisTimestamp(properties.StartTime),
        endTime: parseStringField(properties.EndTime),
        seismograph: parseStringField(properties.Seismograph),
        geometry,
        properties,
      } as SeismographStationFeature;
    })
    .filter((feature): feature is SeismographStationFeature => Boolean(feature));
};

const normalizeGlobalFaultFeatures = (collection: FeatureCollection<LineString | MultiLineString>): GlobalFaultFeature[] => {
  if (!collection?.features) {
    return [];
  }
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = feature.geometry ?? null;
      if (!geometry) {
        return null;
      }
      const id = String(properties.OBJECTID ?? feature.id ?? `fault-${index}`);
      return {
        id,
        catalogId: parseStringField(properties.catalog_id),
        catalogName: parseStringField(properties.catalog_na),
        name: parseStringField(properties.name),
        slipType: parseStringField(properties.slip_type),
        slipTypeSimple: parseStringField(properties.slip_type_simple),
        length: parseNumericField(properties.Shape__Length),
        geometry,
        properties,
      } as GlobalFaultFeature;
    })
    .filter((feature): feature is GlobalFaultFeature => Boolean(feature));
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
    id: "first-alerts",
    label: "First Alerts",
    description: "First Alerts situational reports with headlines, links, and alert topics.",
    colorHex: "#e3528e",
    hoverColorHex: "#c43772",
    viewTypes: ["general"],
    kind: "data",
    fetcher: fetchFirstAlerts,
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
    colorHex: "#C6DAFB",
    hoverColorHex: "#9bbce4",
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
    colorHex: "#a0a5bd",
    hoverColorHex: "#7a7f99",
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
    viewTypes: ["transportation"],
    kind: "data",
    fetcher: fetchBorderEntries,
  },
  {
    id: "aerodromes",
    label: "Aerodromes",
    description: "Canadian aerodromes with ICAO codes, elevation, and runway info.",
    colorHex: "#7c3aed",
    hoverColorHex: "#6d28d9",
    viewTypes: ["transportation"],
    kind: "data",
    fetcher: fetchAerodromes,
  },
  {
    id: "railways",
    label: "National Railway Network",
    description: "National railway track segments and operational attributes.",
    colorHex: "#f59e0b",
    hoverColorHex: "#d97706",
    viewTypes: ["transportation"],
    kind: "data",
    fetcher: fetchRailways,
  },
  {
    id: "highways",
    label: "National Highway System",
    description: "National highway corridors and provincial ownership details.",
    colorHex: "#059669",
    hoverColorHex: "#047857",
    viewTypes: ["transportation"],
    kind: "data",
    fetcher: fetchHighways,
  },
  {
    id: "ferry-routes",
    label: "Ferry Routes",
    description: "Marine ferry routes from the Canadian vessel routing dataset.",
    colorHex: "#7dd3fc",
    hoverColorHex: "#0ea5e9",
    viewTypes: ["transportation"],
    kind: "data",
    fetcher: fetchFerryRoutes,
  },
  {
    id: "hydrometric-stations",
    label: "Hydrometric Stations",
    description: "Water level & streamflow monitoring sites across Canada.",
    colorHex: "#10b981",
    hoverColorHex: "#059669",
    viewTypes: ["flooding"],
    kind: "data",
    fetcher: fetchHydrometricStations,
  },
  {
    id: "surface-water-levels",
    label: "Surface Water Levels at Hydrometric Stations",
    description: "Current surface water levels, flows, and anomalies across NRCan hydrometric stations.",
    colorHex: "#0ea5e9",
    hoverColorHex: "#0284c7",
    viewTypes: ["flooding"],
    kind: "data",
    fetcher: fetchHydrometricStations,
  },
  {
    id: "dams-reservoirs",
    label: "Global Dams & Reservoirs",
    description: "WWF and GRAND database of major dams, reservoirs, and their operating characteristics.",
    colorHex: "#749fe8",
    hoverColorHex: "#4f78c7",
    viewTypes: ["flooding", "infrastructure"],
    kind: "data",
    fetcher: fetchDamReservoirs,
  },
  {
    id: "chc-response-zone",
    label: "CHC Response Zone",
    description: "Canadian Hurricane Centre response zone extent.",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    viewTypes: ["hurricanes"],
    kind: "data",
    fetcher: fetchCHCResponseZones,
  },
  {
    id: "environment-canada-weather-alerts",
    label: "Environment Canada Weather Alerts",
    description: "Active warnings and advisories published by Environment and Climate Change Canada.",
    colorHex: "#A1D9E0",
    hoverColorHex: "#78c3cb",
    viewTypes: ["general", "hurricanes"],
    kind: "data",
    fetcher: fetchEnvironmentCanadaWeatherAlerts,
  },
  {
    id: "healthcare-facilities",
    label: "Healthcare Facilities (ODHF)",
    description: "Open Database of Healthcare Facilities with provider and address details.",
    colorHex: "#6ee676",
    hoverColorHex: "#4fc85b",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchHealthcareFacilities,
  },
  {
    id: "energy-infrastructure",
    label: "Energy Infrastructure (NACEI)",
    description: "Cross-border energy infrastructure including pipelines, power plants, and storage.",
    colorHex: "#7dd3fc",
    hoverColorHex: "#0ea5e9",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchEnergyInfrastructure,
  },
  {
    id: "sources",
    label: "Sources",
    description: "Government-reported sources and references.",
    colorHex: "#9b59d9",
    hoverColorHex: "#8e44ad",
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
    colorHex: "#d6d167",
    hoverColorHex: "#bfb64c",
    viewTypes: ["population"],
    kind: "data",
    fetcher: fetchIndigenousLandBoundaries,
  },
  {
    id: "remote-communities",
    label: "Remote Communities",
    description: "Remote community points with population, access, and infrastructure metadata.",
    colorHex: "#e8bb84",
    hoverColorHex: "#d49b5c",
    viewTypes: ["population"],
    kind: "data",
    fetcher: fetchRemoteCommunities,
  },
  {
    id: "recent-earthquakes",
    label: "Recent Earthquakes (NRCan, 30 days)",
    description: "Earthquakes detected by Natural Resources Canada within the past 30 days.",
    colorHex: "#facc15",
    hoverColorHex: "#ca8a04",
    viewTypes: ["earthquakes"],
    kind: "data",
    fetcher: fetchRecentEarthquakes,
  },
  {
    id: "historical-earthquakes",
    label: "Historical Earthquakes in Canada (NRCan)",
    description: "Historical seismic events recorded across Canada.",
    colorHex: "#92400e",
    hoverColorHex: "#78350f",
    viewTypes: ["earthquakes"],
    kind: "data",
    fetcher: fetchHistoricalEarthquakes,
  },
  {
    id: "seismograph-stations",
    label: "Seismograph Stations (NRCan)",
    description: "Seismograph station locations, instruments, and operational windows.",
    colorHex: "#f59e0b",
    hoverColorHex: "#d97706",
    viewTypes: ["earthquakes"],
    kind: "data",
    fetcher: fetchSeismographStations,
  },
  {
    id: "global-active-faults",
    label: "Global Active Earthquake Faults",
    description: "Active fault traces categorized by slip type.",
    colorHex: "#ef4444",
    hoverColorHex: "#b91c1c",
    viewTypes: ["earthquakes"],
    kind: "data",
    fetcher: fetchGlobalFaults,
  },
  {
    id: "building-footprints",
    label: "Building Footprints (GoC)",
    description: "Government of Canada building footprints from the Directory of Federal Real Property.",
    colorHex: "#e34f4f",
    hoverColorHex: "#c53030",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchBuildingFootprints,
  },
  {
    id: "property-boundaries",
    label: "Property Boundaries (GoC)",
    description: "Federal property outlines and custodial details from the Directory of Federal Real Property.",
    colorHex: "#f06c67",
    hoverColorHex: "#d6534f",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchPropertyBoundaries,
  },
  {
    id: "national-parks",
    label: "National Parks of Canada",
    description: "Boundaries of Canada's National Parks.",
    colorHex: "#22c55e",
    hoverColorHex: "#16a34a",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchNationalParks,
  },
  {
    id: "historical-perimeters",
    label: "Historical Fire Perimeters (CWFIS)",
    description: "Historical wildfire perimeters by year.",
    colorHex: "#eab308",
    hoverColorHex: "#ca8a04",
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchHistoricalPerimeters,
  },
  {
    id: CAMERA_LAYER_ID,
    label: "Ottawa traffic cameras",
    description: "City of Ottawa & MTO roadside feeds with live stills.",
    colorHex: "#0ea5e9",
    hoverColorHex: "#0284c7",
    viewTypes: ["infrastructure"],
    kind: "camera",
  },
];

export const DATA_LAYER_CONFIGS = MAP_LAYER_CONFIGS.filter((layer): layer is DataMapLayerConfig => layer.kind === "data");

export const MAP_LAYER_LOOKUP = MAP_LAYER_CONFIGS.reduce<Record<string, MapLayerConfig>>((acc, layer) => {
  acc[layer.id] = layer;
  return acc;
}, {});
