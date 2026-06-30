FROM python:3.11-slim
WORKDIR /app

# 先装依赖，利用缓存
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# simulator.py 通过 ../backend/config.py 读取配置，需保留该相对结构
COPY backend/ /app/backend/
COPY drone-simulator/ /app/drone-simulator/

WORKDIR /app/drone-simulator
CMD ["python", "simulator.py"]
