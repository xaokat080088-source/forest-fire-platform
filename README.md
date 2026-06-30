![无人机森林火情巡检与预警平台](./shoutu.png)

# 无人机森林火情巡检与预警平台 — README

森林火情巡检与预警的轻量级平台：模拟多架无人机定时巡航、上报位置与温度/烟雾/火情置信度，后端按规则生成火情告警，前端实时展示无人机状态、轨迹与告警。

## 1. 本地环境要求

- **Python 3.9+**（开发验证于 3.11；前端静态服务用 Python 自带 `http.server`，无需 Node）
- 依赖见 `requirements.txt`：fastapi / uvicorn / pydantic / requests
- 操作系统：Windows（`start.bat` 一键脚本为 Windows 批处理；Linux/macOS 可按第 3 节手动启动）
- 端口占用：后端 **8000**、前端 **5500**（被占用时先释放或在 `backend/config.py` 调整）

## 2. 一键启动（推荐）

**双击 `start.vbs`** 即可（推荐的普通演示入口）。它**不弹出任何黑色 cmd 窗口**，以隐藏方式在后台启动全部服务，等服务就绪后自动打开浏览器。底层启动逻辑在 `scripts/start_services.ps1`，会自动完成：

1. 探测 Python 命令（优先 `python`，回退 `py`；都没有则在日志中提示安装并退出）
2. **检查 / 创建项目本地虚拟环境 `.venv`**，依赖只装进 `.venv`，**不污染系统全局 Python**
3. 在 `.venv` 内 `pip install -r requirements.txt` 安装依赖
4. **后台静默**启动后端 FastAPI（端口 8000），日志写入 `logs\backend.log` / `logs\backend.err.log`
5. **后台静默**启动前端静态服务（端口 5500，使用 `scripts/serve_frontend.py` 安静服务器），日志写入 `logs\frontend.log` / `logs\frontend.err.log`
6. **后台静默**启动无人机模拟端（自动注册并持续上报），日志写入 `logs\simulator.log` / `logs\simulator.err.log`
7. **探测后端 8000 与前端 5500 两个端口都就绪后**，才自动用默认浏览器打开 `http://localhost:5500`（最多等约 24 秒，超时也会尝试打开）

各后台进程的 PID 会写入 `logs\pids.txt`，供 `stop.bat` 停止使用。所有路径基于脚本所在目录推导，不写死盘符，可从任意位置双击运行。

> **注意**：服务在**后台**运行，没有可见窗口；启动后即可关心浏览器页面，无需保留任何窗口。

三个入口的分工：

| 用途 | 入口 | 说明 |
| --- | --- | --- |
| **普通演示（推荐）** | 双击 **`start.vbs`** | 无黑窗，后台静默启动，就绪后自动开浏览器 |
| **排错调试** | 运行 **`start_debug.bat`** 或 **`start.bat`** | `start.bat` 在可见控制台跑同一套逻辑；`start_debug.bat` 用三个可见窗口（Backend / Simulator / Frontend）分别显示各服务实时输出 |
| **停止服务** | 双击 **`stop.bat`** | 三重清理：① 按 `logs\pids.txt` 停后端/前端/模拟端；② 停掉本项目 `.venv` python 起的所有进程（精准命中本项目，不碰系统 Python）；③ 按端口 8000/5500 兜底清理。运行后端口即释放 |

> `start.bat` 与 `start.vbs` 共用 `scripts/start_services.ps1`，区别只是 `start.bat` 带可见控制台、`start.vbs` 完全无窗口。

## 3. 手动分步启动

```bash
# 0) 安装依赖（项目根目录）
pip install -r requirements.txt

# 1) 启动后端（端口 8000）
cd backend
python app.py

# 2) 启动前端静态服务（另开一个终端，项目根目录）
cd frontend
python -m http.server 5500

# 3) 启动无人机模拟端（再开一个终端，项目根目录）
cd drone-simulator
python simulator.py
```

启动顺序建议：后端 → 前端 → 模拟端（模拟端内置等待后端就绪的重试，先起也可以）。

## 3b. 方式二：Docker 一键启动

已提供 `docker-compose.yml`，无需本机装 Python 即可一条命令拉起后端 + 模拟端 + 前端：

```bash
docker-compose up --build
```

- `backend`：构建自 `backend/Dockerfile`（python:3.11-slim），暴露 8000。
- `simulator`：构建自 `drone-simulator/Dockerfile`，通过环境变量 `PLATFORM_URL=http://backend:8000` 用服务名连后端（对应 `config.py` 的 `PLATFORM_URL` 配置项）。
- `frontend`：nginx:alpine 挂载 `frontend/` 静态文件，映射到宿主机 5500。

启动后访问与方式一相同：前端 http://localhost:5500 、后端 http://localhost:8000 。停止：`Ctrl+C` 后 `docker-compose down`。

## 4. 访问地址

题目要求的三项访问地址说明如下。

### 4.1 前端页面地址
- **http://localhost:5500** — 单页指挥中心（无人机列表 / 巡检地图 / 告警中心三个标签页，每 2 秒自动刷新）。

### 4.2 后端接口地址
- **http://localhost:8000** — 后端接口根，`GET /` 返回服务状态与接口清单，可快速确认服务存活。
- **http://localhost:8000/docs** — Swagger 交互式接口文档，可在线调试全部 9 个接口。

### 4.3 模拟无人机验证接口（确认模拟端在工作）
启动模拟端后，用以下接口确认它正在持续注册并上报：

| 验证目的 | 接口 | 预期现象 |
| --- | --- | --- |
| 模拟端已注册并在线 | `GET http://localhost:8000/api/drones` | 能看到 5 架无人机，`status` 为 `cruising`（非 offline）；反复刷新可见 `lat/lng`、`battery`、`last_heartbeat` 在变化 |
| 巡检轨迹在增长 | `GET http://localhost:8000/api/drones/{drone_id}/track?limit=100`（如 `.../sim_01/track`） | `track` 数组随时间不断增加新点，每点含 `lat/lng/timestamp/temperature/smoke/fire_confidence` |
| 火情告警在产生 | `GET http://localhost:8000/api/alerts?status=all` | 运行一段时间后出现 low/medium/high 告警；或用 `scripts/demo_trigger.py` 手动触发 |

> 小贴士：把 `GET /api/drones` 在浏览器里多刷新几次，看到经纬度和电量数字在变，就说明模拟端心跳与上报链路正常。


## 5. 验收提示

- **数据为内存存储，重启后端即清空**。演示时请让后端连续运行，不要中途重启，否则已注册的无人机和已产生的告警会丢失。
- 模拟端按概率随机制造异常值，运行一小段时间后告警中心会自然出现 low/medium/high 三档告警。
- 想快速制造一条 high 告警：对 `/api/telemetry` 上报 `temperature=95` 或 `fire_confidence=0.9` 即可。
- 接口契约以项目交付的 `API_CONTRACT.md` 为准，字段全部 snake_case。
