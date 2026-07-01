// src/lib/snmp.ts
import snmp from 'net-snmp'

const HOST = process.env.SNMP_HOST!
const COMMUNITY = process.env.SNMP_COMMUNITY!

// Synology SNMP OIDs
export const OIDs = {
  // CPU
  cpuUser:         '1.3.6.1.4.1.2021.11.9.0',         // ssCpuUser
  cpuSystem:       '1.3.6.1.4.1.2021.11.10.0',        // ssCpuSystem
  cpuIdle:         '1.3.6.1.4.1.2021.11.11.0',        // ssCpuIdle

  // Memory (KB)
  memTotal:        '1.3.6.1.4.1.2021.4.5.0',          // memTotalReal
  memAvailable:    '1.3.6.1.4.1.2021.4.6.0',          // memAvailReal
  memBuffer:       '1.3.6.1.4.1.2021.4.14.0',         // memBuffer
  memCached:       '1.3.6.1.4.1.2021.4.15.0',         // memCached

  // Uptime (hundredths of a second)
  uptime:          '1.3.6.1.2.1.1.3.0',               // sysUpTimeInstance

  // System info
  hostname:        '1.3.6.1.2.1.1.5.0',               // sysName

  // Network (bytes) — walk per-interface
  netIfName:       '1.3.6.1.2.1.31.1.1.1.1',          // ifName
  netInBytes:      '1.3.6.1.2.1.31.1.1.1.6',          // ifHCInOctets
  netOutBytes:     '1.3.6.1.2.1.31.1.1.1.10',         // ifHCOutOctets
  netSpeedMbps:    '1.3.6.1.2.1.31.1.1.1.15',         // ifHighSpeed

  // Disk/volume info — walk dynamically
  volumeName:      '1.3.6.1.2.1.25.2.3.1.3',          // hrStorageDescr
  volumeAllocUnit: '1.3.6.1.2.1.25.2.3.1.4',          // hrStorageAllocationUnits
  volumeTotal:     '1.3.6.1.2.1.25.2.3.1.5',          // hrStorageSize
  volumeUsed:      '1.3.6.1.2.1.25.2.3.1.6',          // hrStorageUsed

  // Synology-specific containers
  synoSystem:      '1.3.6.1.4.1.6574.1',              // synoSystem
  synoDisk:        '1.3.6.1.4.1.6574.2',              // synoDisk
  synoRaid:        '1.3.6.1.4.1.6574.3',              // synoRaid
  synoUPS:         '1.3.6.1.4.1.6574.4',              // synoUPS
}

function createSession() {
  return snmp.createSession(HOST, COMMUNITY, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
  })
}

function normalizeValue(value: unknown, type?: number): number | string {
  if (value instanceof Buffer) {
    // Counter64 is returned as an 8-byte big-endian Buffer — read it as a number
    if (type === snmp.ObjectType.Counter64) {
      let n = 0
      for (let i = 0; i < value.length; i++) {
        n = n * 256 + value[i]
      }
      return Number.isFinite(n) ? n : 0
    }
    return value.toString()
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }

  if (typeof value === 'bigint') return value.toString()

  if (Array.isArray(value)) return value.join('.')

  const n = Number(value)
  return Number.isFinite(n) ? n : String(value)
}

export async function snmpGet(oids: string[]): Promise<Record<string, number | string>> {
  return new Promise((resolve, reject) => {
    const session = createSession()

    session.get(oids, (err: Error | null, varbinds?: any[]) => {
      session.close()
      if (err) return reject(err)

      const result: Record<string, number | string> = {}

      for (const vb of varbinds ?? []) {
        if (snmp.isVarbindError(vb)) {
          result[vb.oid] = 0
        } else {
          result[vb.oid] = normalizeValue(vb.value, vb.type)
        }
      }

      resolve(result)
    })
  })
}

export async function snmpWalk(oid: string): Promise<{ oid: string; value: number | string }[]> {
  return new Promise((resolve, reject) => {
    const session = createSession()
    const results: { oid: string; value: number | string }[] = []

    session.subtree(
      oid,
      20,
      (varbinds?: any[]) => {
        for (const vb of varbinds ?? []) {
          if (!snmp.isVarbindError(vb)) {
            results.push({
              oid: vb.oid,
              value: normalizeValue(vb.value, vb.type),
            })
          }
        }
      },
      (err: Error | null) => {
        session.close()
        if (err) return reject(err)
        resolve(results)
      }
    )
  })
}