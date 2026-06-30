# -*- coding: utf-8 -*-
"""无人机森林火情巡检与预警平台 - 后端
FastAPI + 内存存储。接口严格遵循 API_CONTRACT.md (v1.0)，字段全 snake_case。
"""
import time
import uuid
from typing import Optional, List, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config

app = FastAPI(title="Forest Fire Patrol Platform", version="1.0")

# CORS：允许所有来源（前端在另一端口）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- 内存存储 ----------------
DRONES: Dict[str, dict] = {}          # drone_id -> drone dict
TRACKS: Dict[str, List[dict]] = {}    # drone_id -> [telemetry point...]
ALERTS: Dict[str, dict] = {}          # alert_id -> alert dict
# 同区域连续异常计数：area -> 连续异常次数
AREA_ABNORMAL_STREAK: Dict[str, int] = {}


def now_ts() -> float:
    return time.time()


# ---------------- 请求模型 ----------------
class RegisterBody(BaseModel):
    drone_id: str
    name: str
    status: str
    lat: float
    lng: float
    battery: float
    area: str


class HeartbeatBody(BaseModel):
    status: str
    battery: float
    lat: float
    lng: float


class TelemetryBody(BaseModel):
    drone_id: str
    lat: float
    lng: float
    altitude: float
    battery: float
    temperature: float
    smoke: float
    fire_confidence: float
    image_url: Optional[str] = None


# ---------------- 在线/离线计算 ----------------
def computed_status(drone: dict) -> str:
    """按最近心跳实时计算状态：超时判 offline，否则用其自报 status。"""
    last = drone.get("last_heartbeat", 0)
    if now_ts() - last > config.HEARTBEAT_TIMEOUT_SEC:
        return "offline"
    return drone.get("status", "online")


def drone_view(drone: dict) -> dict:
    """对外输出：status 用实时计算值。"""
    out = dict(drone)
    out["status"] = computed_status(drone)
    return out


# ---------------- 告警规则 ----------------
def is_abnormal(t: TelemetryBody) -> bool:
    """是否达到“异常”门槛（用于同区域连续异常计数）。"""
    return (
        t.temperature >= config.ABNORMAL_TEMPERATURE
        or t.smoke >= config.ABNORMAL_SMOKE
        or t.fire_confidence >= config.ABNORMAL_FIRE_CONFIDENCE
    )


def evaluate_alert(t: TelemetryBody, area: str) -> Optional[dict]:
    """按契约规则判定告警等级。返回新建的 alert dict，或 None。"""
    reasons: List[str] = []
    level: Optional[str] = None

    # 先更新同区域连续异常计数
    if is_abnormal(t):
        AREA_ABNORMAL_STREAK[area] = AREA_ABNORMAL_STREAK.get(area, 0) + 1
    else:
        AREA_ABNORMAL_STREAK[area] = 0
    streak = AREA_ABNORMAL_STREAK.get(area, 0)

    # ---- high ----
    if t.fire_confidence >= config.HIGH_FIRE_CONFIDENCE:
        reasons.append(f"火情识别置信度过高（{t.fire_confidence:g}，阈值{config.HIGH_FIRE_CONFIDENCE:g}）")
        level = "high"
    if t.temperature >= config.HIGH_TEMPERATURE:
        reasons.append(f"温度过高（{t.temperature:g}℃，阈值{config.HIGH_TEMPERATURE:g}℃）")
        level = "high"
    if streak >= config.HIGH_REPEAT_COUNT:
        reasons.append(f"同一区域连续{streak}次异常")
        level = "high"

    # ---- medium ----
    if level is None:
        if t.temperature >= config.MEDIUM_TEMPERATURE:
            reasons.append(f"温度过高（{t.temperature:g}℃，阈值{config.MEDIUM_TEMPERATURE:g}℃）")
            level = "medium"
        if t.smoke >= config.MEDIUM_SMOKE:
            reasons.append(f"烟雾浓度过高（{t.smoke:g}，阈值{config.MEDIUM_SMOKE:g}）")
            level = "medium"
        if t.fire_confidence >= config.MEDIUM_FIRE_CONFIDENCE:
            reasons.append(f"火情识别置信度过高（{t.fire_confidence:g}，阈值{config.MEDIUM_FIRE_CONFIDENCE:g}）")
            level = "medium"

    # ---- low ----
    if level is None:
        if t.temperature >= config.LOW_TEMPERATURE:
            reasons.append(f"温度过高（{t.temperature:g}℃，阈值{config.LOW_TEMPERATURE:g}℃）")
            level = "low"
        if t.smoke >= config.LOW_SMOKE:
            reasons.append(f"烟雾浓度过高（{t.smoke:g}，阈值{config.LOW_SMOKE:g}）")
            level = "low"
        if t.fire_confidence >= config.LOW_FIRE_CONFIDENCE:
            reasons.append(f"火情识别置信度过高（{t.fire_confidence:g}，阈值{config.LOW_FIRE_CONFIDENCE:g}）")
            level = "low"

    if level is None:
        return None

    alert = {
        "alert_id": uuid.uuid4().hex,
        "drone_id": t.drone_id,
        "lat": t.lat,
        "lng": t.lng,
        "level": level,
        "reason": "；".join(reasons),
        "created_at": now_ts(),
        "status": "pending",
        # 触发本条告警的 telemetry 现场图像/识别快照（可选，可能为 None）
        "image_url": t.image_url,
    }
    ALERTS[alert["alert_id"]] = alert
    return alert


# ---------------- 接口 ----------------
# 根路由：快速确认服务存活
@app.get("/")
def root():
    return {
        "service": "Forest Fire Patrol Platform",
        "status": "ok",
        "version": "1.0",
        "endpoints": [
            "POST /api/drones/register",
            "POST /api/drones/{drone_id}/heartbeat",
            "POST /api/telemetry",
            "GET  /api/drones",
            "GET  /api/drones/{drone_id}/track?limit=100",
            "GET  /api/alerts?status=pending|confirmed|ignored|all",
            "GET  /api/alerts/{alert_id}",
            "POST /api/alerts/{alert_id}/confirm",
            "POST /api/alerts/{alert_id}/ignore",
        ],
        "docs": "/docs",
    }


# 1. 注册
@app.post("/api/drones/register")
def register_drone(body: RegisterBody):
    drone = {
        "drone_id": body.drone_id,
        "name": body.name,
        "status": body.status,
        "lat": body.lat,
        "lng": body.lng,
        "battery": body.battery,
        "area": body.area,
        "last_heartbeat": now_ts(),
    }
    DRONES[body.drone_id] = drone
    TRACKS.setdefault(body.drone_id, [])
    return {"ok": True, "drone": drone_view(drone)}


# 2. 心跳
@app.post("/api/drones/{drone_id}/heartbeat")
def heartbeat(drone_id: str, body: HeartbeatBody):
    drone = DRONES.get(drone_id)
    if drone is None:
        raise HTTPException(
            status_code=404,
            detail=f"无人机不存在 drone_not_found: {drone_id}（请先调用 /api/drones/register 注册）",
        )
    drone["status"] = body.status
    drone["battery"] = body.battery
    drone["lat"] = body.lat
    drone["lng"] = body.lng
    drone["last_heartbeat"] = now_ts()
    return {"ok": True}


# 3. 巡检上报
@app.post("/api/telemetry")
def telemetry(body: TelemetryBody):
    drone = DRONES.get(body.drone_id)
    area = drone["area"] if drone else body.drone_id
    point = {
        "lat": body.lat,
        "lng": body.lng,
        "timestamp": now_ts(),
        "temperature": body.temperature,
        "smoke": body.smoke,
        "fire_confidence": body.fire_confidence,
        "image_url": body.image_url,
    }
    TRACKS.setdefault(body.drone_id, []).append(point)
    # 上报也刷新位置/在线
    if drone is not None:
        drone["lat"] = body.lat
        drone["lng"] = body.lng
        drone["battery"] = body.battery
        drone["last_heartbeat"] = now_ts()

    alert = evaluate_alert(body, area)
    return {"ok": True, "alert": alert}


# 4. 无人机列表
@app.get("/api/drones")
def list_drones():
    return {"drones": [drone_view(d) for d in DRONES.values()]}


# 5. 轨迹
@app.get("/api/drones/{drone_id}/track")
def get_track(drone_id: str, limit: int = 100):
    if drone_id not in DRONES and drone_id not in TRACKS:
        raise HTTPException(
            status_code=404,
            detail=f"无人机不存在 drone_not_found: {drone_id}",
        )
    track = TRACKS.get(drone_id, [])
    return {"drone_id": drone_id, "track": track[-limit:]}


# 6. 告警列表
@app.get("/api/alerts")
def list_alerts(status: str = "pending"):
    items = list(ALERTS.values())
    if status and status != "all":
        items = [a for a in items if a["status"] == status]
    items.sort(key=lambda a: a["created_at"], reverse=True)
    return {"alerts": items}


# 7. 告警详情
@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str):
    alert = ALERTS.get(alert_id)
    if alert is None:
        raise HTTPException(
            status_code=404,
            detail=f"告警不存在 alert_not_found: {alert_id}",
        )
    return {"alert": alert}


# 8. 确认告警
@app.post("/api/alerts/{alert_id}/confirm")
def confirm_alert(alert_id: str):
    alert = ALERTS.get(alert_id)
    if alert is None:
        raise HTTPException(
            status_code=404,
            detail=f"告警不存在 alert_not_found: {alert_id}",
        )
    alert["status"] = "confirmed"
    return {"ok": True, "alert": alert}


# 9. 忽略告警
@app.post("/api/alerts/{alert_id}/ignore")
def ignore_alert(alert_id: str):
    alert = ALERTS.get(alert_id)
    if alert is None:
        raise HTTPException(
            status_code=404,
            detail=f"告警不存在 alert_not_found: {alert_id}",
        )
    alert["status"] = "ignored"
    return {"ok": True, "alert": alert}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.BACKEND_HOST, port=config.BACKEND_PORT)
