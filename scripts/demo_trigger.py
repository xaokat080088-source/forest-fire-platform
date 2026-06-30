# -*- coding: utf-8 -*-
"""演示用一键触发火情脚本。
向后端 POST 一条 telemetry，立即在指定无人机上制造一条指定等级的告警，
用于面试现场可控演示（“我现在手动触发一个高危火情”）。

用法示例：
    python demo_trigger.py --level high
    python demo_trigger.py --level medium --drone sim_02
    python demo_trigger.py --level low --host http://localhost:8000

只调用已有接口 POST /api/telemetry，不改 API_CONTRACT.md。
"""
import sys
import time
import argparse

import requests

# 刚好满足各等级阈值的构造值（取阈值之上一点，确保稳定命中该档）
LEVEL_VALUES = {
    "high":   {"temperature": 95.0, "smoke": 85.0, "fire_confidence": 0.9},
    "medium": {"temperature": 65.0, "smoke": 72.0, "fire_confidence": 0.6},
    "low":    {"temperature": 52.0, "smoke": 51.0, "fire_confidence": 0.45},
}


def pick_drone(host):
    """未指定 drone 时，自动取第一架在线（非 offline）的无人机。"""
    try:
        r = requests.get(f"{host}/api/drones", timeout=5)
        drones = r.json().get("drones", [])
    except Exception as e:
        print(f"[错误] 无法获取无人机列表：{e}")
        sys.exit(1)
    if not drones:
        print("[错误] 后端当前没有任何无人机，请先启动模拟端 simulator.py。")
        sys.exit(1)
    for d in drones:
        if d.get("status") != "offline":
            return d
    # 全部离线则退而取第一架
    return drones[0]


def main():
    parser = argparse.ArgumentParser(description="演示用：手动触发一条指定等级的火情告警")
    parser.add_argument("--level", choices=["high", "medium", "low"], default="high",
                        help="告警等级（默认 high）")
    parser.add_argument("--drone", default=None,
                        help="无人机编号，如 sim_02；默认自动取第一架在线无人机")
    parser.add_argument("--host", default="http://localhost:8000",
                        help="后端地址（默认 http://localhost:8000）")
    args = parser.parse_args()

    # 确定目标无人机
    if args.drone:
        drone_id = args.drone
        lat, lng = 30.2741, 120.1551  # 未知机时给个默认坐标
        try:
            r = requests.get(f"{args.host}/api/drones", timeout=5)
            for d in r.json().get("drones", []):
                if d["drone_id"] == drone_id:
                    lat, lng = d["lat"], d["lng"]
                    break
        except Exception:
            pass
    else:
        d = pick_drone(args.host)
        drone_id = d["drone_id"]
        lat, lng = d["lat"], d["lng"]

    vals = LEVEL_VALUES[args.level]
    # 与 simulator.py 保持一致的现场图像/识别快照 URL 格式
    image_url = f"https://example.com/fire-snapshot/{drone_id}-{int(time.time())}.jpg"
    payload = {
        "drone_id": drone_id,
        "lat": lat,
        "lng": lng,
        "altitude": 120.0,
        "battery": 88.0,
        "temperature": vals["temperature"],
        "smoke": vals["smoke"],
        "fire_confidence": vals["fire_confidence"],
        "image_url": image_url,
    }

    print(f"[触发] 向 {drone_id} 上报 {args.level} 级火情数据："
          f"temp={vals['temperature']} smoke={vals['smoke']} fire={vals['fire_confidence']}")
    try:
        r = requests.post(f"{args.host}/api/telemetry", json=payload, timeout=5)
        data = r.json()
    except Exception as e:
        print(f"[错误] 上报失败：{e}")
        sys.exit(1)

    alert = data.get("alert")
    if alert:
        print(f"[成功] 已触发告警  编号 alert_id={alert['alert_id']}  等级 level={alert['level']}")
        print(f"        原因 reason={alert['reason']}")
        print(f"        现在打开告警中心页即可看到这条 {alert['level']} 告警。")
    else:
        print("[提示] 后端未返回告警（请检查 level 构造值是否达到阈值）。原始返回：", data)


if __name__ == "__main__":
    main()
