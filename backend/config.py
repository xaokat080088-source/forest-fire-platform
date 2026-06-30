# -*- coding: utf-8 -*-
"""全局配置：告警阈值、心跳超时、端口、模拟参数。全部集中在这里，方便调。"""
import os

# ---- 服务端口 ----
BACKEND_HOST = "0.0.0.0"
BACKEND_PORT = 8000

# ---- 心跳 / 在线判定 ----
HEARTBEAT_TIMEOUT_SEC = 10        # 最近心跳超过该秒数判 offline

# ---- 模拟端参数 ----
SIM_DRONE_COUNT = 5               # 模拟无人机数量
REPORT_INTERVAL_SEC = 3           # 巡检数据上报间隔
HEARTBEAT_INTERVAL_SEC = 5        # 心跳间隔

# ---- 模拟端位置漂移（巡航速度，可配置） ----
# 每次上报 lat/lng 各自的最大随机漂移幅度（单位：度）。
# 0.0002 度 ≈ 约 22 米；按每 3 秒上报一次，约等于缓慢巡航，
# 地图上 10~20 秒能看出轨迹在增长，又不会两三秒跳很远（避免“瞬移”观感）。
# 调大变快、调小变慢。lat/lng 可分别设置（默认相同）。
SIM_MOVE_STEP_DEG = 0.0002
SIM_MOVE_STEP_LAT = SIM_MOVE_STEP_DEG
SIM_MOVE_STEP_LNG = SIM_MOVE_STEP_DEG
# 偏离初始区域中心超过该距离（度）时，往中心轻微回拉，避免长时间运行飞出巡检区域。
SIM_AREA_RADIUS_DEG = 0.01

# ---- 平台地址（模拟端连接后端的地址，题目4.1要求的配置项）----
# 默认本地 localhost:8000；Docker 等场景可用环境变量 PLATFORM_URL 覆盖（如 http://backend:8000）。
PLATFORM_URL = os.environ.get("PLATFORM_URL", "http://localhost:8000")
# 兼容旧名：保留 BACKEND_BASE_URL 指向同一地址
BACKEND_BASE_URL = PLATFORM_URL

# ---- 模拟端异常概率（演示温和频率，可调） ----
# 5 架机 × 每 3 秒上报 ≈ 50 条/30 秒；异常总概率 ~2% => 平均每 20~40 秒自然冒一条告警。
# 调高这些值会更频繁，调低更稀疏。三者之和即“出现任一告警”的概率。
SIM_PROB_HIGH = 0.005             # 高危概率 ~0.5%
SIM_PROB_MEDIUM = 0.007           # 中危概率 ~0.7%
SIM_PROB_LOW = 0.008              # 低危概率 ~0.8%

# ---- 告警阈值（与 API_CONTRACT.md 一致，可调） ----
# high
HIGH_FIRE_CONFIDENCE = 0.8
HIGH_TEMPERATURE = 80
HIGH_REPEAT_COUNT = 3             # 同区域连续异常达到该次数升级为 high

# medium
MEDIUM_TEMPERATURE = 60
MEDIUM_SMOKE = 70
MEDIUM_FIRE_CONFIDENCE = 0.6

# low
LOW_TEMPERATURE = 50
LOW_SMOKE = 50
LOW_FIRE_CONFIDENCE = 0.4

# 判定“异常”（用于同区域连续异常计数）的最低门槛：达到 low 即算一次异常
ABNORMAL_TEMPERATURE = LOW_TEMPERATURE
ABNORMAL_SMOKE = LOW_SMOKE
ABNORMAL_FIRE_CONFIDENCE = LOW_FIRE_CONFIDENCE
