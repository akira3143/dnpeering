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
UNINSTALL_PROBE=false
PURGE_DATA=false

# 解析命令行参数 (支持静默一键彻底清理)
while [[ $# -gt 0 ]]; do
    case "$1" in
        --all)
            UNINSTALL_PORTAL=true
            UNINSTALL_PROBE=true
            PURGE_DATA=true
            shift
            ;;
        --portal)
            UNINSTALL_PORTAL=true
            shift
            ;;
        --probe)
            UNINSTALL_PROBE=true
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
if [ "$UNINSTALL_PORTAL" = false ] && [ "$UNINSTALL_PROBE" = false ]; then
    # 自动检测当前服务器安装了什么
    HAS_PORTAL=false
    HAS_PROBE=false

    if [ -f "/etc/systemd/system/dn42-portal.service" ] || [ -d "/opt/dnpeering" ] || [ -d "/opt/dn42-peering-portal" ]; then
        HAS_PORTAL=true
    fi

    if [ -f "/etc/systemd/system/bird-lgproxy.service" ] || [ -f "/usr/local/bin/bird-lgproxy" ]; then
        HAS_PROBE=true
    fi

    echo -e "${CYAN}🔍 系统组件检测结果：${NC}"
    echo -e "  • DN42 主站门户 (Portal):  $([ "$HAS_PORTAL" = true ] && echo -e "${GREEN}已安装${NC}" || echo -e "${YELLOW}未检测到${NC}")"
    echo -e "  • BIRD Looking Glass 探针: $([ "$HAS_PROBE" = true ] && echo -e "${GREEN}已安装${NC}" || echo -e "${YELLOW}未检测到${NC}")"
    echo ""

    if [ "$HAS_PORTAL" = false ] && [ "$HAS_PROBE" = false ]; then
        echo -e "${YELLOW}ℹ️ 系统中未检测到任何 dnpeering 组件，无需清理。${NC}"
        exit 0
    fi

    echo -e "请选择需要卸载的目标："
    echo -e "  ${YELLOW}[1]${NC} 仅卸载主站门户 (Portal)"
    echo -e "  ${YELLOW}[2]${NC} 仅卸载 Looking Glass 探针 (bird-lgproxy)"
    echo -e "  ${YELLOW}[3]${NC} 全部彻底卸载清理 (推荐)"
    echo -e "  ${YELLOW}[0]${NC} 取消并退出"
    read -rp "请选择 [默认 3]: " CHOICE
    CHOICE=${CHOICE:-3}

    case "$CHOICE" in
        1)
            UNINSTALL_PORTAL=true
            ;;
        2)
            UNINSTALL_PROBE=true
            ;;
        3)
            UNINSTALL_PORTAL=true
            UNINSTALL_PROBE=true
            ;;
        *)
            echo -e "${CYAN}操作已取消。${NC}"
            exit 0
            ;;
    esac

    echo ""
    read -rp "是否彻底删除数据与配置文件 (.env / portal.config.yaml)? (y/N): " PURGE_CONF
    if [[ "$PURGE_CONF" =~ ^[Yy]$ ]]; then
        PURGE_DATA=true
    fi
fi

echo ""
echo -e "${YELLOW}⚙️ 开始执行清理流程...${NC}"

# ==============================================================================
# 1. 清理主站门户 (Portal)
# ==============================================================================
if [ "$UNINSTALL_PORTAL" = true ]; then
    echo -e "${CYAN}🗑️ [1/2] 正在卸载 DN42 主站门户...${NC}"
    
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
                # 备份配置文件到 /root/dnpeering_backup_$(date +%s)
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
# 2. 清理 Looking Glass 探针 (bird-lgproxy)
# ==============================================================================
if [ "$UNINSTALL_PROBE" = true ]; then
    echo -e "${CYAN}🗑️ [2/2] 正在卸载 bird-lgproxy 探针...${NC}"

    # 停止并注销 systemd 服务
    if [ -f "/etc/systemd/system/bird-lgproxy.service" ]; then
        echo "  • 停止并注销 bird-lgproxy.service..."
        systemctl stop bird-lgproxy >/dev/null 2>&1 || true
        systemctl disable bird-lgproxy >/dev/null 2>&1 || true
        rm -f /etc/systemd/system/bird-lgproxy.service
    fi

    # 删除二进制文件与环境变量配置
    echo "  • 删除 /usr/local/bin/bird-lgproxy 二进制文件..."
    rm -f /usr/local/bin/bird-lgproxy
    rm -f /etc/bird-lgproxy.env

    echo -e "${GREEN}✓ Looking Glass 探针清理完毕！${NC}"
fi

# 重载 systemd
systemctl daemon-reload >/dev/null 2>&1

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 干净卸载完成！系统环境已恢复纯净无残留。${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
