#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
🌐 AkiLab DN42 - 轻量级反向 WebSocket 探针守护进程 (dn42-agent)
运行平台: Linux (Debian 11/12/13, Ubuntu 20.04+, Alpine Linux, CentOS/RHEL)
依赖要求: 纯 Python 3 原生标准库 (无需任何第三方 pip 模块)
==============================================================================
"""

import sys
import os
import time
import json
import socket
import ssl
import base64
import hashlib
import struct
import subprocess
import threading
import urllib.parse

# 确保在 systemd 或非 TTY 环境下日志实时输出刷新
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(line_buffering=True)

AGENT_VERSION = "2.0.0"

# ------------------------------------------------------------------------------
# 1. 简易原生 WebSocket 客户端 (零依赖标准库实现)
# ------------------------------------------------------------------------------
class RawWebSocketClient:
    def __init__(self, url, headers=None):
        self.url = url
        self.headers = headers or {}
        self.sock = None
        self.connected = False
        self.lock = threading.Lock()

    def connect(self, timeout=10):
        parsed = urllib.parse.urlparse(self.url)
        is_ssl = parsed.scheme in ('wss', 'https')
        host = parsed.hostname
        port = parsed.port or (443 if is_ssl else 80)
        path = parsed.path or '/'
        if parsed.query:
            path += '?' + parsed.query

        raw_sock = socket.create_connection((host, port), timeout=timeout)
        if is_ssl:
            context = ssl.create_default_context()
            self.sock = context.wrap_socket(raw_sock, server_hostname=host)
        else:
            self.sock = raw_sock

        sec_key = base64.b64encode(os.urandom(16)).decode('utf-8')
        host_hdr = host if (port == 80 and not is_ssl) or (port == 443 and is_ssl) else f"{host}:{port}"
        handshake_headers = [
            f"GET {path} HTTP/1.1",
            f"Host: {host_hdr}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {sec_key}",
            "Sec-WebSocket-Version: 13",
            "User-Agent: DN42-Agent/2.0",
        ]
        for k, v in self.headers.items():
            handshake_headers.append(f"{k}: {v}")

        req_payload = "\r\n".join(handshake_headers) + "\r\n\r\n"
        self.sock.sendall(req_payload.encode('utf-8'))

        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket 握手失败: 服务端提前关闭了连接 (EOF)")
            response += chunk

        status_line = response.split(b"\r\n")[0].decode('utf-8', 'ignore')
        if "101" not in status_line:
            headers_preview = response.decode('utf-8', 'ignore')[:600]
            hint = ""
            if "200" in status_line:
                hint = "\n⚠️ 诊断发现: 主控端反向代理 (如 Nginx / Caddy) 拦截了 WebSocket 请求并降级为普通网页。\n👉 解决方案: 请在主控面板的 Nginx 反代配置中增加 WebSocket 支持:\n     proxy_http_version 1.1;\n     proxy_set_header Upgrade $http_upgrade;\n     proxy_set_header Connection \"upgrade\";"
            elif "401" in status_line:
                hint = "\n⚠️ 诊断发现: 通信鉴权 Token 被主控端拒绝。\n👉 解决方案: 请确保主控端已执行 `dnp r` 重载最新服务，并核对 --token 参数是否正确。"
            elif "404" in status_line:
                hint = "\n⚠️ 诊断发现: 主控端 WebSocket 路由未命中 (/ws/probe)。\n👉 解决方案: 请在主控端执行 `dnp u` 升级服务并重启。"
            raise ConnectionError(f"握手被拒绝 [{status_line}]{hint}\n[服务器响应头部]\n{headers_preview.strip()}")

        self.connected = True
        self.sock.settimeout(None)

    def send_text(self, text):
        if not self.connected or not self.sock:
            return
        payload = text.encode('utf-8')
        length = len(payload)
        mask_key = os.urandom(4)

        header = bytearray()
        header.append(0x81)  # FIN + text frame

        if length <= 125:
            header.append(0x80 | length)
        elif length <= 65535:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))

        header.extend(mask_key)
        masked_payload = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))

        with self.lock:
            try:
                self.sock.sendall(header + masked_payload)
            except Exception:
                self.connected = False

    def recv_frame(self):
        if not self.connected or not self.sock:
            return None

        def read_exact(n):
            buf = bytearray()
            while len(buf) < n:
                chunk = self.sock.recv(n - len(buf))
                if not chunk:
                    raise ConnectionError("Socket closed")
                buf.extend(chunk)
            return buf

        b1, b2 = read_exact(2)
        opcode = b1 & 0x0F
        is_masked = bool(b2 & 0x80)
        payload_len = b2 & 0x7F

        if payload_len == 126:
            payload_len = struct.unpack("!H", read_exact(2))[0]
        elif payload_len == 127:
            payload_len = struct.unpack("!Q", read_exact(8))[0]

        mask = read_exact(4) if is_masked else None
        data = read_exact(payload_len)

        if is_masked:
            data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))

        # Handle Ping -> Pong
        if opcode == 0x09:
            self.send_pong(data)
            return None
        # Handle Close
        elif opcode == 0x08:
            self.connected = False
            return None
        # Text frame
        elif opcode in (0x01, 0x02):
            return data.decode('utf-8', 'ignore')

        return None

    def send_pong(self, data):
        header = bytearray([0x8A, len(data)])
        with self.lock:
            try:
                self.sock.sendall(header + data)
            except Exception:
                self.connected = False

    def close(self):
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None


# ------------------------------------------------------------------------------
# 2. 本地系统诊断与 BIRD 探针执行引擎
# ------------------------------------------------------------------------------
def find_bird_socket():
    candidates = [
        "/run/bird/bird.ctl",
        "/var/run/bird/bird.ctl",
        "/run/bird.ctl",
        "/var/run/bird.ctl",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

def execute_birdc(cmd):
    sock_path = find_bird_socket()
    try:
        args = ["birdc", "-s", sock_path] + cmd.split()
        res = subprocess.run(args, capture_output=True, text=True, timeout=10)
        output = res.stdout if res.returncode == 0 else (res.stdout + "\n" + res.stderr)
        return True, output.strip()
    except FileNotFoundError:
        return False, "❌ 错误: 本机未安装 birdc 命令行工具。"
    except subprocess.TimeoutExpired:
        return False, "❌ 执行超时: BIRD Socket 无响应 (10s)。"
    except Exception as e:
        return False, f"❌ 执行异常: {str(e)}"

def execute_ping(target):
    target = target.strip()
    # Determine IPv4 or IPv6
    is_v6 = ":" in target
    cmd = ["ping6" if is_v6 else "ping", "-c", "4", "-W", "2", target]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        return True, (res.stdout or res.stderr).strip()
    except Exception as e:
        return False, f"❌ Ping 失败: {str(e)}"

def execute_traceroute(target):
    target = target.strip()
    is_v6 = ":" in target
    cmd = ["traceroute6" if is_v6 else "traceroute", "-n", "-w", "2", "-m", "15", target]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return True, (res.stdout or res.stderr).strip()
    except Exception as e:
        return False, f"❌ Traceroute 失败: {str(e)}"

def scan_local_ports():
    ports = []
    # 1. WireGuard active interfaces
    try:
        res = subprocess.run(["wg", "show", "all", "listen-port"], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            for line in res.stdout.strip().splitlines():
                parts = line.split()
                if len(parts) >= 2:
                    iface = parts[0]
                    p = int(parts[1])
                    if 10000 <= p <= 65535:
                        ports.append({
                            "port": p,
                            "name": iface,
                            "label": f"{iface} : {p}",
                            "type": "in_use",
                            "status": "existing",
                            "source": "remote_probe"
                        })
    except Exception:
        pass

    # 2. ss -tulnp
    try:
        res = subprocess.run(["ss", "-tulnp"], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if ":" in line:
                    tokens = line.split()
                    for token in tokens:
                        if ":" in token:
                            p_str = token.split(":")[-1]
                            if p_str.isdigit():
                                p = int(p_str)
                                if 10000 <= p <= 65535 and not any(x["port"] == p for x in ports):
                                    ports.append({
                                        "port": p,
                                        "name": "service",
                                        "label": f"service : {p}",
                                        "type": "in_use",
                                        "status": "existing",
                                        "source": "remote_probe"
                                    })
    except Exception:
        pass

    return ports


# ------------------------------------------------------------------------------
# 3. Agent 主循环与消息调度
# ------------------------------------------------------------------------------
def run_agent(core_url, node_id, token):
    # Parse WS URL from core_url
    parsed = urllib.parse.urlparse(core_url)
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or parsed.path
    ws_url = f"{ws_scheme}://{netloc}/ws/probe?token={urllib.parse.quote(token)}&nodeId={urllib.parse.quote(node_id)}"

    print(f"🚀 [DN42 Agent] 正在连接 Master 主控端: {ws_scheme}://{netloc} (节点: {node_id}) ...")

    while True:
        client = None
        try:
            client = RawWebSocketClient(ws_url, headers={
                "Authorization": f"Bearer {token}",
                "X-Node-ID": node_id,
            })
            client.connect(timeout=10)
            print(f"✓ [DN42 Agent] 反向长连接建立成功！已上线 🟢")

            # Report initial ports & agent info
            client.send_text(json.dumps({
                "type": "agent_info",
                "version": AGENT_VERSION,
                "nodeId": node_id,
            }))
            
            initial_ports = scan_local_ports()
            client.send_text(json.dumps({
                "type": "port_report",
                "ports": initial_ports,
            }))

            # Main loop
            last_port_scan = time.time()
            while client.connected:
                # Periodic port scan (every 60s)
                if time.time() - last_port_scan > 60:
                    current_ports = scan_local_ports()
                    client.send_text(json.dumps({
                        "type": "port_report",
                        "ports": current_ports,
                    }))
                    last_port_scan = time.time()

                msg_str = client.recv_frame()
                if not msg_str:
                    continue

                try:
                    msg = json.loads(msg_str)
                    msg_type = msg.get("type")

                    if msg_type == "ping":
                        client.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": msg.get("timestamp"),
                        }))

                    elif msg_type == "lg_exec":
                        req_id = msg.get("id")
                        cmd_type = msg.get("commandType", "route")
                        target = msg.get("target", "")

                        t_start = time.time()
                        success = False
                        output = ""

                        if cmd_type == "route":
                            if target:
                                success, output = execute_birdc(f"show route for {target} all")
                            else:
                                success, output = execute_birdc("show route")
                        elif cmd_type == "protocols":
                            if target:
                                success, output = execute_birdc(f"show protocols {target}")
                            else:
                                success, output = execute_birdc("show protocols")
                        elif cmd_type == "status":
                            success, output = execute_birdc("show status")
                        elif cmd_type == "memory":
                            success, output = execute_birdc("show memory")
                        elif cmd_type == "symbols":
                            success, output = execute_birdc("show symbols")
                        elif cmd_type == "ping":
                            success, output = execute_ping(target)
                        elif cmd_type == "traceroute":
                            success, output = execute_traceroute(target)
                        else:
                            success = False
                            output = f"未知指令: {cmd_type}"

                        client.send_text(json.dumps({
                            "type": "lg_response",
                            "id": req_id,
                            "success": success,
                            "output": output,
                            "durationMs": int((time.time() - t_start) * 1000),
                        }))

                except Exception as e:
                    print(f"⚠️ 处理指令异常: {e}")

        except Exception as e:
            print(f"⚠️ 连接中断或失败 ({e})，3 秒后自动重连...")
            if client:
                client.close()
            time.sleep(3)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AkiLab DN42 Agent")
    parser.add_argument("--master", "-m", default=os.environ.get("MASTER_URL", "http://127.0.0.1:4242"), help="Master Panel URL")
    parser.add_argument("--node-id", "-n", default=os.environ.get("NODE_ID", "jp07"), help="Node ID")
    parser.add_argument("--token", "-t", default=os.environ.get("TOKEN", ""), help="Probe Secret Token")

    args = parser.parse_args()
    if not args.token:
        print("❌ 错误: 缺少 --token 认证密钥。")
        sys.exit(1)

    run_agent(args.master, args.node_id, args.token)
