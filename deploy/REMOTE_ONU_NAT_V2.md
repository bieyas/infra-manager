# Remote ONU NAT v2

v2 keeps temporary per-session DNAT, SNAT, and forwarding rules in the server's
dedicated `infra_manager_remote` nftables table. It does not store or request a
root password. The backend calls a root-owned helper with `sudo -n`.

## Install the helper

From the repository root, install the script on the server:

```sh
sudo install -o root -g root -m 0750 \
  backend/scripts/remote-onu-nat-helper.sh \
  /usr/local/sbin/infra-manager-onu-nat
```

Create `/etc/sudoers.d/infra-manager-remote-onu` using `visudo` and replace
`basuki` with the account that runs the backend:

```sudoers
basuki ALL=(root) NOPASSWD: /usr/local/sbin/infra-manager-onu-nat
```

Validate the file and permissions:

```sh
sudo chmod 0440 /etc/sudoers.d/infra-manager-remote-onu
sudo visudo -cf /etc/sudoers.d/infra-manager-remote-onu
```

The helper accepts only `check`, `reset`, `add`, and `remove`; all session
arguments are validated before nftables is changed. Do not make the helper
writable by the backend account.

## Network requirements

- Install `nftables` and `iproute2`; enable IPv4 forwarding persistently.
- Select the server interface receiving the Mikrotik-forwarded session ports.
- The Mikrotik must forward the configured `REMOTE_PROXY_MIN_PORT` through
  `REMOTE_PROXY_MAX_PORT` range to this server without source NAT if you want
  the browser source allowlist to identify the actual client IP.
- Ensure the server/network firewall permits the forwarded ONU traffic. The
  helper adds scoped forwarding accepts, but another firewall chain with a
  later drop policy can still block packets.
- Set a narrow source CIDR in Settings. If Mikrotik source-NATs incoming
  clients, the server will only see the Mikrotik address for all clients.

The helper's `reset` operation removes only its dedicated nftables table at
backend startup, clearing stale rules left by expired processes. Active v2
sessions are temporary and do not survive a backend restart.

After installation, update the Prisma schema and restart the backend. In
Settings > NAT Remote, select v2, enter the ingress interface and source CIDR,
then save. The application must not be given the root password.