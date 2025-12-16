declare module 'geojson-stream-whatwg' {
    export function parse(): TransformStream;
    export function stringify(): TransformStream;
    const geojsonStream: { parse: typeof parse; stringify: typeof stringify };
    export default geojsonStream;
}
