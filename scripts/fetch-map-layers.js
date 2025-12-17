
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Configuration
const LAYERS = [
    {
        name: 'indigenous-land-boundaries',
        url: 'https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Aboriginal_Lands_Boundaries_INAC/FeatureServer/0/query',
        params: {
            where: '1=1',
            outFields: '*',
            returnGeometry: 'true',
            f: 'geojson',
            outSR: '4326',
            resultRecordCount: '2000'
        }
    },
    {
        name: 'census-2021-da',
        url: 'https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Census_2021_Population_by_Dissemination_Area/FeatureServer/0/query',
        params: {
            where: '1=1',
            outFields: '*',
            returnGeometry: 'true',
            f: 'geojson',
            outSR: '4326',
            resultRecordCount: '2000' // Max request size
        }
    }
];

async function fetchAllFeatures(layer) {
    let allFeatures = [];
    let offset = 0;
    let hasMore = true;

    console.log(`Fetching ${layer.name}...`);

    while (hasMore) {
        const params = new URLSearchParams(layer.params);
        params.set('resultOffset', offset.toString());

        const url = `${layer.url}?${params.toString()}`;
        // console.log(`Fetch: ${url}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.statusText}`);
            }

            const data = await response.json();
            const features = data.features || [];

            if (features.length === 0) {
                hasMore = false;
            } else {
                allFeatures.push(...features);
                offset += features.length;
                console.log(`  Fetched ${features.length} features (Total: ${allFeatures.length})`);

                // Check transfer limit
                if (!data.properties?.exceededTransferLimit && features.length < parseInt(layer.params.resultRecordCount)) {
                    hasMore = false;
                }
            }
        } catch (err) {
            console.error(`Error fetching ${layer.name}:`, err);
            break;
        }
    }

    return {
        type: "FeatureCollection",
        features: allFeatures
    };
}

async function main() {
    for (const layer of LAYERS) {
        const featureCollection = await fetchAllFeatures(layer);
        const outputPath = path.join(DATA_DIR, `${layer.name}.geojson`);

        console.log(`Writing ${featureCollection.features.length} features to ${outputPath}...`);
        fs.writeFileSync(outputPath, JSON.stringify(featureCollection));
    }
    console.log("Done!");
}

main();
