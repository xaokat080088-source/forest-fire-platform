# 前端说明

无人机森林火情巡检与预警平台前端，纯 HTML + 原生 JS + CSS，无构建工具。

## 启动

在项目根目录的 `frontend/` 目录下启动静态服务：

```bash
python -m http.server 5500
```

访问：

```text
http://localhost:5500
```

默认使用 `mock.js` 数据，页面右上角开关切到 Real 后，请求 `http://localhost:8000` 的契约接口。

## 文件

- `index.html`：单页入口、顶部统计、三个标签视图、Leaflet CDN。
- `styles.css`：深色指挥中心风格样式。
- `mock.js`：按 `API_CONTRACT.md` 字段构造 mock 数据和告警操作。
- `app.js`：2 秒轮询、mock/真实后端切换、地图渲染、告警确认/忽略。
