import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IoStorefrontOutline } from "react-icons/io5";
import storeLogo from "./assets/loja.png";

const CENTER = [-9.4167, -40.5031];
const icon = L.divIcon({
  className: "acai-store-marker-wrap",
  html: `<div class="acai-store-marker"><img src="${storeLogo}" alt="Açaí do Vale" /></div>`,
  iconSize: [50, 50],
  iconAnchor: [25, 46],
});

export default function DeliveryMapEditor({ settings }) {
  const ref = useRef(null),
    mapRef = useRef(null),
    layersRef = useRef(L.layerGroup());
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { center: CENTER, zoom: 12 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layersRef.current.addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    layers.clearLayers();
    const lat = Number(settings?.store?.latitude),
      lng = Number(settings?.store?.longitude);
    const bands = [...(settings?.deliveryBands || [])]
      .map((b) => ({ ...b, maxKm: Number(b.maxKm), fee: Number(b.fee || 0) }))
      .filter((b) => b.maxKm > 0)
      .sort((a, b) => a.maxKm - b.maxKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      map.setView(CENTER, 12);
      return;
    }
    map.setView([lat, lng], 12);
    L.marker([lat, lng], { icon })
      .bindPopup(
        `<strong>${settings.store.name || "Açaí do Vale"}</strong><br>${settings.store.street || ""}, ${settings.store.number || ""}`,
      )
      .addTo(layers);
    bands.forEach((b) =>
      L.circle([lat, lng], {
        radius: b.maxKm * 1000,
        color: b.fee === 0 ? "#20b52b" : "#7b1680",
        fillOpacity: 0.04,
        weight: 2,
      })
        .bindTooltip(
          `Até ${b.maxKm} km • ${b.fee === 0 ? "Taxa grátis!" : `R$ ${b.fee.toFixed(2).replace(".", ",")}`}`,
        )
        .addTo(layers),
    );
  }, [settings]);
  return (
    <div className="delivery-map-wrap">
      <div className="map-side-card">
        <div className="map-side-title">
          <IoStorefrontOutline />
          <div>
            <strong>Áreas de entrega</strong>
            <small>Calculadas pela rota real entre loja e cliente.</small>
          </div>
        </div>
        <div className="delivery-map-legend">
          {(settings.deliveryBands || []).map((b, i) => (
            <div className="delivery-map-legend-row" key={b.id || i}>
              <span
                className={`legend-dot ${Number(b.fee) === 0 ? "free" : ""}`}
              />
              <div>
                <strong>
                  Até {b.maxKm} km —{" "}
                  {Number(b.fee) === 0
                    ? "Taxa grátis!"
                    : `R$ ${Number(b.fee).toFixed(2).replace(".", ",")}`}
                </strong>
                <small>{b.minutes} min</small>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        ref={ref}
        className="delivery-map"
        aria-label="Mapa das áreas de entrega"
      />
    </div>
  );
}
