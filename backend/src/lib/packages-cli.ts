
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SYNOPKG = '/usr/syno/bin/synopkg'

function assertPkgId(id: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('Invalid package id')
  }
}

export async function getPackageStatus(id: string) {
  assertPkgId(id)
  const { stdout } = await execFileAsync(SYNOPKG, ['status', id], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

export async function listPackages() {
  const { stdout } = await execFileAsync(SYNOPKG, ['list'], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  })
  return stdout
}