import type { TLSSocket } from 'node:tls'
import { buildConnector } from 'undici'

// Accepts a SHA-256 fingerprint as openssl or a browser shows it
// ("99:BF:5B:…", any case, with or without colons) and returns it in the
// form Node reports ("99:BF:5B:…"), or null if it isn't one.
export function normalizeFingerprint(value: string): string | null {
  const hex = value.replace(/[:\s]/g, '').toUpperCase()
  if (!/^[0-9A-F]{64}$/.test(hex)) return null
  return hex.match(/../g)!.join(':')
}

// A connector that trusts exactly one certificate, by fingerprint.
// The NAS's certificate can't pass normal checks (its issuer isn't publicly
// trusted and we connect by IP), so the chain and hostname checks are
// replaced by this pin rather than switched off. The check runs after the
// TLS handshake and before the socket is handed back, so nothing (least of
// all the DSM password) is sent to a server with any other certificate.
export function pinnedConnector(
  fingerprint: string,
  envName = 'SYNO_CERT_SHA256',
): buildConnector.connector {
  const connect = buildConnector({ rejectUnauthorized: false })

  return (opts, callback) => {
    connect(opts, (err, socket) => {
      if (err) return callback(err, null)

      const actual = 'getPeerCertificate' in socket
        ? (socket as TLSSocket).getPeerCertificate().fingerprint256
        : undefined

      if (actual !== fingerprint) {
        socket.destroy()
        return callback(new Error(
          actual
            ? `Certificate fingerprint mismatch for ${opts.hostname}: got ${actual}. ` +
              `If the certificate was replaced, check the new fingerprint on the NAS itself before updating ${envName}.`
            : `${opts.hostname} is not using HTTPS; the pinned connection needs an https:// URL`
        ), null)
      }

      callback(null, socket)
    })
  }
}
