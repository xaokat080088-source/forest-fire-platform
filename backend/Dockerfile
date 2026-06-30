FROM python:3.11-slim
WORKDIR /app

# 先装依赖，利用缓存
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# 拷贝后端源码
COPY backend/ /app/backend/

WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "app.py"]
