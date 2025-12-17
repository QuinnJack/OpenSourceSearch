# OpenSourceSearch: Feature Showcase Report

## Executive Summary
OpenSourceSearch is a comprehensive media verification and open-source intelligence (OSINT) tool designed to help analysts authenticate images, geolocate content, and visualize context using rich map data. This report outlines the core modules of the application and details the specific features available in each tab.

---

## 1. Dashboard & Upload
**Purpose**: The central command center for investigation. Analysts can begin by dragging-and-dropping media files or pasting direct URLs to initiate the verification pipeline.

**Key Features**:
*   **Secure API Management (Bring Your Own Key)**:
    *   *Concept*: Instead of routing requests through a central OpenSourceSearch server, the application is designed to be **serverless**. Users input their own API keys (for Google Cloud, SightEngine, etc.) directly into the browser.
    *   *Why it matters*:
        *   **Cost Control**: Agencies pay only for their own usage.
        *   **Security & Privacy**: Your API keys identify *you* to the service provider, preventing quota theft by others.
*   **Privacy-First Architecture**:
    *   *Local Processing*: Where possible (like the Forensics modules), code runs entirely inside the user's browser (using WebAssembly/PyScript).
    *   *No Central Database* The tool does not store, log, or index the images you analyze. Once you close the tab, the data is gone. This is critical for handling sensitive or embargoed content.

![Screenshot: Upload Screen and Settings Panel]

---

## 2. Validity Tab
**Purpose**: Determines the authenticity of an image using AI detection and metadata analysis.

### Cards & Features:
*   **Automated Detection (AI Sniffer)**
    *   *What it does*: Deploys ensemble models (including SightEngine) trained on millions of AI-generated images (Midjourney, DALL-E, Stable Diffusion) to detect specific pixel artifacts.
    *   *Flags*:
        *   **"AI Generated" / "Human"**: The primary binary assessment. It looks for "tells" like unnatural lighting, glossiness, or asymmetric eyes/ears that generative models often struggle with.
        *   **Confidence Score**:
            *   *Definition*: A statistical probability (0-100%) indicating how closely the image's features match the "fake" dataset.
            *   *Interpretation*: A score of 98% is a screaming red flag. A score of 55% suggests ambiguity—perhaps the image is real but heavily filtered.
*   **Metadata & EXIF**
    *   *What it is*: **"Data about data."** Every digital photo contains a hidden header (known as EXIF) written by the camera at the exact moment of capture. It records the technical DNA of the image.
    *   *Why it matters*:
        *   **The "Social Media Strip"**: Platforms like X (Twitter), Facebook, and Instagram automatically wipe metadata to protect user privacy. If an image uploaded to OpenSourceSearch *still has* metadata, it is likely an **original file** shared directly (e.g., via email or messaging app) rather than a re-download from social media.
    *   *Flags & Analysis*:
        *   **GPS Data Found**: (Yes/No) - The "Gold Standard" of verification. If present, it pinpoints the exact latitude/longitude where the photographer stood.
        *   **Camera Model**: Verifies consistency. (e.g., If the image claims to be from a 2010 protest but the metadata says "iPhone 15 Pro", it's fake).
        *   **Software Tag**: A "smoking gun" field. If this tag reads *Adobe Photoshop* or *GIMP* instead of a camera firmware version, the image has definitely been post-processed.
*   **Fact Checks (Google Fact Check Explorer)**
    *   *What it is*: A specialized search engine that indexes "Claim Reviews" from trusted, non-partisan fact-checking organizations (like Snopes, Reuters, AFP) that are signatories of the **International Fact-Checking Network (IFCN)**.
    *   *How it works*: The tool queries this massive database using visual descriptors from the image. It looks for matches where a human fact-checker has already reviewed the context surrounding this specific image.
    *   *Flags*:
        *   **Claim Match**: (Yes/No) - **"Has this already been debunked?"**
            *   *Scenario*: You upload a photo of a shark swimming on a highway during a hurricane.
            *   *Result*: The tool instantly links to a Snopes article from 2017 titled *"No, typical flooding photos are not from the current storm"*, rating the claim as **FALSE**. This saves the analyst hours of work by surfacing existing knowledge immediately.

![Screenshot: Validity Tab showing AI Detection and Metadata]

---

## 3. Circulation Tab
**Purpose**: Tracks where the image has appeared on the internet to trace its origin and spread.

### Cards & Features:
*   **Found on Websites (Reverse Image Search)**
    *   *What it does*: Scans the open web to find every instance where this *exact* image file has been indexed by Google.
    *   *Key Insight (Provenance)*:
        *   **Recycling Attacks**: Disinformation often recycles old photos for new events. If an image claiming to show "Today's Earthquake" appears in search results from 2018, it is conclusively **debunked**.
*   **Visually Similar Images**
    *   *What it does*: Uses computer vision to find images with similar shapes, colors, and compositions, even if the pixels aren't identical.
    *   *Key Insight (Manipulation Detection)*:
        *   **Source Discovery**: If a user has photoshopped a soldier into a landscape, this tool can often find the *original* empty landscape or the *original* stock photo of the soldier used in the composite. Finding the "source ingredients" is definitive proof of manipulation.

![Screenshot: Circulation Tab with web matches]

---

## 4. Context Tab (Geospatial Analysis)
**Purpose**: The most powerful feature of the suite. It combines AI geolocation with layers of real-time data to verify if an image *could* have been taken where it claims.

### The Map Interface
A fully interactive, high-fidelity 3D environment powered by Mapbox. It provides satellite imagery, terrain elevation (important for verifying ridge lines and mountains seen in photos), and street-level labels.

### Dynamic Layers (The "Flags")
Verification often boils down to: *"Is the weather consistent? Are the landmarks correct?"* These layers provide the ground truth to answer those questions.

*   **Time & Weather**:
    *   **Active Wildfires**:
        *   *Source*: NASA FIRMS (VIIRS/MODIS satellite data).
        *   *Use Case*: Verifying photos of smoke plumes or fires. If the map shows no thermal anomalies in the claimed area, the photo may be from a different fire.
    *   **Environment Canada Weather Alerts**:
        *   *Source*: Official Government of Canada datastreams.
        *   *Use Case*: Does the alert level (e.g., "Severe Thunderstorm Warning") match the storm visible in the user's photo?
    *   **Hurricanes**:
        *   *Source*: NOAA / National Hurricane Center.
        *   *Use Case*: Shows the forecasted track and past path. Essential for debunking "shark in the street" hoaxes by verifying if the storm actually passed over that city.
*   **Infrastructure (Ground Truth)**:
    *   **Traffic Cameras**:
        *   *Source*: Live feeds from provincial (MTO) and municipal systems.
        *   *Use Case*: **The Ultimate Validator.** Clicking a camera icon establishes immediate ground truth for weather (is it raining?), lighting (graffiti, shadows), and season (is there snow?) at that exact timestamp.
    *   **Aerodromes & Highways**:
        *   *Use Case*: Verifying transport logistics. Does the runway configuration in the satellite view match the background of the image?
*   **Communities & Human Context**:
    *   **Census Data (2021)**:
        *   *Use Case*: Population density heatmaps. Helps assess if a "crowded market" photo is plausible in an area the census identifies as rural farmland.
    *   **Indigenous Lands**:
        *   *Use Case*: Critical cultural context. Identifies if an event is taking place on Treaty land, which aids in accurate reporting and respect for jurisdiction.

### Geolocation Card
*   **AI Location Estimate**:
    *   *Concept*: Leverages the multimodal capabilities of Google Gemini 2.0. The AI "looks" at the photo like a human expert, identifying flora (e.g., "Those are Douglas Firs, likely Pacific Northwest"), architecture ("That stop sign style is specific to France"), and text.
    *   *Output*: Returns a suggested coordinate and a reasoning paragraph explaining *why* it picked that spot.
*   **Confidence Score**: A self-assessment by the AI. Low confidence? The map view will be wide. High confidence? It zooms in to the street.

![Screenshot: Context Tab showing map with Wildfire and Camera layers active]

---

## 5. Forensics Tab
**Purpose**: Deep technical analysis of the image pixels to detect manipulation that is invisible to the naked eye.

### Tools:
*   **General Forensics (Error Level Analysis - ELA)**
    *   *What it does*: It resaves the image at a specific JPEG quality level and subtracts the result from the original.
    *   *The Science*: Digital images lose quality when saved (compression). If a user pastes a high-quality "UFO" into a low-quality "Sky" photo, the two elements will have **different compression rates**.
    *   *Flags*:
        *   **Inconsistent Noise**: The tool highlights these differences in bright colors. A manipulated area will often glow or stand out against the background noise, indicating it does not belong.
*   **Vanishing Points (Geometric Consistency)**
    *   *What it does*: Uses computer vision to detect the dominant lines in an image (roads, buildings, horizons) and calculates where they intersect.
    *   *The "Flags" (The Physics of Perspective)*:
        *   **Convergence**: In a real photograph, all parallel lines (like the edges of a building) must converge to a single point in the distance (the Vanishing Point).
        *   **Analysis**:
            *   **Green/Red/Blue Lines**: Represent the X, Y, and Z axes of the real world.
            *   **The Check**: If the lines drawn by the tool fail to meet at a consistent point—or if the lines of a specific object (like a floating sign) point to a *different* vanishing point than the background—it is strong evidence that the object was composited into the scene (bad Photoshop).

![Screenshot: Vanishing Points tool with geometric lines overlay]
