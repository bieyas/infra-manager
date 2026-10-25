#!/usr/bin/env bash
set -euo pipefail

TABLE=infra_manager_remote
LOCK=/run/lock/infra-manager-remote-onu.lock

fail() {
  echo "infra-manager-onu-nat: $*" >&2
  exit 1
}

valid_ipv4() {
  local value="$1"
  local -a octets
  [[ "$value" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS=. read -r -a octets <<< "$value"
  for octet in "${octets[@]}"; do
    (( 10#$octet <= 255 )) || return 1
  done
}

valid_cidr() {
  local value="$1"
  local address="${value%%/*}"
  local prefix="${value#*/}"
  valid_ipv4 "$address" || return 1
  [[ "$value" == */* ]] || return 0
  [[ "$prefix" =~ ^[0-9]{1,2}$ ]] && (( prefix <= 32 ))
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

valid_id() {
  [[ "$1" =~ ^[a-f0-9-]{36}$ ]]
}

ensure_table() {
  nft list table ip "$TABLE" >/dev/null 2>&1 || nft add table ip "$TABLE"
}

session_chains() {
  local id="${1//-/}"
  printf 'pre_%s post_%s fwd_%s\n' "$id" "$id" "$id"
}

remove_session() {
  local pre post forward
  read -r pre post forward < <(session_chains "$1")
  nft delete chain ip "$TABLE" "$pre" 2>/dev/null || true
  nft delete chain ip "$TABLE" "$post" 2>/dev/null || true
  nft delete chain ip "$TABLE" "$forward" 2>/dev/null || true
}

case "${1:-}" in
  check)
    [[ $# -eq 1 || $# -eq 2 ]] || exit 2
    command -v nft >/dev/null
    command -v ip >/dev/null
    [[ "$(sysctl -n net.ipv4.ip_forward)" == 1 ]]
    if [[ $# -eq 2 ]]; then
      [[ "$2" =~ ^[a-zA-Z0-9_.:-]{1,15}$ ]]
      ip link show dev "$2" >/dev/null
    fi
    ;;
  reset)
    [[ $# -eq 1 ]] || exit 2
    install -d -m 0755 /run/lock
    exec 9>"$LOCK"
    flock -x 9
    nft delete table ip "$TABLE" 2>/dev/null || true
    ;;
  add)
    [[ $# -eq 7 ]] || exit 2
    id="$2"
    ingress="$3"
    public_port="$4"
    target_ip="$5"
    target_port="$6"
    source_cidr="$7"
    valid_id "$id" || fail 'invalid session id'
    [[ "$ingress" =~ ^[a-zA-Z0-9_.:-]{1,15}$ ]] || fail 'invalid ingress interface name'
    ip link show dev "$ingress" >/dev/null || fail "ingress interface not found: $ingress"
    valid_port "$public_port" || fail 'invalid public port'
    valid_ipv4 "$target_ip" || fail 'invalid ONU IPv4 address'
    valid_port "$target_port" || fail 'invalid ONU port'
    valid_cidr "$source_cidr" || fail 'invalid source CIDR'
    [[ "$(sysctl -n net.ipv4.ip_forward)" == 1 ]] || fail 'IPv4 forwarding is disabled'
    install -d -m 0755 /run/lock
    exec 9>"$LOCK"
    flock -x 9
    ensure_table || fail 'could not create or access nftables table'
    read -r pre post forward < <(session_chains "$id")
    if ! nft add chain ip "$TABLE" "$pre" '{ type nat hook prerouting priority dstnat; policy accept; }'; then
      remove_session "$id"
      fail 'could not create prerouting NAT chain'
    fi
    if ! nft add chain ip "$TABLE" "$post" '{ type nat hook postrouting priority srcnat; policy accept; }'; then
      remove_session "$id"
      fail 'could not create postrouting NAT chain'
    fi
    if ! nft add chain ip "$TABLE" "$forward" '{ type filter hook forward priority filter; policy accept; }'; then
      remove_session "$id"
      fail 'could not create forwarding filter chain'
    fi
    if ! nft add rule ip "$TABLE" "$pre" iifname "$ingress" ip saddr "$source_cidr" tcp dport "$public_port" dnat to "$target_ip:$target_port"; then
      remove_session "$id"
      fail 'could not add the DNAT rule'
    fi
    if ! nft add rule ip "$TABLE" "$post" ip saddr "$source_cidr" ip daddr "$target_ip" tcp dport "$target_port" masquerade; then
      remove_session "$id"
      fail 'could not add the SNAT rule'
    fi
    if ! nft add rule ip "$TABLE" "$forward" iifname "$ingress" ip saddr "$source_cidr" ip daddr "$target_ip" tcp dport "$target_port" accept; then
      remove_session "$id"
      fail 'could not add the incoming forwarding rule'
    fi
    if ! nft add rule ip "$TABLE" "$forward" oifname "$ingress" ip saddr "$target_ip" tcp sport "$target_port" ct state established,related accept; then
      remove_session "$id"
      fail 'could not add the established return forwarding rule'
    fi
    ;;
  remove)
    [[ $# -eq 2 ]] || exit 2
    valid_id "$2"
    install -d -m 0755 /run/lock
    exec 9>"$LOCK"
    flock -x 9
    remove_session "$2"
    ;;
  *)
    echo 'Usage: remote-onu-nat-helper.sh {check|reset|add|remove}' >&2
    exit 2
    ;;
esac