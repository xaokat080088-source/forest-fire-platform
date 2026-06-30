# API_CONTRACT.md（接口契约 v1.0）
后端默认地址：http://localhost:8000
所有 JSON 字段统一 snake_case。后端必须开启 CORS（允许所有来源）。

## 数据模型
Drone（无人机）
  drone_id, name, status, lat, lng, battery, area, last_heartbeat
  status 枚举: online / cruising / returning / offline

Telemetry（巡检上报）
  drone_id, lat, lng, altitude, battery, temperature, smoke, fire_confidence, image_url(可选), timestamp

Alert（告警）
  alert_id, drone_id, lat, lng, level, reason, created_at, status
  level 枚举: low / medium / high
  status 枚举: pending / confirmed / ignored

## 接口列表
1. POST /api/drones/register
   body: { drone_id, name, status, lat, lng, battery, area }
   resp: { ok: true, drone: {...} }

2. POST /api/drones/{drone_id}/heartbeat
   body: { status, battery, lat, lng }
   resp: { ok: true }

3. POST /api/telemetry
   body: { drone_id, lat, lng, altitude, battery, temperature, smoke, fire_confidence, image_url? }
   resp: { ok: true, alert: {...}|null }   // 触发告警则返回该告警

4. GET /api/drones
   resp: { drones: [Drone, ...] }   // status 由后端按最近心跳实时计算

5. GET /api/drones/{drone_id}/track?limit=100
   resp: { drone_id, track: [{lat, lng, timestamp, temperature, smoke, fire_confidence}, ...] }

6. GET /api/alerts?status=pending|confirmed|ignored|all
   resp: { alerts: [Alert, ...] }

7. GET /api/alerts/{alert_id}
   resp: { alert: {...} }

8. POST /api/alerts/{alert_id}/confirm
   resp: { ok: true, alert: {...} }

9. POST /api/alerts/{alert_id}/ignore
   resp: { ok: true, alert: {...} }

## 告警规则（写进后端 config，可调）
- high:   fire_confidence >= 0.8  或 temperature >= 80  或 同区域连续异常 >= 3 次
- medium: temperature >= 60  或 smoke >= 70  或 fire_confidence >= 0.6
- low:    temperature >= 50  或 smoke >= 50  或 fire_confidence >= 0.4
- 都不满足则不告警。reason 写明触发了哪些条件。

## 配置项（config）
heartbeat_timeout_sec=10  心跳超时判离线
sim_drone_count=5         模拟无人机数量
report_interval_sec=3     上报间隔
heartbeat_interval_sec=5  心跳间隔
端口：后端 8000，前端静态 5500
