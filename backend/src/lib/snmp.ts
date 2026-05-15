// src/lib/snmp.ts
import snmp from 'net-snmp'

const HOST = process.env.SNMP_HOST!
const COMMUNITY = process.env.SNMP_COMMUNITY!

// Synology SNMP OIDs
export const OIDs = {
  // CPU
  cpuUser:        '1.3.6.1.4.1.6574.1.4.1.0',
  cpuSystem:      '1.3.6.1.4.1.6574.1.4.2.0',
  cpuIdle:        '1.3.6.1.4.1.6574.1.4.3.0',

  // Memory (KB)
  memTotal:       '1.3.6.1.4.1.6574.1.1.0',
  memAvailable:   '1.3.6.1.4.1.6574.1.2.0',

  // Uptime (hundredths of a second)
  uptime:         '1.3.6.1.2.1.1.3.0',

  // System info
  hostname:       '1.3.6.1.2.1.1.5.0',
  dsm_version:    '1.3.6.1.4.1.6574.1.5.3.0',

  // Network (bytes) — walk ifTable for per-interface
  netInBytes:     '1.3.6.1.2.1.2.2.1.10',
  netOutBytes:    '1.3.6.1.2.1.2.2.1.16',

  // Disk/volume info — walked dynamically
  volumeTotal:    '1.3.6.1.4.1.6574.2.1.1.4',
  volumeUsed:     '1.3.6.1.4.1.6574.2.1.1.6',
}

function createSession() {
  return snmp.createSession(HOST, COMMUNITY, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
  })
}

export async function snmpGet(oids: string[]): Promise<Record<string, number | string>> {
    return new Promise((resolve, reject) => {
        const session = createSession()
        session.get(oids, (err: Error | null, varbinds?: any[]) => {
            session.close()
            if (err) return reject(err)

            const result: Record<string, number | string> = {}
            for (const vb of (varbinds ?? [])) {
                if (snmp.isVarbindError(vb)) {
                    result[vb.oid] = 0
                } else {
                    result[vb.oid] = vb.value instanceof Buffer
                        ? vb.value.toString()
                        : Number(vb.value)
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

        session.subtree(oid, 20, (varbinds?: any[]) => {
            for (const vb of (varbinds ?? [])) {
                if (!snmp.isVarbindError(vb)) {
                    results.push({
                        oid: vb.oid,
                        value: vb.value instanceof Buffer ? vb.value.toString() : Number(vb.value),
                    })
                }
            }
        }, (err: Error | null) => {
            session.close()
            if (err) return reject(err)
            resolve(results)
        })
    })
}