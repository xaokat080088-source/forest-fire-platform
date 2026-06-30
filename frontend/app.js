const API_BASE_URL = "http://localhost:8000";
const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_RETRY_DELAY_MS = 300;
const MAP_FALLBACK_CENTER = [30.43, 117.25];
const MAP_FALLBACK_ZOOM = 7;
const MAP_FOCUS_MAX_ZOOM = 13;
const MAP_SINGLE_DRONE_ZOOM = 13;
const MAP_FOCUS_PADDING = [90, 90];
const TRACK_LIMIT = 100;
const TRACK_MIN_DELTA = 0.00001;
const REAL_TRACK_RENDER_LIMIT = 36;
const REAL_TRACK_RENDER_MIN_DELTA = 0.00006;
const TRACK_PANE = "trackPane";
const DRONE_PANE = "dronePane";
const FIRE_PANE = "firePane";
const TRACK_COLORS = ["#ffad4d", "#52e0d0", "#4ea2ff", "#f5dd5d", "#b67cff", "#4ee38b", "#ff7a90", "#7dd3fc"];

const state = {
  useRealApi: false,
  activeView: "dronesView",
  drones: [],
  tracks: new Map(),
  alerts: [],
  pendingAlerts: [],
  selectedAlertId: null,
  map: null,
  mapMode: "standard",
  mapLayoutTimer: null,
  mapInitialFocusPending: true,
  mapFocusRequestedAfterVersion: -1,
  mapFocusDataVersion: 0,
  baseLayers: {
    standard: null,
    satellite: null,
    satelliteLabels: null,
    schematic: null,
  },
  mapLayers: {
    drones: L.layerGroup(),
    tracks: L.layerGroup(),
    fires: L.layerGroup(),
  },
  pollTimer: null,
};

const els = {
  tabs: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view-panel"),
  dataModeToggle: document.getElementById("dataModeToggle"),
  connectionState: document.getElementById("connectionState"),
  mapModeButtons: document.querySelectorAll("[data-map-mode]"),
  droneColorLegend: document.getElementById("droneColorLegend"),
  onlineCount: document.getElementById("onlineCount"),
  pendingCount: document.getElementById("pendingCount"),
  riskLevel: document.getElementById("riskLevel"),
  droneTableBody: document.getElementById("droneTableBody"),
  lastUpdatedDrones: document.getElementById("lastUpdatedDrones"),
  alertStatusFilter: document.getElementById("alertStatusFilter"),
  alertList: document.getElementById("alertList"),
  alertDetail: document.getElementById("alertDetail"),
  alertDetailEmpty: document.getElementById("alertDetailEmpty"),
  detailLevel: document.getElementById("detailLevel"),
  detailStatus: document.getElementById("detailStatus"),
  detailTitle: document.getElementById("detailTitle"),
  detailId: document.getElementById("detailId"),
  detailDrone: document.getElementById("detailDrone"),
  detailLocation: document.getElementById("detailLocation"),
  detailTime: document.getElementById("detailTime"),
  detailReason: document.getElementById("detailReason"),
  detailImage: document.getElementById("detailImage"),
  confirmAlertBtn: document.getElementById("confirmAlertBtn"),
  ignoreAlertBtn: document.getElementById("ignoreAlertBtn"),
};

const statusText = {
  online: "在线",
  cruising: "巡航中",
  returning: "返航中",
  offline: "离线",
  pending: "未处理",
  confirmed: "已确认",
  ignored: "已忽略",
};

const levelText = {
  high: "高",
  medium: "中",
  low: "低",
};

const api = {
  async getDrones() {
    return requestJson("/api/drones");
  },
  async getTrack(droneId, limit = 100) {
    return requestJson(`/api/drones/${encodeURIComponent(droneId)}/track?limit=${limit}`);
  },
  async getAlerts(status = "all") {
    return requestJson(`/api/alerts?status=${encodeURIComponent(status)}`);
  },
  async getAlert(alertId) {
    return requestJson(`/api/alerts/${encodeURIComponent(alertId)}`);
  },
  async confirmAlert(alertId) {
    return requestJson(`/api/alerts/${encodeURIComponent(alertId)}/confirm`, { method: "POST" });
  },
  async ignoreAlert(alertId) {
    return requestJson(`/api/alerts/${encodeURIComponent(alertId)}/ignore`, { method: "POST" });
  },
};

function currentApi() {
  return state.useRealApi ? api : window.MockApi;
}

async function requestJson(path, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestJsonOnce(path, options);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await delay(REQUEST_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

async function requestJsonOnce(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function init() {
  bindEvents();
  refreshAll();
  state.pollTimer = window.setInterval(refreshAll, POLL_INTERVAL_MS);
}

function bindEvents() {
  els.tabs.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.dataModeToggle.addEventListener("change", () => {
    state.useRealApi = els.dataModeToggle.checked;
    state.selectedAlertId = null;
    requestMapInitialFocus();
    refreshAll();
  });

  els.alertStatusFilter.addEventListener("change", () => {
    state.selectedAlertId = null;
    refreshAlerts();
  });

  els.confirmAlertBtn.addEventListener("click", () => handleAlertAction("confirm"));
  els.ignoreAlertBtn.addEventListener("click", () => handleAlertAction("ignore"));
  els.mapModeButtons.forEach((button) => {
    button.addEventListener("click", () => setMapMode(button.dataset.mapMode));
  });
  window.addEventListener("resize", () => repairMapLayout());
}

function switchView(viewId) {
  state.activeView = viewId;
  els.tabs.forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (viewId === "mapView") {
    window.setTimeout(() => {
      ensureMap();
      state.map.invalidateSize({ pan: false });
      renderMap();
      repairMapLayout({ delay: 200 });
    }, 50);
  }
}

function ensureMap() {
  if (!state.map) {
    initMap();
  }
}

function repairMapLayout(options = {}) {
  if (!state.map || state.activeView !== "mapView") {
    return;
  }

  const { delay = 0 } = options;
  window.clearTimeout(state.mapLayoutTimer);
  state.mapLayoutTimer = window.setTimeout(() => {
    state.map.invalidateSize({ animate: true, pan: false });
  }, delay);
}

function requestMapInitialFocus() {
  state.mapInitialFocusPending = true;
  state.mapFocusRequestedAfterVersion = state.mapFocusDataVersion;
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView(MAP_FALLBACK_CENTER, MAP_FALLBACK_ZOOM);

  state.baseLayers.standard = L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
    subdomains: ["1", "2", "3", "4"],
    maxZoom: 18,
    attribution: "高德",
  });

  state.baseLayers.satellite = L.tileLayer("https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}", {
    subdomains: ["1", "2", "3", "4"],
    maxZoom: 18,
    attribution: "高德",
  });

  state.baseLayers.satelliteLabels = L.tileLayer("https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}", {
    subdomains: ["1", "2", "3", "4"],
    maxZoom: 18,
    attribution: "高德",
  });

  state.baseLayers.schematic = createSchematicLayer();
  applyMapMode();
  initMapPanes();

  state.mapLayers.tracks.addTo(state.map);
  state.mapLayers.drones.addTo(state.map);
  state.mapLayers.fires.addTo(state.map);
}

function initMapPanes() {
  const trackPane = state.map.createPane(TRACK_PANE);
  trackPane.classList.add("leaflet-track-pane");
  trackPane.style.zIndex = "450";
  trackPane.style.pointerEvents = "none";

  const dronePane = state.map.createPane(DRONE_PANE);
  dronePane.classList.add("leaflet-drone-pane");
  dronePane.style.zIndex = "620";

  const firePane = state.map.createPane(FIRE_PANE);
  firePane.classList.add("leaflet-fire-pane");
  firePane.style.zIndex = "640";
}

function setMapMode(mode) {
  if (!["standard", "satellite", "schematic"].includes(mode) || state.mapMode === mode) {
    return;
  }

  state.mapMode = mode;
  updateMapModeButtons();
  if (state.map) {
    applyMapMode();
    renderMap();
    repairMapLayout({ delay: 120 });
  }
}

function updateMapModeButtons() {
  els.mapModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mapMode === state.mapMode);
  });
}

function applyMapMode() {
  if (!state.map) {
    updateMapModeButtons();
    return;
  }

  const { standard, satellite, satelliteLabels, schematic } = state.baseLayers;
  removeBaseMapLayers();

  if (state.mapMode === "schematic") {
    schematic.addTo(state.map);
  } else if (state.mapMode === "satellite") {
    satellite.addTo(state.map);
    satelliteLabels.addTo(state.map);
  } else {
    standard.addTo(state.map);
  }

  updateMapModeButtons();
}

function removeBaseMapLayers() {
  const { standard, satellite, satelliteLabels, schematic } = state.baseLayers;
  [standard, satellite, satelliteLabels, schematic].forEach((layer) => {
    if (layer && state.map.hasLayer(layer)) {
      state.map.removeLayer(layer);
    }
  });
  removeSchematicLayerDom();
}

function removeSchematicLayerDom() {
  if (!state.map) {
    return;
  }

  state.map.getContainer().querySelectorAll(".schematic-layer").forEach((layer) => layer.remove());
}

function createSchematicLayer() {
  const SchematicLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._el = L.DomUtil.create("div", "schematic-layer");
      this._el.setAttribute("aria-hidden", "true");
      map.getPanes().tilePane.appendChild(this._el);
      map.on("move zoom resize viewreset", this._render, this);
      this._render();
    },
    onRemove(map) {
      map.off("move zoom resize viewreset", this._render, this);
      if (this._el) {
        L.DomUtil.remove(this._el);
      }
      this._el = null;
      this._map = null;
      removeSchematicLayerDom();
    },
    _render() {
      if (!this._map || !this._el) {
        return;
      }

      const size = this._map.getSize();
      const bounds = this._map.getBounds();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      const steps = 6;
      const verticalLines = [];
      const horizontalLines = [];
      const labels = [];

      for (let index = 1; index < steps; index += 1) {
        const lng = bounds.getWest() + ((bounds.getEast() - bounds.getWest()) * index) / steps;
        const x = this._map.latLngToContainerPoint([bounds.getSouth(), lng]).x;
        verticalLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${size.y}" />`);
        labels.push(`<text class="schematic-label lng-label" x="${x + 8}" y="22">${formatCoord(lng)}E</text>`);

        const lat = bounds.getSouth() + ((bounds.getNorth() - bounds.getSouth()) * index) / steps;
        const y = this._map.latLngToContainerPoint([lat, bounds.getWest()]).y;
        horizontalLines.push(`<line x1="0" y1="${y}" x2="${size.x}" y2="${y}" />`);
        labels.push(`<text class="schematic-label lat-label" x="12" y="${y - 8}">${formatCoord(lat)}N</text>`);
      }

      this._el.style.width = `${size.x}px`;
      this._el.style.height = `${size.y}px`;
      L.DomUtil.setPosition(this._el, topLeft);
      this._el.innerHTML = `
        <div class="schematic-backdrop"></div>
        <svg class="schematic-svg" viewBox="0 0 ${size.x} ${size.y}" preserveAspectRatio="none">
          <defs>
            <radialGradient id="schematicGlow" cx="50%" cy="46%" r="65%">
              <stop offset="0%" stop-color="rgba(82,224,208,0.2)" />
              <stop offset="58%" stop-color="rgba(82,224,208,0.05)" />
              <stop offset="100%" stop-color="rgba(82,224,208,0)" />
            </radialGradient>
          </defs>
          <rect width="${size.x}" height="${size.y}" fill="url(#schematicGlow)" />
          <g class="schematic-grid major">${verticalLines.join("")}${horizontalLines.join("")}</g>
          <line class="schematic-axis" x1="${size.x / 2}" y1="0" x2="${size.x / 2}" y2="${size.y}" />
          <line class="schematic-axis" x1="0" y1="${size.y / 2}" x2="${size.x}" y2="${size.y / 2}" />
          <circle class="schematic-center" cx="${size.x / 2}" cy="${size.y / 2}" r="72" />
          <circle class="schematic-center fine" cx="${size.x / 2}" cy="${size.y / 2}" r="18" />
          <g>${labels.join("")}</g>
        </svg>
      `;
    },
  });

  return new SchematicLayer();
}

async function refreshAll() {
  const results = await Promise.allSettled([refreshDronesAndTracks(), refreshAlerts()]);
  const failed = results.find((result) => result.status === "rejected");

  updateHeaderStats();
  renderMap();
  setConnectionText(failed ? failed.reason : null);
}

async function refreshDronesAndTracks() {
  const dronesResponse = await currentApi().getDrones();
  state.drones = dronesResponse.drones || [];
  state.mapFocusDataVersion += 1;

  const trackResults = await Promise.allSettled(
    state.drones.map(async (drone) => {
      const trackResponse = await currentApi().getTrack(drone.drone_id, 100);
      return [drone.drone_id, trackResponse.track || []];
    }),
  );
  const nextTracks = new Map();
  trackResults.forEach((result, index) => {
    const drone = state.drones[index];
    const droneId = drone?.drone_id;
    if (!droneId) {
      return;
    }
    const previousTrack = state.tracks.get(droneId) || [];
    if (result.status === "fulfilled") {
      const apiTrack = Array.isArray(result.value[1]) ? result.value[1] : [];
      nextTracks.set(result.value[0], buildDisplayTrack(apiTrack, drone));
      return;
    }
    nextTracks.set(droneId, buildDisplayTrack([], drone, previousTrack));
  });
  state.tracks = nextTracks;

  renderDrones();
}

async function refreshAlerts() {
  const status = els.alertStatusFilter.value;
  const [alertsResponse, pendingResponse] = await Promise.all([
    currentApi().getAlerts(status),
    currentApi().getAlerts("pending"),
  ]);
  state.alerts = (alertsResponse.alerts || []).sort((a, b) => toTimeMs(b.created_at) - toTimeMs(a.created_at));
  state.pendingAlerts = (pendingResponse.alerts || []).sort((a, b) => toTimeMs(b.created_at) - toTimeMs(a.created_at));

  if (state.selectedAlertId && !state.alerts.some((alert) => alert.alert_id === state.selectedAlertId)) {
    state.selectedAlertId = null;
  }
  if (!state.selectedAlertId && state.alerts.length > 0) {
    state.selectedAlertId = state.alerts[0].alert_id;
  }

  renderAlerts();
  renderAlertDetail();
}

function renderDrones() {
  if (state.drones.length === 0) {
    els.droneTableBody.innerHTML = `<tr><td colspan="6" class="muted">暂无无人机数据</td></tr>`;
    return;
  }

  els.droneTableBody.innerHTML = state.drones
    .map((drone) => {
      const battery = Number(drone.battery || 0);
      const batteryClass = battery <= 25 ? "battery low" : "battery";
      return `
        <tr>
          <td>
            <span class="drone-name">
              <strong>${escapeHtml(drone.name || drone.drone_id)}</strong>
              <small>${escapeHtml(drone.drone_id)}</small>
            </span>
          </td>
          <td>${renderStatus(drone.status)}</td>
          <td>
            <span class="${batteryClass}">
              <span class="battery-bar"><span class="battery-fill" style="width:${clamp(battery, 0, 100)}%"></span></span>
              <strong>${Math.round(battery)}%</strong>
            </span>
          </td>
          <td>${formatCoord(drone.lat)}, ${formatCoord(drone.lng)}</td>
          <td>${escapeHtml(drone.area || "--")}</td>
          <td>${formatTime(drone.last_heartbeat)}</td>
        </tr>
      `;
    })
    .join("");
  els.lastUpdatedDrones.textContent = `刷新于 ${formatTime(Date.now())}`;
}

function renderAlerts() {
  if (state.alerts.length === 0) {
    els.alertList.innerHTML = `<div class="empty-state">当前筛选下暂无告警</div>`;
    return;
  }

  els.alertList.innerHTML = state.alerts
    .map(
      (alert) => `
        <button class="alert-row ${alert.alert_id === state.selectedAlertId ? "active" : ""}" type="button" data-alert-id="${escapeAttribute(alert.alert_id)}">
          <span class="alert-row-top">
            <span>
              <span class="alert-row-title">${escapeHtml(alert.drone_id)} 疑似火情</span>
              <span class="alert-row-meta">${formatTime(alert.created_at)} · ${formatCoord(alert.lat)}, ${formatCoord(alert.lng)}</span>
            </span>
            ${renderLevel(alert.level)}
          </span>
          <span class="alert-row-meta">${escapeHtml(alert.reason || "--")}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".alert-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedAlertId = row.dataset.alertId;
      renderAlerts();
      renderAlertDetail();
    });
  });
}

function renderAlertDetail() {
  const alert = state.alerts.find((item) => item.alert_id === state.selectedAlertId);
  if (!alert) {
    els.alertDetail.classList.add("hidden");
    els.alertDetailEmpty.classList.remove("hidden");
    return;
  }

  els.alertDetail.classList.remove("hidden");
  els.alertDetailEmpty.classList.add("hidden");
  els.detailLevel.className = `level-badge level-${alert.level}`;
  els.detailLevel.textContent = `${levelText[alert.level] || alert.level}等级`;
  els.detailStatus.className = `status-pill status-${alert.status}`;
  els.detailStatus.textContent = statusText[alert.status] || alert.status;
  els.detailTitle.textContent = `${alert.drone_id} 火情告警`;
  els.detailId.textContent = alert.alert_id;
  els.detailDrone.textContent = alert.drone_id;
  els.detailLocation.textContent = `${formatCoord(alert.lat)}, ${formatCoord(alert.lng)}`;
  els.detailTime.textContent = formatTime(alert.created_at);
  els.detailReason.textContent = alert.reason || "--";
  renderAlertImage(alert.image_url);

  const canOperate = alert.status === "pending";
  els.confirmAlertBtn.disabled = !canOperate;
  els.ignoreAlertBtn.disabled = !canOperate;
}

function renderAlertImage(imageUrl) {
  if (!imageUrl) {
    els.detailImage.textContent = "无";
    return;
  }

  const safeUrl = escapeAttribute(imageUrl);
  els.detailImage.innerHTML = `<a class="snapshot-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">查看现场图像/识别快照</a>`;
}

function renderMap() {
  if (!state.map) {
    return;
  }

  state.mapLayers.drones.clearLayers();
  state.mapLayers.tracks.clearLayers();
  state.mapLayers.fires.clearLayers();

  const renderedFirePoints = new Set();
  const addFireMarker = (lat, lng, popupHtml) => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (renderedFirePoints.has(key)) {
      return;
    }
    renderedFirePoints.add(key);
    L.marker([latitude, longitude], { icon: fireIcon(), pane: FIRE_PANE }).bindPopup(popupHtml).addTo(state.mapLayers.fires);
  };

  state.tracks.forEach((track, droneId) => {
    const points = toTrackLatLngs(track);
    const displayPoints = normalizeTrackForDisplay(points);
    if (displayPoints.length > 1) {
      renderTrackLine(displayPoints, droneId);
    }

    track
      .filter((point) => Number(point.temperature) >= 50 || Number(point.smoke) >= 50 || Number(point.fire_confidence) >= 0.4)
      .slice(-5)
      .forEach((point) => {
        addFireMarker(point.lat, point.lng, `
          <strong>疑似火点</strong><br>
          温度 ${formatNumber(point.temperature)} °C<br>
          烟雾 ${formatNumber(point.smoke)}<br>
          置信度 ${formatNumber(point.fire_confidence)}
        `);
      });
  });

  mergeAlertsForMap().forEach((alert) => {
    addFireMarker(alert.lat, alert.lng, `
      <strong>疑似火点</strong><br>
      告警 ${escapeHtml(alert.alert_id)}<br>
      等级 ${levelText[alert.level] || escapeHtml(alert.level || "--")}<br>
      状态 ${statusText[alert.status] || escapeHtml(alert.status || "--")}<br>
      原因 ${escapeHtml(alert.reason || "--")}
    `);
  });

  state.drones.filter(hasValidPosition).forEach((drone) => {
    const point = [Number(drone.lat), Number(drone.lng)];
    L.marker(point, { icon: droneIcon(drone.status, drone.drone_id), pane: DRONE_PANE })
      .bindPopup(`
        <strong>${escapeHtml(drone.name || drone.drone_id)}</strong><br>
        状态 ${statusText[drone.status] || drone.status}<br>
        电量 ${Math.round(Number(drone.battery || 0))}%<br>
        区域 ${escapeHtml(drone.area || "--")}
      `)
      .addTo(state.mapLayers.drones);
  });

  renderDroneColorLegend();
  applyInitialMapFocus();
}

function buildDisplayTrack(apiTrack, drone, previousTrack = []) {
  const track = mergeTrackPoints(previousTrack, apiTrack);
  const currentPoint = droneToTrackPoint(drone);
  if (currentPoint) {
    appendDistinctTrackPoint(track, currentPoint);
  }
  return track.slice(-TRACK_LIMIT);
}

function mergeTrackPoints(previousTrack, apiTrack) {
  return [...previousTrack, ...apiTrack]
    .filter(hasValidPosition)
    .map((point, index) => ({
      ...point,
      lat: Number(point.lat),
      lng: Number(point.lng),
      _order: index,
      _time: toTimeMs(point.timestamp),
    }))
    .sort((a, b) => (a._time || a._order) - (b._time || b._order))
    .reduce((merged, point) => {
      const normalized = { ...point };
      delete normalized._order;
      delete normalized._time;
      appendDistinctTrackPoint(merged, normalized);
      return merged;
    }, []);
}

function droneToTrackPoint(drone) {
  if (!hasValidPosition(drone)) {
    return null;
  }

  return {
    lat: Number(drone.lat),
    lng: Number(drone.lng),
    timestamp: drone.last_heartbeat || Date.now(),
    temperature: drone.temperature,
    smoke: drone.smoke,
    fire_confidence: drone.fire_confidence,
  };
}

function appendDistinctTrackPoint(track, point) {
  const last = track[track.length - 1];
  if (!last || Math.abs(Number(last.lat) - point.lat) > TRACK_MIN_DELTA || Math.abs(Number(last.lng) - point.lng) > TRACK_MIN_DELTA) {
    track.push(point);
  }
}

function toTrackLatLngs(track) {
  const points = [];
  track.filter(hasValidPosition).forEach((point) => {
    const latLng = [Number(point.lat), Number(point.lng)];
    const last = points[points.length - 1];
    if (!last || Math.abs(last[0] - latLng[0]) > TRACK_MIN_DELTA || Math.abs(last[1] - latLng[1]) > TRACK_MIN_DELTA) {
      points.push(latLng);
    }
  });
  return points;
}

function normalizeTrackForDisplay(points) {
  if (!state.useRealApi) {
    return points;
  }

  const recentPoints = points.slice(-REAL_TRACK_RENDER_LIMIT);
  const normalized = [];
  recentPoints.forEach((point) => {
    const last = normalized[normalized.length - 1];
    if (!last || Math.abs(last[0] - point[0]) > REAL_TRACK_RENDER_MIN_DELTA || Math.abs(last[1] - point[1]) > REAL_TRACK_RENDER_MIN_DELTA) {
      normalized.push(point);
    }
  });

  return normalized.length > 1 ? normalized : recentPoints.slice(-2);
}

function renderDroneColorLegend() {
  if (!els.droneColorLegend) {
    return;
  }

  if (state.drones.length === 0) {
    els.droneColorLegend.innerHTML = '<span class="muted">暂无无人机颜色标识</span>';
    return;
  }

  els.droneColorLegend.innerHTML = state.drones
    .map((drone) => {
      const color = escapeAttribute(getTrackColor(drone.drone_id));
      const name = escapeHtml(drone.name || drone.drone_id || "--");
      const id = escapeHtml(drone.drone_id || "--");
      return `
        <span class="drone-color-item">
          <i style="--item-color:${color}"></i>
          <strong>${name}</strong>
          <small>${id}</small>
        </span>
      `;
    })
    .join("");
}

function renderTrackLine(points, droneId) {
  L.polyline(points, {
    className: "track-line-core",
    color: getTrackColor(droneId),
    weight: 3,
    opacity: 0.78,
    pane: TRACK_PANE,
    lineCap: "round",
    lineJoin: "round",
  })
    .bindTooltip(`${droneId} 历史轨迹`)
    .addTo(state.mapLayers.tracks);
}

function getTrackColor(droneId) {
  const key = String(droneId || "");
  const numericSuffix = key.match(/(\d+)$/);
  if (numericSuffix) {
    return TRACK_COLORS[(Number(numericSuffix[1]) - 1) % TRACK_COLORS.length];
  }

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return TRACK_COLORS[hash % TRACK_COLORS.length];
}

function applyInitialMapFocus() {
  if (
    !state.map ||
    !state.mapInitialFocusPending ||
    state.activeView !== "mapView" ||
    state.mapFocusDataVersion <= state.mapFocusRequestedAfterVersion
  ) {
    return;
  }

  const points = state.drones.filter(hasValidPosition).map((drone) => [Number(drone.lat), Number(drone.lng)]);
  if (points.length === 0) {
    return;
  }

  state.mapInitialFocusPending = false;
  if (points.length === 1) {
    state.map.setView(points[0], MAP_SINGLE_DRONE_ZOOM, { animate: false });
    return;
  }

  const bounds = L.latLngBounds(points);
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const isTightCluster = Math.abs(northEast.lat - southWest.lat) < 0.0001 && Math.abs(northEast.lng - southWest.lng) < 0.0001;
  if (isTightCluster) {
    state.map.setView(bounds.getCenter(), MAP_SINGLE_DRONE_ZOOM, { animate: false });
    return;
  }

  state.map.fitBounds(bounds, {
    animate: false,
    maxZoom: MAP_FOCUS_MAX_ZOOM,
    padding: MAP_FOCUS_PADDING,
  });
}

function mergeAlertsForMap() {
  const seen = new Set();
  return [...state.alerts, ...state.pendingAlerts].filter((alert) => {
    if (!hasValidPosition(alert) || seen.has(alert.alert_id)) {
      return false;
    }
    seen.add(alert.alert_id);
    return true;
  });
}

function updateHeaderStats() {
  const online = state.drones.filter((drone) => drone.status !== "offline").length;
  const pending = state.pendingAlerts.length;
  const hasHigh = state.pendingAlerts.some((alert) => alert.level === "high");
  const hasMedium = state.pendingAlerts.some((alert) => alert.level === "medium");

  els.onlineCount.textContent = online;
  els.pendingCount.textContent = pending;
  els.riskLevel.textContent = hasHigh ? "高" : hasMedium ? "中" : pending > 0 ? "低" : "平稳";
}

async function handleAlertAction(action) {
  if (!state.selectedAlertId) {
    return;
  }
  const method = action === "confirm" ? "confirmAlert" : "ignoreAlert";
  els.confirmAlertBtn.disabled = true;
  els.ignoreAlertBtn.disabled = true;
  try {
    await currentApi()[method](state.selectedAlertId);
    await refreshAlerts();
    updateHeaderStats();
    renderMap();
  } catch (error) {
    setConnectionText(error);
  }
}

function droneIcon(status, droneId) {
  const markerStatus = ["online", "cruising", "returning", "offline"].includes(status) ? status : "offline";
  const markerColor = escapeAttribute(getTrackColor(droneId));
  return L.divIcon({
    className: "",
    html: `<div class="drone-marker drone-marker-${markerStatus}" style="--marker-color:${markerColor}"><span></span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function fireIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="fire-marker"></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function renderStatus(status) {
  return `<span class="status-pill status-${escapeAttribute(status)}">${statusText[status] || escapeHtml(status || "--")}</span>`;
}

function renderLevel(level) {
  return `<span class="level-badge level-${escapeAttribute(level)}">${levelText[level] || escapeHtml(level || "--")}</span>`;
}

function setConnectionText(error) {
  if (error) {
    els.connectionState.innerHTML = `<span class="reconnect-text">${state.useRealApi ? "真实后端" : "Mock"} 重连中...</span>`;
    return;
  }
  els.connectionState.textContent = state.useRealApi ? "真实后端 已连接" : "Mock 数据模式";
}

function hasValidPosition(item) {
  return Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
}

function toTimeMs(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return value < 10000000000 ? value * 1000 : value;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 10000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value) {
  const ms = toTimeMs(value);
  if (!ms) {
    return "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function formatCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "--";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "--";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

document.addEventListener("DOMContentLoaded", init);
