#!/usr/bin/env python3
"""
zte_onu_monitor.py — ZTE C320 OLT SNMP Monitor (SNMP GET only, no WALK)

Avoids SNMP WALK timeout by computing ZTE 32-bit port indexes directly
and issuing targeted SNMP GET requests for each specific OID.

Usage:
    python3 zte_onu_monitor.py --ip <OLT_IP> --community <COMMUNITY> \
        --slot <SLOT> --port <PON_PORT> --onu <ONU_ID> [--all-onus]

Examples:
    # Single ONU
    python3 zte_onu_monitor.py --ip 192.168.10.2 --community cakmip \
        --slot 1 --port 1 --onu 1

    # All ONUs on a PON port (ONU ID 1..128)
    python3 zte_onu_monitor.py --ip 192.168.10.2 --community cakmip \
        --slot 1 --port 1 --all-onus

    # Output as JSON
    python3 zte_onu_monitor.py --ip 192.168.10.2 --community cakmip \
        --slot 1 --port 1 --onu 5 --json
"""

import argparse
import json
import sys
import asyncio
try:
    # pysnmp >= 7.x
    from pysnmp.hlapi.asyncio import *
except ImportError:
    # pysnmp < 6.x
    from pysnmp.hlapi import *


# ── ZTE C320 private MIB OID bases ──────────────────────────────────────────
#
# All OIDs are under ZTE enterprise: 1.3.6.1.4.1.3902
# The final suffix is always {port_index}.{onu_id}
#
OID_ONU_NAME     = '1.3.6.1.4.1.3902.1012.3.28.1.1.3'    # ONU description/name
OID_ONU_STATUS   = '1.3.6.1.4.1.3902.1012.3.28.2.1.4'    # ONU phase state (integer)
OID_ONU_RXPOWER  = '1.3.6.1.4.1.3902.1082.500.10.2.1.1.3' # OLT-side Rx from ONU (C320 V2.1+, 0.01 dBm)
OID_ONU_RXPOWER2 = '1.3.6.1.4.1.3902.1012.3.50.11.1.1.2'  # Rx power fallback (older firmware)

# ONU phase state decode table (ZTE C320)
ONU_STATE = {
    1: 'initial',
    2: 'standby',
    3: 'working',
    4: 'dying-gasp',
    5: 'auth-fail',
    6: 'offline',
}


# ── ZTE 32-bit index formula ─────────────────────────────────────────────────

def zte_port_index(slot: int, port: int) -> int:
    """
    Calculate the ZTE 32-bit internal port index.

    Formula (ZTE C320/C300):
        Port_Index = 268500992 + (Slot * 256) + Port

    This maps the physical slot/port to a single integer used as the
    SNMP OID prefix. The full ONU OID suffix is: {Port_Index}.{ONU_ID}

    Examples:
        slot=1, port=1  → 268501249  → OID suffix: 268501249.{onu_id}
        slot=1, port=2  → 268501250
        slot=2, port=1  → 268501505
    """
    return 268500992 + (slot * 256) + port


def zte_onu_oid_suffix(slot: int, port: int, onu_id: int) -> str:
    """Return the full OID suffix: '{port_index}.{onu_id}'"""
    return f'{zte_port_index(slot, port)}.{onu_id}'


# ── SNMP GET (synchronous wrapper) ───────────────────────────────────────────

# Reuse a single event loop for all SNMP requests to avoid asyncio cleanup warnings
_loop = asyncio.new_event_loop()


async def snmp_get_async(ip: str, community: str, oid: str,
                         timeout: int = 15, retries: int = 3):
    """
    Perform a single SNMP GET request for one OID.
    Returns the raw value or None on error.
    """
    snmp_engine = SnmpEngine()
    errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
        snmp_engine,
        CommunityData(community, mpModel=1),   # mpModel=1 → SNMPv2c
        await UdpTransportTarget.create(
            (ip, 161),
            timeout=timeout,
            retries=retries,
        ),
        ContextData(),
        ObjectType(ObjectIdentity(oid)),
    )

    if errorIndication:
        return None, str(errorIndication)
    if errorStatus:
        return None, f'{errorStatus.prettyPrint()} at {errorIndex}'

    for varBind in varBinds:
        return varBind[1], None   # (value, error)

    return None, 'No varbinds returned'


def snmp_get(ip, community, oid, timeout=15, retries=3):
    """Synchronous SNMP GET wrapper using shared event loop."""
    return _loop.run_until_complete(
        snmp_get_async(ip, community, oid, timeout, retries)
    )


# ── ONU data fetcher ─────────────────────────────────────────────────────────

def fetch_onu(ip: str, community: str, slot: int, port: int, onu_id: int,
              timeout: int = 15, retries: int = 3) -> dict:
    """
    Fetch ONU status via 3 targeted SNMP GET requests.
    Returns a dict with all parsed fields.
    """
    suffix = zte_onu_oid_suffix(slot, port, onu_id)
    port_index = zte_port_index(slot, port)

    result = {
        'slot':        slot,
        'port':        port,
        'onu_id':      onu_id,
        'onu_index':   f'{port_index}.{onu_id}',
        'port_index':  port_index,
        'name':        None,
        'status':      None,
        'status_raw':  None,
        'rx_power_dbm': None,
        'online':      False,
        'errors':      [],
    }

    # 1. ONU Name/Description
    val, err = snmp_get(ip, community, f'{OID_ONU_NAME}.{suffix}', timeout, retries)
    if err:
        result['errors'].append(f'name: {err}')
    else:
        result['name'] = str(val).strip() if val is not None else None

    # 2. ONU Phase Status
    val, err = snmp_get(ip, community, f'{OID_ONU_STATUS}.{suffix}', timeout, retries)
    if err:
        result['errors'].append(f'status: {err}')
    else:
        try:
            raw = int(val)
            result['status_raw'] = raw
            result['status']     = ONU_STATE.get(raw, f'unknown({raw})')
            result['online']     = raw == 3   # 3 = working
        except (TypeError, ValueError):
            result['status'] = str(val)

    # 3. ONU Rx Power (OLT-side received power from ONU)
    #    ZTE encodes Rx power in 0.01 dBm units (signed integer).
    #    Example: value=-2856 → -28.56 dBm
    #    Try primary OID (C320 V2.1+), fallback to older firmware OID.
    rx_val = None
    for rx_oid in [OID_ONU_RXPOWER, OID_ONU_RXPOWER2]:
        val, err = snmp_get(ip, community, f'{rx_oid}.{suffix}', timeout, retries)
        if not err and val is not None:
            try:
                raw = int(val)
                if raw != 0:
                    rx_val = round(raw / 100, 2)
                    break
            except (TypeError, ValueError):
                pass
    result['rx_power_dbm'] = rx_val

    return result


# ── Output formatter ─────────────────────────────────────────────────────────

def print_cli(onu: dict):
    """Print ONU info in human-readable CLI format."""
    status_icon = '✓' if onu['online'] else '✗'
    print(f"\n  ONU  : gpon-onu_{onu['slot']}/{onu['port']}:{onu['onu_id']}")
    print(f"  Index: {onu['onu_index']}  (port_index={onu['port_index']})")
    print(f"  Name : {onu['name'] or '(none)'}")
    print(f"  State: {status_icon} {onu['status'] or 'unknown'}")
    if onu['rx_power_dbm'] is not None:
        print(f"  RxPwr: {onu['rx_power_dbm']} dBm")
    else:
        print(f"  RxPwr: N/A")
    if onu['errors']:
        for e in onu['errors']:
            print(f"  [WARN] {e}")


def print_summary(onus: list):
    """Print a summary table for multiple ONUs."""
    online  = [o for o in onus if o['online']]
    offline = [o for o in onus if not o['online'] and o['status_raw'] is not None]
    nodata  = [o for o in onus if o['status_raw'] is None]

    print(f"\n{'='*60}")
    print(f"  Total: {len(onus)}  Online: {len(online)}  Offline: {len(offline)}  No-data: {len(nodata)}")
    print(f"{'='*60}")
    print(f"  {'ONU':<8} {'Name':<20} {'Status':<14} {'Rx Power':<12}")
    print(f"  {'-'*8} {'-'*20} {'-'*14} {'-'*12}")
    for o in onus:
        if o['status_raw'] is None:
            continue
        icon = '●' if o['online'] else '○'
        pwr  = f"{o['rx_power_dbm']} dBm" if o['rx_power_dbm'] is not None else 'N/A'
        print(f"  {icon} {o['onu_id']:<6}  {str(o['name'] or ''):<20} {str(o['status']):<14} {pwr}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='ZTE C320 OLT SNMP Monitor — GET-only, no WALK'
    )
    parser.add_argument('--ip',        required=True,  help='OLT management IP')
    parser.add_argument('--community', required=True,  help='SNMP community string')
    parser.add_argument('--slot',      required=True,  type=int, help='Slot number (e.g. 1)')
    parser.add_argument('--port',      required=True,  type=int, help='PON port number (e.g. 1)')
    parser.add_argument('--onu',       type=int,       default=None, help='Single ONU ID')
    parser.add_argument('--all-onus',  action='store_true', help='Query all ONUs 1..128 on the PON port')
    parser.add_argument('--max-onu',   type=int,       default=128, help='Max ONU ID when --all-onus (default 128)')
    parser.add_argument('--json',      action='store_true', help='Output as JSON')
    parser.add_argument('--timeout',   type=int,       default=15, help='SNMP timeout seconds (default 15)')
    parser.add_argument('--retries',   type=int,       default=3,  help='SNMP retries (default 3)')

    args = parser.parse_args()

    if args.onu is None and not args.all_onus:
        parser.error('Specify --onu <ID> or --all-onus')

    port_index = zte_port_index(args.slot, args.port)

    print(f"ZTE C320 SNMP Monitor")
    print(f"  OLT      : {args.ip}:161")
    print(f"  Community: {args.community}")
    print(f"  PON Port : gpon-olt_{args.slot}/{args.port}")
    print(f"  PortIndex: {port_index}  (slot={args.slot} port={args.port})")

    if args.all_onus:
        # Scan all ONU IDs; skip those with no data (ONU not registered)
        print(f"\nScanning ONU IDs 1..{args.max_onu} (this may take a while)...")
        onus = []
        for onu_id in range(1, args.max_onu + 1):
            sys.stdout.write(f"\r  Querying ONU {onu_id}/{args.max_onu}...  ")
            sys.stdout.flush()
            onu = fetch_onu(
                args.ip, args.community,
                args.slot, args.port, onu_id,
                args.timeout, args.retries
            )
            # Only include ONUs that returned actual data
            if onu['status_raw'] is not None:
                onus.append(onu)

        sys.stdout.write('\r' + ' '*40 + '\r')

        if args.json:
            print(json.dumps(onus, indent=2))
        else:
            print_summary(onus)
    else:
        onu = fetch_onu(
            args.ip, args.community,
            args.slot, args.port, args.onu,
            args.timeout, args.retries
        )
        if args.json:
            print(json.dumps(onu, indent=2))
        else:
            print_cli(onu)


if __name__ == '__main__':
    main()
