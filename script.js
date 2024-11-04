const storage = new DbStorage();

// Initialisation de la carte centrée sur la France
const map = L.map('map').setView([48.86, 2.33], 9);
        
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Style pour les LGV
const lgvStyle = {
    color: "#00ff00", 
    weight: 3,
    opacity: 0.7
};

// Style pour les tunnels
const tunnelStyle = {
    color: "#ff0000",
    weight: 3,
    opacity: 0.7
};

// Fonction pour calculer la longueur d'une ligne en kilomètres
function calculateLength(coordinates) {
    let length = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        const p1 = L.latLng(coordinates[i][1], coordinates[i][0]);
        const p2 = L.latLng(coordinates[i + 1][1], coordinates[i + 1][0]);
        length += p1.distanceTo(p2);
    }
    return (length / 1000).toFixed(2); // Conversion en km avec 2 décimales
}

// Fonction pour filtrer les éléments selon les limites de la carte
function filterVisibleElements(elements) {
    const bounds = map.getBounds();
    return elements.filter(element => {
        return element.geometry.some(node => 
            bounds.contains(L.latLng(node.lat, node.lon))
        );
    });
}

let lgvLayer = null;
let tunnelLayer = null;
let lgvData = null;
let tunnelsData = null;

// Fonction pour mettre à jour les données en arrière-plan
async function updateDataInBackground() {
    const backgroundUpdate = document.querySelector('.background-update');
    const backgroundUpdateMessage = document.querySelector('.background-update-message');
    const backgroundUpdateStatus = document.querySelector('.background-update-status');
    
    backgroundUpdate.classList.remove('hidden');
    try {
        backgroundUpdateMessage.textContent = "Mise à jour des données en arrière-plan";
        backgroundUpdateStatus.textContent = "En cours...";
        
        // Mise à jour des LGV
        const lgvResponse = await fetch('https://overpass-api.de/api/interpreter?data=[out:json];way["railway"="rail"]["usage"="main"]["service"!="yard"]["service"!="siding"]["service"!="crossover"]["tunnel"!="yes"](area:3602202162);out geom;');
        const newLgvData = await lgvResponse.json();
        await storage.saveToIndexedDB('lgv', newLgvData);
        lgvData = newLgvData;
        updateLGVLayer();

        // Mise à jour des tunnels
        const tunnelsResponse = await fetch('https://overpass-api.de/api/interpreter?data=[out:json];way["railway"="rail"]["tunnel"="yes"]["usage"="main"]["service"!="yard"]["service"!="siding"]["service"!="crossover"](area:3602202162);out geom;');
        const newTunnelsData = await tunnelsResponse.json();
        await storage.saveToIndexedDB('tunnels', newTunnelsData);
        tunnelsData = newTunnelsData;
        updateTunnelLayer();

        backgroundUpdateMessage.textContent = "Données mises à jour avec succès";
        backgroundUpdateStatus.textContent = "";
        setTimeout(() => {
            backgroundUpdateMessage.textContent = "";
            backgroundUpdate.classList.add('hidden');
        }, 3000);
    } catch (error) {
        console.warn('Erreur lors de la mise à jour en arrière-plan:', error);
        backgroundUpdateMessage.textContent = "Erreur lors de la mise à jour";
        backgroundUpdateStatus.textContent = error.message;
        setTimeout(() => {
            backgroundUpdateMessage.textContent = "";
            backgroundUpdateStatus.textContent = "";
        }, 3000);
    }
}

// Fonction pour charger les données GeoJSON
async function loadRailwayData() {
    const loader = document.querySelector('.loader');
    const status = document.querySelector('.status');
    const loadingMessage = document.querySelector('.loading-message');

    loader.classList.remove('hidden');

    try {
        await storage.init();

        // Charger les données depuis IndexedDB en premier
        const cachedLGV = await storage.getFromIndexedDB('lgv');
        if (cachedLGV) {
            lgvData = cachedLGV.data;
            loadingMessage.textContent = "Chargement des LGV depuis le cache";
        }

        const cachedTunnels = await storage.getFromIndexedDB('tunnels');
        if (cachedTunnels) {
            tunnelsData = cachedTunnels.data;
            loadingMessage.textContent = "Chargement des tunnels depuis le cache";
        }

        if (lgvData && tunnelsData) {
            loader.classList.add('hidden');
        }

        // Si pas de données en cache, charger depuis l'API
        if (!lgvData || !tunnelsData) {
            loadingMessage.textContent = "Chargement des données depuis l'API";
            status.textContent = "Première initialisation...";
            await updateDataInBackground();
        }

        function updateLGVLayer() {
            if (lgvLayer) {
                map.removeLayer(lgvLayer);
            }

            const visibleElements = filterVisibleElements(lgvData.elements);
            
            const features = visibleElements.map(element => {
                return {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: element.geometry.map(node => [node.lon, node.lat])
                    },
                    properties: {
                        name: element.tags?.name || 'Ligne non nommée',
                        ref: element.tags?.ref || ''
                    }
                };
            });

            lgvLayer = L.geoJSON({
                type: "FeatureCollection", 
                features: features
            }, {
                style: lgvStyle,
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name;
                    const ref = feature.properties.ref;
                    const displayName = ref ? `${name} (${ref})` : name;
                    layer.bindPopup(displayName);
                }
            }).addTo(map);
        }

        function updateTunnelLayer() {
            if (tunnelLayer) {
                map.removeLayer(tunnelLayer);
            }

            const visibleElements = filterVisibleElements(tunnelsData.elements);

            const tunnelFeatures = visibleElements.map(element => {
                return {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: element.geometry.map(node => [node.lon, node.lat])
                    },
                    properties: {
                        name: element.tags?.name || 'Tunnel non nommé',
                        ref: element.tags?.ref || ''
                    }
                };
            });

            tunnelLayer = L.geoJSON({
                type: "FeatureCollection", 
                features: tunnelFeatures
            }, {
                style: tunnelStyle,
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name;
                    const ref = feature.properties.ref;
                    const length = calculateLength(feature.geometry.coordinates);
                    const displayName = ref ? 
                        `${name} (${ref})\nLongueur: ${length} km` : 
                        `${name}\nLongueur: ${length} km`;
                    layer.bindPopup(displayName);
                }
            }).addTo(map);
        }

        // Mise à jour initiale des couches
        if (lgvData) updateLGVLayer();
        if (tunnelsData) updateTunnelLayer();

        // Mise à jour des couches lors du déplacement/zoom de la carte
        map.on('moveend', () => {
            if (lgvData) updateLGVLayer();
            if (tunnelsData) updateTunnelLayer();
        });

        loader.classList.remove('active');
    } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
        loadingMessage.textContent = "Erreur lors du chargement";
        status.textContent = error.message;
        setTimeout(() => loader.classList.add('hidden'), 2000);
    }
}

// Chargement des données au démarrage
loadRailwayData();
