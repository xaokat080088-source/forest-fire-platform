(function () {
  const start = Date.now();
  const center = { lat: 30.5928, lng: 114.3055 };

  const drones = [
    {
      drone_id: "DR-001",
      name: "青龙山 01",
      status: "cruising",
      lat: 30.5928,
      lng: 114.3055,
      battery: 86,
      area: "A1 北坡",
      last_heartbeat: nowSeconds(),
    },
    {
      drone_id: "DR-002",
      name: "望火台 02",
      status: "online",
      lat: 30.6112,
      lng: 114.3248,
      battery: 58,
      area: "B3 山脊",
      last_heartbeat: nowSeconds(),
    },
    {
      drone_id: "DR-003",
      name: "白沙林 03",
      status: "returning",
      lat: 30.5725,
      lng: 114.2872,
      battery: 22,
      area: "C2 林缘",
      last_heartbeat: nowSeconds(),
    },
    {
      drone_id: "DR-004",
      name: "东湖口 04",
      status: "offline",
      lat: 30.6281,
      lng: 114.2814,
      battery: 41,
      area: "D4 水源地",
      last_heartbeat: nowSeconds() - 38,
    },
    {
      drone_id: "DR-005",
      name: "南麓巡检 05",
      status: "cruising",
      lat: 30.5536,
      lng: 114.3361,
      battery: 74,
      area: "E1 南麓",
      last_heartbeat: nowSeconds(),
    },
  ];

  const tracks = new Map();
  const alerts = [
    {
      alert_id: "ALERT-20260629-001",
      drone_id: "DR-002",
      lat: 30.6158,
      lng: 114.3287,
      level: "high",
      reason: "temperature>=80; fire_confidence>=0.8",
      created_at: nowSeconds() - 92,
      status: "pending",
      image_url: "https://example.com/mock/fire-snapshot-alert-001.jpg",
    },
    {
      alert_id: "ALERT-20260629-002",
      drone_id: "DR-003",
      lat: 30.5741,
      lng: 114.2912,
      level: "medium",
      reason: "smoke>=70",
      created_at: nowSeconds() - 410,
      status: "pending",
      image_url: "https://example.com/mock/fire-snapshot-alert-002.jpg",
    },
    {
      alert_id: "ALERT-20260629-003",
      drone_id: "DR-005",
      lat: 30.5572,
      lng: 114.3391,
      level: "low",
      reason: "fire_confidence>=0.4",
      created_at: nowSeconds() - 930,
      status: "confirmed",
      image_url: null,
    },
  ];

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function seedTracks() {
    drones.forEach((drone, droneIndex) => {
      const points = [];
      for (let i = 24; i >= 0; i -= 1) {
        const phase = (Date.now() - start) / 10000 + i * 0.34 + droneIndex;
        const lat = drone.lat + Math.sin(phase) * 0.004 + (i - 12) * 0.00026;
        const lng = drone.lng + Math.cos(phase * 0.9) * 0.004 + (12 - i) * 0.00018;
        const heat = drone.drone_id === "DR-002" && i < 6 ? 76 + i : 38 + droneIndex * 4 + Math.sin(phase) * 8;
        points.push({
          lat,
          lng,
          timestamp: nowSeconds() - i * 9,
          temperature: Number(heat.toFixed(1)),
          smoke: drone.drone_id === "DR-003" && i < 8 ? 64 + i : Math.max(8, 24 + Math.cos(phase) * 14),
          fire_confidence: drone.drone_id === "DR-002" && i < 5 ? 0.72 + i * 0.03 : Math.max(0.05, 0.24 + Math.sin(phase) * 0.18),
        });
      }
      tracks.set(drone.drone_id, points);
    });
  }

  function advanceMock() {
    drones.forEach((drone, index) => {
      if (drone.status === "offline") {
        return;
      }
      const phase = (Date.now() - start) / 8000 + index * 1.7;
      drone.lat = center.lat + Math.sin(phase) * (0.018 + index * 0.003) + index * 0.007 - 0.012;
      drone.lng = center.lng + Math.cos(phase * 0.8) * (0.02 + index * 0.002) + index * 0.004 - 0.01;
      drone.battery = Math.max(10, drone.battery - 0.08);
      drone.last_heartbeat = nowSeconds();

      const heatBias = drone.drone_id === "DR-002" ? 32 : 0;
      const smokeBias = drone.drone_id === "DR-003" ? 28 : 0;
      const point = {
        lat: drone.lat,
        lng: drone.lng,
        timestamp: nowSeconds(),
        temperature: Number((36 + heatBias + Math.sin(phase) * 12).toFixed(1)),
        smoke: Number((22 + smokeBias + Math.cos(phase) * 18).toFixed(1)),
        fire_confidence: Number(Math.max(0.04, 0.22 + (heatBias ? 0.5 : 0) + Math.sin(phase * 0.7) * 0.14).toFixed(2)),
      };
      const list = tracks.get(drone.drone_id) || [];
      list.push(point);
      tracks.set(drone.drone_id, list.slice(-80));
    });
  }

  seedTracks();

  window.MockApi = {
    async getDrones() {
      advanceMock();
      return { drones: drones.map((item) => ({ ...item, battery: Math.round(item.battery) })) };
    },

    async getTrack(droneId, limit = 100) {
      const track = (tracks.get(droneId) || []).slice(-limit).map((item) => ({ ...item }));
      return { drone_id: droneId, track };
    },

    async getAlerts(status = "all") {
      const items = alerts
        .filter((alert) => status === "all" || alert.status === status)
        .slice()
        .sort((a, b) => Number(b.created_at) - Number(a.created_at));
      return { alerts: items.map((item) => ({ ...item })) };
    },

    async getAlert(alertId) {
      return { alert: { ...alerts.find((alert) => alert.alert_id === alertId) } };
    },

    async confirmAlert(alertId) {
      const alert = alerts.find((item) => item.alert_id === alertId);
      if (alert) {
        alert.status = "confirmed";
      }
      return { ok: Boolean(alert), alert: alert ? { ...alert } : null };
    },

    async ignoreAlert(alertId) {
      const alert = alerts.find((item) => item.alert_id === alertId);
      if (alert) {
        alert.status = "ignored";
      }
      return { ok: Boolean(alert), alert: alert ? { ...alert } : null };
    },
  };
})();
