import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import ssh2 from 'ssh2'
import { resolveDriverClass } from '../src/drivers/registry.js'
import { VsolHttpDriver } from '../src/drivers/olt/VsolHttp.js'
import { VsolSshDriver } from '../src/drivers/olt/VsolSsh.js'

const { Server: SshServer } = ssh2

test('selects the VSOL interactive SSH driver for an OLT configured for SSH', () => {
  assert.equal(resolveDriverClass({
    vendor: 'VSOL',
    model: 'V1601E04-DP',
    type: 'OLT',
    mgmtProtocol: 'SSH',
  }), VsolSshDriver)
})

test('keeps the VSOL web driver for an OLT configured for WEB', () => {
  assert.equal(resolveDriverClass({
    vendor: 'VSOL',
    model: 'V1601E04-DP',
    type: 'OLT',
    mgmtProtocol: 'WEB',
  }), VsolHttpDriver)
})

test('uses plain HTTP for the WEB protocol even when HTTPS ports are hinted', () => {
  const driver = new VsolHttpDriver({
    ip: '10.0.0.1',
    mgmtProtocol: 'WEB',
    mgmtPort: 443,
  })
  assert.equal(driver._baseUrl, 'http://10.0.0.1:443')
})

test('infers HTTPS from a secure web port only when no protocol is configured', () => {
  const driver = new VsolHttpDriver({
    ip: '10.0.0.1',
    mgmtPort: 8443,
  })
  assert.equal(driver._baseUrl, 'https://10.0.0.1:8443')
})

test('parses VSOL CLI object statistics without treating them as resource metrics', async () => {
  const driver = new VsolSshDriver({ model: 'V1601E04-DP' })
  driver.connected = true
  driver.prompt = 'OLT-JGRT-VSOL#'
  driver._runReadOnly = async command => {
    assert.equal(command, 'show memory')
    return 'Temporary memory : -555\nString vector : 54028'
  }

  assert.deepEqual(await driver.getStatus(), {
    sysName: 'OLT-JGRT-VSOL',
    platform: 'V1601E04-DP',
    protocol: 'ssh-cli',
    memoryStats: {
      'Temporary memory': -555,
      'String vector': 54028,
    },
  })
})

test('parses live Gigabit port status and traffic from verified read-only CLI output', async () => {
  const driver = new VsolSshDriver({ model: 'V1601E04-DP' })
  driver.connected = true
  driver._runReadOnly = async command => {
    if (command === 'show interface vlan') {
      return [
        'VLAN ID : 1',
        'Untagged Ports : ge0/1 epon0/1',
        'VLAN ID : 100',
        'Tagged Ports : ge0/1 ge0/8',
      ].join('\n')
    }
    if (command === 'show interface gigabitethernet 0/1' || command === 'show interface gigabitethernet 0/8') {
      return [
        'gigabitEthernet 0/1 current state : Up',
        'The Maximum Transmit Unit is 1500',
        'Current link speed: 1000Mbps, Current link mode: full-duplex',
        'PVID: 1',
        'Port link-type: hybrid',
        'Untagged VLAN ID: 1',
        'Tagged VLAN ID : 13 100',
        'Last 60 seconds input: 1,234 packets/sec 5,304,325 bytes/sec',
        'Last 60 seconds output: 5,678 packets/sec 27,095,447 bytes/sec',
        'Input: 0 input errors, 0 runts',
        'Output: 2 output errors, 0 underruns',
      ].join('\n')
    }
    throw new Error(`Unexpected command: ${command}`)
  }

  const interfaces = await driver.getEthernetInterfaces()
  assert.deepEqual(interfaces.map(iface => iface.name), ['ge0/1', 'ge0/8'])
  assert.deepEqual(interfaces[0], {
    id: 'ge0/1',
    name: 'ge0/1',
    type: 'Gigabit Ethernet',
    running: true,
    speedMbps: 1000,
    duplex: 'full-duplex',
    mtu: 1500,
    pvid: 1,
    linkType: 'hybrid',
    taggedVlans: [13, 100],
    untaggedVlans: [1],
    input: { bytesPerSecond: 5304325, packetsPerSecond: 1234 },
    output: { bytesPerSecond: 27095447, packetsPerSecond: 5678 },
    inputErrors: 0,
    outputErrors: 2,
  })
})

test('does not advertise unsupported SSH resource collection or arbitrary commands', () => {
  assert.equal(VsolSshDriver.capabilities.resource, false)
  assert.equal(VsolSshDriver.capabilities.exec, false)
  assert.equal(VsolSshDriver.capabilities.ethernetInterfaces, true)
  assert.equal(VsolSshDriver.capabilities.ponPorts, false)
  assert.equal(VsolSshDriver.capabilities.ponPower, false)
  assert.equal(VsolSshDriver.capabilities.onuList, false)
  assert.equal(VsolSshDriver.capabilities.onuDetail, false)
})

test('parses VSOL web ONU rows even when the web UI emits plain 0/1:1 IDs', async () => {
  const driver = new VsolHttpDriver({
    ip: '10.0.0.1',
    mgmtPort: 8081,
    model: 'V1601E04-DP',
  })

  driver._get = async path => {
    if (path === '/action/onustatusinfo.html?select=1') {
      return [
        '<table><tr><td>0/1:1</td><td>Online</td><td>AA:BB:CC:DD:EE:01</td><td>Customer-1</td><td>5</td><td>12ms</td><td>2024-01-01</td><td>ok</td><td>0</td><td>00:05:12</td></tr></table>',
      ].join('')
    }
    if (path === '/action/onuopmdiag.html?select=1') {
      return [
        '<table><tr><td>0/1:1</td><td>AA:BB:CC:DD:EE:01</td><td>Customer-1</td><td>5</td><td>31.4</td><td>3.3</td><td>35</td><td>-2.4</td><td>-4.7</td></tr></table>',
      ].join('')
    }
    return '<html></html>'
  }

  assert.deepEqual(await driver.getOnuList('0/1'), [{
    index: '0/1:1',
    port: '0/1',
    onuId: 1,
    status: 'online',
    phaseState: 'online',
    online: true,
    sn: null,
    mac: 'AA:BB:CC:DD:EE:01',
    name: 'Customer-1',
    distance: 5,
    rtt: '12ms',
    lastSeen: '2024-01-01',
    aliveTime: '00:05:12',
    lastDeregReason: '0',
    protocol: 'http',
  }])

  assert.deepEqual(await driver.getOnuDetail('0/1:1'), {
    index: '0/1:1',
    port: '0/1',
    onuId: 1,
    status: 'online',
    phaseState: 'online',
    online: true,
    sn: null,
    mac: 'AA:BB:CC:DD:EE:01',
    name: 'Customer-1',
    distance: 5,
    rtt: '12ms',
    lastSeen: '2024-01-01',
    aliveTime: '00:05:12',
    lastDeregReason: '0',
    protocol: 'http',
    onlineDuration: '00:05:12',
    temperature: 31.4,
    voltage: 3.3,
    oltRxPower: -4.7,
    onuTxPower: -2.4,
  })
})

test('preserves blank OPM description cells so ONU TX and RX powers stay in the right columns', async () => {
  const driver = new VsolHttpDriver({ ip: '10.0.0.1', mgmtPort: 80 })
  driver._get = async path => {
    assert.equal(path, '/action/onuopmdiag.html?select=1')
    return '<table><tr><td>EPON0/1:1</td><td>B4:E4:6B:70:CE:13</td><td></td><td>192</td><td>48.65</td><td>3.30</td><td>9.65</td><td>2.49</td><td>-22.15</td></tr></table>'
  }

  assert.deepEqual(await driver.getOnuPower('0/1:1'), {
    onuIndex: '0/1:1',
    oltRxPower: -22.15,
    onuRxPower: -22.15,
    onuTxPower: 2.49,
    oltTxPower: null,
    temperature: 48.65,
    voltage: 3.3,
    biasCurrent: 9.65,
    distance: 192,
    protocol: 'http',
  })
})

test('reads VSOL PON status pages sequentially', async () => {
  const driver = new VsolHttpDriver({ ponCount: 3 })
  const requestedPorts = []
  let activeRequests = 0
  let maxActiveRequests = 0

  driver._get = async path => {
    const ponIdx = Number(path.match(/select=(\d+)/)?.[1])
    requestedPorts.push(ponIdx)
    activeRequests++
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
    await new Promise(resolve => setTimeout(resolve, 5))
    activeRequests--
    return `<table><tr><td>EPON0/${ponIdx}:1</td><td>Online</td></tr></table>`
  }

  const result = await driver.getPonPorts()

  assert.deepEqual(requestedPorts, [1, 2, 3])
  assert.equal(maxActiveRequests, 1)
  assert.deepEqual(result.ports.map(port => port.port), ['0/1', '0/2', '0/3'])
  assert.equal(result.globalOnline, 3)
  assert.equal(result.globalTotal, 3)
})

test('opens an interactive SSH shell and advances the verified memory output pager', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const server = new SshServer({ hostKeys: [privateKey] })

  server.on('connection', client => {
    client.on('authentication', context => {
      if (context.username === 'olt-user' && context.method === 'password' && context.password === 'test-pass') {
        context.accept()
      } else {
        context.reject()
      }
    })
    client.on('ready', () => {
      client.on('session', accept => {
        const session = accept()
        session.on('pty', (_accept, _reject, _info) => _accept())
        session.on('shell', acceptShell => {
          const channel = acceptShell()
          channel.write('OLT-JGRT-VSOL>\r\n')
          let pending = ''
          let waitingForPager = false
          channel.on('data', chunk => {
            if (waitingForPager && chunk.toString().includes(' ')) {
              waitingForPager = false
              channel.write('String vector : 54028\r\nOLT-JGRT-VSOL>\r\n')
              return
            }
            pending += chunk.toString()
            const newline = pending.indexOf('\n')
            if (newline < 0) return
            const command = pending.slice(0, newline).trim()
            pending = pending.slice(newline + 1)
            if (command === 'show memory') {
              waitingForPager = true
              channel.write('show memory\r\nTemporary memory : -555\r\n --More--')
            } else {
              channel.write(`% Unknown command: ${command}\r\nOLT-JGRT-VSOL>\r\n`)
            }
          })
        })
      })
    })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const driver = new VsolSshDriver({
    ip: '127.0.0.1',
    mgmtPort: port,
    mgmtUsername: 'olt-user',
    model: 'V1601E04-DP',
  }, { password: 'test-pass' })

  try {
    await driver.connect()
    assert.equal(driver.connected, true)
    assert.deepEqual(await driver.getStatus(), {
      sysName: 'OLT-JGRT-VSOL',
      platform: 'V1601E04-DP',
      protocol: 'ssh-cli',
      memoryStats: {
        'Temporary memory': -555,
        'String vector': 54028,
      },
    })
  } finally {
    await driver.disconnect()
    await new Promise(resolve => server.close(resolve))
  }
})
