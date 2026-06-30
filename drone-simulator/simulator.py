# -*- coding: utf-8 -*-
"""无人机模拟客户端
启动后自动注册 SIM_DRONE_COUNT 架无人机，定时发心跳 + 巡检数据。
位置缓慢移动形成轨迹，随机制造少量异常值触发不同等级告警。
"""
import os
import sys
import time
import random
import threading

import requests

# 复用 backend/config.py 的配置
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import config

BASE = config.PLATFORM_URL
AREAS = ["north_ridge", "east_valley", "south_slope", "west_lake", "central_park"]
# 基准坐标（某林区附近），各机分散开
BASE_LAT, BASE_LNG = 30.2741, 120.1551


def make_drones():
    drones = []
    for i in range(config.SIM_DRONE_COUNT):
        did = f"sim_{i+1:02d}"
        lat0 = BASE_LAT + random.uniform(-0.05, 0.05)
        lng0 = BASE_LNG + random.uniform(-0.05, 0.05)
        drones.append({
            "drone_id": did,
            "name": f"巡检机-{i+1:02d}",
            "status": "cruising",
            "lat": lat0,
            "lng": lng0,
            # 初始区域中心：用于限幅回拉，避免长时间运行飞出巡检区域
            "home_lat": lat0,
            "home_lng": lng0,
            "battery": 100.0,
            "area": AREAS[i % len(AREAS)],
        })
    return drones


def register(d):
    try:
        r = requests.post(f"{BASE}/api/drones/register", json={
            "drone_id": d["drone_id"], "name": d["name"], "status": d["status"],
            "lat": d["lat"], "lng": d["lng"], "battery": d["battery"], "area": d["area"],
        }, timeout=5)
        print(f"[register] {d['drone_id']} -> {r.status_code}")
    except Exception as e:
        print(f"[register] {d['drone_id']} failed: {e}")


def gen_telemetry(d):
    """生成一条巡检数据，绝大多数正常，少量异常。异常概率由 config 控制。"""
    roll = random.random()
    p_high = config.SIM_PROB_HIGH
    p_med = p_high + config.SIM_PROB_MEDIUM
    p_low = p_med + config.SIM_PROB_LOW
    abnormal = True
    if roll < p_high:          # 高危：触发 high
        temp = random.uniform(80, 110)
        smoke = random.uniform(70, 100)
        fire = random.uniform(0.8, 0.99)
    elif roll < p_med:         # 中危：触发 medium
        temp = random.uniform(60, 79)
        smoke = random.uniform(50, 75)
        fire = random.uniform(0.5, 0.7)
    elif roll < p_low:         # 低危：触发 low
        temp = random.uniform(50, 59)
        smoke = random.uniform(45, 55)
        fire = random.uniform(0.4, 0.5)
    else:                      # 正常
        temp = random.uniform(20, 45)
        smoke = random.uniform(0, 30)
        fire = random.uniform(0, 0.3)
        abnormal = False

    # 题目3.2 可选项：触发疑似火情的上报带模拟图片识别快照 URL，正常数据不带
    image_url = None
    if abnormal:
        ts = int(time.time())
        image_url = f"https://example.com/fire-snapshot/{d['drone_id']}-{ts}.jpg"

    return {
        "drone_id": d["drone_id"],
        "lat": d["lat"], "lng": d["lng"],
        "altitude": random.uniform(80, 150),
        "battery": d["battery"],
        "temperature": round(temp, 1),
        "smoke": round(smoke, 1),
        "fire_confidence": round(fire, 2),
        "image_url": image_url,
    }


def drift(d):
    """缓慢移动形成轨迹，并耗电。

    漂移幅度由 config.SIM_MOVE_STEP_LAT/LNG 控制（默认约 22 米/次，缓慢巡航）。
    若偏离初始区域中心超过 SIM_AREA_RADIUS_DEG，则往中心轻微回拉，避免飞出巡检区。
    """
    step_lat = config.SIM_MOVE_STEP_LAT
    step_lng = config.SIM_MOVE_STEP_LNG
    d["lat"] += random.uniform(-step_lat, step_lat)
    d["lng"] += random.uniform(-step_lng, step_lng)

    # 区域限幅：偏离中心太远时，朝中心方向回拉一步
    radius = config.SIM_AREA_RADIUS_DEG
    if d["lat"] - d["home_lat"] > radius:
        d["lat"] -= step_lat
    elif d["home_lat"] - d["lat"] > radius:
        d["lat"] += step_lat
    if d["lng"] - d["home_lng"] > radius:
        d["lng"] -= step_lng
    elif d["home_lng"] - d["lng"] > radius:
        d["lng"] += step_lng

    d["battery"] = max(0.0, d["battery"] - random.uniform(0.1, 0.5))


def run_drone(d):
    register(d)
    last_hb = 0.0
    while True:
        try:
            drift(d)
            # 巡检上报
            r = requests.post(f"{BASE}/api/telemetry", json=gen_telemetry(d), timeout=5)
            alert = r.json().get("alert")
            if alert:
                print(f"[alert] {d['drone_id']} {alert['level']} :: {alert['reason']}")
            # 心跳
            now = time.time()
            if now - last_hb >= config.HEARTBEAT_INTERVAL_SEC:
                requests.post(f"{BASE}/api/drones/{d['drone_id']}/heartbeat", json={
                    "status": "cruising", "battery": d["battery"],
                    "lat": d["lat"], "lng": d["lng"],
                }, timeout=5)
                last_hb = now
        except Exception as e:
            print(f"[loop] {d['drone_id']} error: {e}")
        time.sleep(config.REPORT_INTERVAL_SEC)


def main():
    # 等后端起来
    for _ in range(30):
        try:
            requests.get(f"{BASE}/api/drones", timeout=2)
            break
        except Exception:
            print("waiting for backend...")
            time.sleep(1)

    drones = make_drones()
    threads = []
    for d in drones:
        t = threading.Thread(target=run_drone, args=(d,), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.2)

    print(f"simulator running with {len(drones)} drones. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("simulator stopped.")


if __name__ == "__main__":
    main()
