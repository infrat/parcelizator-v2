# Copilot Instructions - Parcelizator

## Project Overview

Parcelizator is a frontend-only web application for fetching and visualizing Polish cadastral parcel geometries using the ULDK API (Usługa Lokalizacji Działek Katastralnych) provided by GUGiK.

**Key constraint**: No backend server - the app must work as static files hosted on GitHub Pages.

## Tech Stack

- **HTML5** - semantic markup
- **CSS3** - modern styling with CSS Grid, Flexbox, CSS Variables
- **JavaScript ES6+** - modules, async/await, classes
- **Leaflet.js 1.9.4** - interactive maps
- **Proj4js 2.9.0** - coordinate system transformations (EPSG:2180 ↔ WGS84)

## Architecture Principles

### SOLID Principles

1. **Single Responsibility Principle (SRP)**: Each module/class has one reason to change

   - `SearchService` - input detection and geocoding only
   - `UldkService` - ULDK API communication only
   - `MapService` - Leaflet map management only
   - `WktParser` - WKT parsing and coordinate transformation only
   - `KmlExporter` - KML file generation only

2. **Open/Closed Principle (OCP)**: Extend functionality without modifying existing code

   - Use configuration objects for API endpoints
   - Strategy pattern for different search types

3. **Liskov Substitution Principle (LSP)**: Not heavily applicable (no inheritance hierarchy)

4. **Interface Segregation Principle (ISP)**: Keep interfaces small and focused

   - Services expose only necessary public methods

5. **Dependency Inversion Principle (DIP)**: High-level modules don't depend on low-level details
   - `App.js` orchestrates services through abstractions
   - Services receive dependencies via constructor injection

### Clean Code Guidelines

- **Meaningful names**: `getParcelByCoordinates()` not `getData()`
- **Small functions**: Max 20-30 lines, single purpose
- **No magic numbers**: Use named constants (`const DEBOUNCE_DELAY_MS = 300`)
- **Error handling**: Always handle API errors gracefully with user-friendly messages
- **Comments**: Explain "why", not "what" - code should be self-documenting
- **DRY**: Extract repeated logic into utility functions

## Project Structure

```
public/
├── index.html              # Main HTML with styles
├── js/
│   ├── app.js              # Application entry point, orchestration
│   ├── config.js           # API endpoints, constants
│   ├── services/
│   │   ├── SearchService.js    # Search type detection, geocoding
│   │   ├── UldkService.js      # ULDK API client
│   │   └── MapService.js       # Leaflet map management
│   └── utils/
│       ├── WktParser.js        # WKT to coordinates conversion
│       ├── KmlExporter.js      # KML file generation
│       └── CoordinateTransformer.js  # Proj4 wrapper
```

## External APIs

### ULDK API (GUGiK)

- **Base URL**: `https://uldk.gugik.gov.pl/`
- **CORS**: Enabled
- **No authentication required**

Key endpoints:

```
GET /?request=GetParcelById&id={parcelId}&result=geom_wkt,id
GET /?request=GetParcelByXY&xy={lon},{lat}&srid=4326&result=geom_wkt,id
```

Response format: `status|data` where status `0` = success, `1` = error

### Nominatim (OpenStreetMap Geocoding)

- **Base URL**: `https://nominatim.openstreetmap.org/search`
- **CORS**: Enabled
- **Rate limit**: 1 request/second, use debounce
- **Required**: Set custom User-Agent header or use email parameter

```
GET /search?q={address}&format=json&countrycodes=pl&limit=5
```

## Coordinate Systems

- **EPSG:4326 (WGS84)**: GPS coordinates, used by Leaflet and Nominatim
- **EPSG:2180 (PUWG 1992)**: Polish national system, returned by ULDK

Always transform ULDK coordinates to WGS84 before displaying on map.

## Polish Parcel ID Format (Identyfikator EGiB)

Format: `WWPPGG_T.OOOO.NNNN[/X]`

- `WWPPGG` - TERYT code (voivodeship, county, commune)
- `_T` - commune type (1=urban, 2=rural, 3=urban part)
- `OOOO` - precinct number (obręb)
- `NNNN` - parcel number (may include `/` for subdivisions)

Example: `141201_1.0001.6509`

Regex pattern: `/^\d{6}_\d\.\d{4}\.\d+([\/]\d+)?$/`

## UI/UX Guidelines

- Show loading states during API calls
- Display user-friendly error messages in Polish
- Highlight detected search type with badges
- Enable/disable buttons based on data availability
- Use consistent color scheme (purple gradient: #667eea → #764ba2)

## Code Style

- Use `const` by default, `let` when reassignment needed
- Arrow functions for callbacks
- Template literals for string interpolation
- Async/await over .then() chains
- Destructuring for object/array access
- Optional chaining (`?.`) and nullish coalescing (`??`) where appropriate

## Testing Considerations

- Test with various parcel ID formats
- Test with coordinates in different parts of Poland
- Test address search with Polish diacritics
- Test error scenarios (invalid IDs, network errors)
- Verify KML export opens correctly in Google Earth
