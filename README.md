# Parcelizator

Aplikacja webowa do pobierania i wizualizacji geometrii działek ewidencyjnych z wykorzystaniem API ULDK (GUGiK).

🌐 **[Otwórz aplikację](https://infrat.github.io/parcelizator-v2/)**

## Funkcjonalności

- **Wyszukiwanie działek** - po numerze EGiB, współrzędnych lub adresie
- **Mapa interaktywna** - Leaflet z podkładem OpenStreetMap
- **Warstwa katastralna** - WMS GUGiK widoczna przy dużym zoomie (17+)
- **Lista działek** - dodawanie wielu działek do analizy
- **Eksport danych**:
  - KML (Google Earth)
  - GeoPackage (QGIS, ArcGIS)
  - GeoJSON (uniwersalny format GIS)
- **Widoki** - obrysy działek i/lub punkty graniczne

## Technologie

- **Frontend only** - działa jako statyczna strona (GitHub Pages)
- HTML5, CSS3, JavaScript ES6+
- [Leaflet.js](https://leafletjs.com/) - mapy interaktywne
- [Proj4js](http://proj4js.org/) - transformacje układów współrzędnych
- [sql.js](https://sql.js.org/) - generowanie GeoPackage w przeglądarce

## API

Aplikacja korzysta z publicznych API:

- **ULDK API** (GUGiK) - geometrie działek ewidencyjnych
- **WMS KIEG** (GUGiK) - warstwa katastralna
- **Nominatim** (OpenStreetMap) - geokodowanie adresów

## Uruchomienie lokalne

```bash
# Sklonuj repozytorium
git clone https://github.com/TWOJA_NAZWA_UZYTKOWNIKA/parcelizator-v2.git
cd parcelizator-v2

# Uruchom lokalny serwer (Python 3)
cd public
python3 -m http.server 8080

# Otwórz w przeglądarce
open http://localhost:8080
```

## Format numeru działki (EGiB)

```
WWPPGG_T.OOOO.NNNN[/X]

Gdzie:
- WWPPGG - kod TERYT (województwo, powiat, gmina)
- T - typ gminy (1=miejska, 2=wiejska, 3=miejsko-wiejska)
- OOOO - numer obrębu
- NNNN - numer działki (może zawierać /X dla podziałów)

Przykład: 141201_1.0001.6509
```

## Licencja

MIT License
