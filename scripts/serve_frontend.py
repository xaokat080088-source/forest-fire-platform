# -*- coding: utf-8 -*-
"""安静的前端静态服务器（端口 5500）。

仅用于一键启动时托管 frontend 目录的静态页面，相比 `python -m http.server`：
- 静默浏览器正常断连导致的 ConnectionResetError / BrokenPipeError，不再刷整页 traceback；
- /favicon.ico 不存在时安静返回 204，不刷 404；
- 简化访问日志。

只服务静态文件，不改 frontend 源码。目录基于本脚本位置用绝对路径定位，不写死盘符。
用法： python scripts/serve_frontend.py [port]
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500

# 基于脚本位置定位项目根下的 frontend（scripts/ 的上一级即项目根）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")


class QuietHandler(SimpleHTTPRequestHandler):
    """静默正常断连、简化日志、favicon 安静 204 的静态处理器。"""

    def handle_one_request(self):
        # 捕获浏览器刷新/快速切页造成的断连，避免整页 traceback
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            self.close_connection = True

    def do_GET(self):
        # favicon 不存在时安静返回 204，不刷 404
        if self.path == "/favicon.ico":
            fav = os.path.join(FRONTEND_DIR, "favicon.ico")
            if not os.path.exists(fav):
                try:
                    self.send_response(204)
                    self.end_headers()
                except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                    self.close_connection = True
                return
        try:
            super().do_GET()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            self.close_connection = True

    def log_message(self, fmt, *args):
        # 简化访问日志：仅 "时间 方法路径 状态"
        sys.stdout.write("[frontend] %s - %s\n" % (self.log_date_time_string(), (fmt % args)))

    def log_error(self, *args):
        # 错误用普通日志，不再额外打栈
        pass


def main():
    if not os.path.isdir(FRONTEND_DIR):
        print(f"[frontend] 未找到前端目录: {FRONTEND_DIR}")
        print("[frontend] 前端尚未就绪，静态服务退出。")
        sys.exit(1)

    handler = partial(QuietHandler, directory=FRONTEND_DIR)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    httpd.daemon_threads = True
    print(f"[frontend] serving {FRONTEND_DIR}")
    print(f"[frontend] http://localhost:{PORT}  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[frontend] stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
