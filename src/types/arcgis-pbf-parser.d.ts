declare module 'arcgis-pbf-parser' {
    export default function ArcGisPbfParser(buffer: Uint8Array): import('geojson').FeatureCollection;
}
