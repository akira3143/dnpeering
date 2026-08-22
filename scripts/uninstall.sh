#!/usr/bin/env bash
# ==============================================================================
# 🧹 AkiLab DN42 (dnpeering) - 一键完全干净卸载清理脚本
#
# 支持功能:
# 1. 自动检测本机已安装的组件 (Portal 主站 / bird-lgproxy 探针)
# 2. 停止并注销所有关联 systemd 守护进程与开机自启服务
# 3. 清理全局 CLI 快捷指令 (/usr/local/bin/dnp, /usr/local/bin/portal)
# 4. 清理二进制文件与安装目录 (/opt/dnpeering, /usr/local/bin/bird-lgproxy)
# 5. 可选保留或彻底删除个人配置文件 (.env / portal.config.yaml)
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}"
echo "=================================================================="
echo "   🧹 AkiLab DN42 (dnpeering) 完全干净卸载与清理向导"
echo "=================================================================="
echo -e "${NC}"

# 1. 检查 root 权限
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}❌ 错误: 请使用 root 权限或 sudo 运行此卸载脚本！${NC}"
    exit 1
fi

UNINSTALL_PORTAL=false
UNINSTALL_AGENT=false
UNINSTALL_LGPROXY=false
PURGE_DATA=false

# 解析命令行参数 (支持静默一键彻底清理)
while [[ $# -gt 0 ]]; do
    case "$1" in
        --all)
            UNINSTALL_PORTAL=true
            UNINSTALL_AGENT=true
            UNINSTALL_LGPROXY=true
            PURGE_DATA=true
            shift
            ;;
        --portal)
            UNINSTALL_PORTAL=true
            shift
            ;;
        --probe|--agent)
            UNINSTALL_AGENT=true
            UNINSTALL_LGPROXY=true
            shift
            ;;
        --purge)
            PURGE_DATA=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# 如果未提供静默参数，进入交互式检测与确认向导
if [ "$UNINSTALL_PORTAL" = false ] && [ "$UNINSTALL_AGENT" = false ] && [ "$UNINSTALL_LGPROXY" = false ]; then
    # 自动检测当前服务器安装了什么
    HAS_PORTAL=false
    HAS_AGENT=false
    HAS_LGPROXY=false

    if [ -f "/etc/systemd/system/dn42-portal.service" ] || [ -d "/opt/dnpeering" ] || [ -d "/opt/dn42-peering-portal" ]; then
        HAS_PORTAL=true
    fi

    if [ -f "/etc/systemd/system/dn42-agent.service" ] || [ -d "/opt/dn42-agent" ] || [ -f "/usr/local/bin/dn42-agent" ] || [ -f "/etc/dn42-agent.env" ]; then
        HAS_AGENT=true
    fi

    if [ -f "/etc/systemd/system/bird-lgproxy.service" ] || [ -f "/usr/local/bin/bird-lgproxy" ] || [ -f "/etc/bird-lgproxy.env" ]; then
        HAS_LGPROXY=true
    fi

    echo -e "${CYAN}🔍 系统组件检测结果：${NC}"
    echo -e "  • DN42 主站门户 (Portal):      $([ "$HAS_PORTAL" = true ] && echo -e "${GREEN}已安装${NC}" || echo -e "${YELLOW}未检测到${NC}")"
    echo -e "  • 反向探针服务 (dn42-agent):   $([ "$HAS_AGENT" = true ] && echo -e "${GREEN}已安装${NC}" || echo -e "${YELLOW}未检测到${NC}")"
    echo -e "  • BIRD LG 代理 (bird-lgproxy): $([ "$HAS_LGPROXY" = true ] && echo -e "${GREEN}已安装${NC}" || echo -e "${YELLOW}未检测到${NC}")"
    echo ""

    if [ "$HAS_PORTAL" = false ] && [ "$HAS_AGENT" = false ] && [ "$HAS_LGPROXY" = false ]; then
        echo -e "${YELLOW}ℹ️ 系统中未检测到任何 dnpeering 组件或探针，无需清理。${NC}"
        exit 0
    fi

    # 如果仅检测到探针服务（远端节点场景）
    if [ "$HAS_PORTAL" = false ] && { [ "$HAS_AGENT" = true ] || [ "$HAS_LGPROXY" = true ]; }; then
        echo -e "检测到当前服务器为【远端探针节点】，请确认卸载："
        echo -e "  ${YELLOW}[1]${NC} 彻底卸载并清理探针守护进程与文件"
        echo -e "  ${YELLOW}[0]${NC} 取消并退出"
        read -rp "请选择 [默认 1]: " CHOICE
        CHOICE=${CHOICE:-1}
        if [ "$CHOICE" = "1" ]; then
            UNINSTALL_AGENT=true
            UNINSTALL_LGPROXY=true
        else
            echo -e "${CYAN}操作已取消。${NC}"
            exit 0
        fi
    else
        echo -e "请选择需要卸载的目标："
        echo -e "  ${YELLOW}[1]${NC} 仅卸载主站门户 (Portal)"
        echo -e "  ${YELLOW}[2]${NC} 仅卸载探针服务 (dn42-agent & bird-lgproxy)"
        echo -e "  ${YELLOW}[3]${NC} 全部彻底卸载清理 (推荐)"
        echo -e "  ${YELLOW}[0]${NC} 取消并退出"
        read -rp "请选择 [默认 3]: " CHOICE
        CHOICE=${CHOICE:-3}

        case "$CHOICE" in
            1)
                UNINSTALL_PORTAL=true
                ;;
            2)
                UNINSTALL_AGENT=true
                UNINSTALL_LGPROXY=true
                ;;
            3)
                UNINSTALL_PORTAL=true
                UNINSTALL_AGENT=true
                UNINSTALL_LGPROXY=true
                ;;
            *)
                echo -e "${CYAN}操作已取消。${NC}"
                exit 0
                ;;
        esac

        if [ "$UNINSTALL_PORTAL" = true ]; then
            echo ""
            read -rp "是否彻底删除主站数据与配置文件 (.env / portal.config.yaml)? (y/N): " PURGE_CONF
            if [[ "$PURGE_CONF" =~ ^[Yy]$ ]]; then
                PURGE_DATA=true
            fi
        fi
    fi
fi

echo ""
echo -e "${YELLOW}⚙️ 开始执行清理流程...${NC}"

# ==============================================================================
# 1. 清理主站门户 (Portal)
# ==============================================================================
if [ "$UNINSTALL_PORTAL" = true ]; then
    echo -e "${CYAN}🗑️ 正在卸载 DN42 主站门户...${NC}"
    
    # 停止并注销 systemd 服务
    if [ -f "/etc/systemd/system/dn42-portal.service" ]; then
        echo "  • 停止并注销 dn42-portal.service..."
        systemctl stop dn42-portal >/dev/null 2>&1 || true
        systemctl disable dn42-portal >/dev/null 2>&1 || true
        rm -f /etc/systemd/system/dn42-portal.service
    fi

    # 清理全局 CLI 快捷方式
    echo "  • 清理 /usr/local/bin/dnp 与 portal 命令..."
    rm -f /usr/local/bin/dnp
    rm -f /usr/local/bin/portal

    # 处理项目目录与配置文件
    for DIR in "/opt/dnpeering" "/opt/dn42-peering-portal"; do
        if [ -d "$DIR" ]; then
            if [ "$PURGE_DATA" = true ]; then
                echo "  • 彻底删除安装目录: ${DIR}..."
                rm -rf "$DIR"
            else
                echo "  • 保留配置文件，删除编译包与缓存..."
                BACKUP_DIR="/root/dnpeering_backup_$(date +%Y%m%d_%H%M%S)"
                mkdir -p "$BACKUP_DIR"
                [ -f "$DIR/portal.config.yaml" ] && cp "$DIR/portal.config.yaml" "$BACKUP_DIR/"
                [ -f "$DIR/.env" ] && cp "$DIR/.env" "$BACKUP_DIR/"
                echo -e "  ${GREEN}✓ 配置文件已安全备份至: ${BACKUP_DIR}${NC}"
                rm -rf "$DIR"
            fi
        fi
    done

    echo -e "${GREEN}✓ 主站门户清理完毕！${NC}"
fi

# ==============================================================================
# 2. 清理反向 WebSocket 探针 (dn42-agent)
# ==============================================================================
if [ "$UNINSTALL_AGENT" = true ]; then
    echo -e "${CYAN}🗑️ 正在卸载 dn42-agent 探针守护服务...${NC}"

    # 停止并注销 systemd 服务
    if [ -f "/etc/systemd/system/dn42-agent.service" ]; then
        echo "  • 停止并注销 dn42-agent.service..."
        systemctl stop dn42-agent >/dev/null 2>&1 || true
        systemctl disable dn42-agent >/dev/null 2>&1 || true
        rm -f /etc/systemd/system/dn42-agent.service
    fi

    # 删除二进制链接与安装目录
    echo "  • 删除 /opt/dn42-agent 与 /usr/local/bin/dn42-agent..."
    rm -rf /opt/dn42-agent
    rm -f /usr/local/bin/dn42-agent
    rm -f /etc/dn42-agent.env

    echo -e "${GREEN}✓ dn42-agent 探针服务与脚本已彻底清理！${NC}"
fi

# ==============================================================================
# 3. 清理 Looking Glass 探针 (bird-lgproxy) 与端口上报定时器
# ==============================================================================
if [ "$UNINSTALL_LGPROXY" = true ]; then
    echo -e "${CYAN}🗑️ 正在卸载 bird-lgproxy 探针...${NC}"

    # 停止并注销 systemd 服务
    if [ -f "/etc/systemd/system/bird-lgproxy.service" ]; then
        echo "  • 停止并注销 bird-lgproxy.service..."
        systemctl stop bird-lgproxy >/dev/null 2>&1 || true
        systemctl disable bird-lgproxy >/dev/null 2>&1 || true
        rm -f /etc/systemd/system/bird-lgproxy.service
    fi

    # 停止并注销端口同步定时器与服务
    if [ -f "/etc/systemd/system/dn42-probe-sync.timer" ] || [ -f "/etc/systemd/system/dn42-probe-sync.service" ]; then
        echo "  • 停止并注销 dn42-probe-sync 端口上报定时器..."
        systemctl stop dn42-probe-sync.timer >/dev/null 2>&1 || true
        systemctl disable dn42-probe-sync.timer >/dev/null 2>&1 || true
        rm -f /etc/systemd/system/dn42-probe-sync.timer /etc/systemd/system/dn42-probe-sync.service
    fi

    # 删除二进制文件与环境变量配置
    echo "  • 删除 /usr/local/bin/bird-lgproxy 与 dnp-probe-report..."
    rm -f /usr/local/bin/bird-lgproxy /usr/local/bin/dnp-probe-report
    rm -f /etc/bird-lgproxy.env

    echo -e "${GREEN}✓ bird-lgproxy 探针与定时器清理完毕！${NC}"
fi

# 重载 systemd
if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 干净卸载完成！系统环境已恢复纯净，零残留。${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
