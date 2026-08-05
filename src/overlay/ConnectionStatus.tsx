import { IconBluetooth, IconConnected, IconLoading, IconUsb } from '@src/assets/Icons'
import { useWebSocketStore } from '@src/stores/'
import { useSettingsStore } from '@src/stores/settingsStore'
import { useUIStore } from '@src/stores/uiStore'
import { useEffect, useState } from 'react'

type Transport = 'bluetooth' | 'usb' | 'unknown'

/**
 * Renders the connection status of the WebSocket connection.
 *
 * While connected, shows a small badge naming the transport actually carrying the
 * data. The transport is probed rather than assumed: /__bt is answered locally by
 * the Bluetooth mux when it owns the port, so a JSON reply means Bluetooth, while
 * anything else means the request travelled to the server over USB.
 *
 * While disconnected or reconnecting, shows the original notice instead.
 */
export const ServerStatus = () => {
  const isConnected = useWebSocketStore((state) => state.isConnected)
  const isReconnecting = useWebSocketStore((state) => state.isReconnecting)
  const isScreensaverActive = useUIStore((state) => state.isScreensaverActive)
  const context = useSettingsStore((state) => state.manifest.context)
  const [transport, setTransport] = useState<Transport>('unknown')

  useEffect(() => {
    if (!isConnected || !context?.ip || !context?.port) return
    let cancelled = false

    const probe = async (): Promise<void> => {
      try {
        const res = await fetch(`http://${context.ip}:${context.port}/__bt`, {
          cache: 'no-store'
        })
        const data = res.ok ? await res.json() : null
        if (!cancelled) setTransport(data?.transport === 'bluetooth' ? 'bluetooth' : 'usb')
      } catch {
        if (!cancelled) setTransport('usb')
      }
    }

    probe()
    const id = setInterval(probe, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isConnected, context?.ip, context?.port])

  if (isScreensaverActive) return null

  if (isConnected) {
    const label = transport === 'bluetooth' ? 'BT' : transport === 'usb' ? 'USB' : ''
    return (
      <div className="fixed top-2 left-2 z-40 flex items-center rounded-full bg-black/40 px-2 py-1 text-neutral-300">
        {transport === 'bluetooth' ? (
          <IconBluetooth iconSize={14} className="text-sky-400" />
        ) : transport === 'usb' ? (
          <IconUsb iconSize={14} className="text-neutral-300" />
        ) : (
          <IconConnected iconSize={14} className="text-neutral-400" />
        )}
        {label && <span className="ml-1 text-[10px] font-semibold tracking-wide">{label}</span>}
      </div>
    )
  }

  return (
    <div className="fixed top-4 left-4 z-40 flex items-center rounded-lg bg-rose-950 px-4 py-2 text-sm text-white">
      {isReconnecting ? (
        <div className="flex items-center">
          <IconLoading iconSize={12} strokeWidth={5} className="animate-spin mr-2" />
          <p>Reconnecting</p>
        </div>
      ) : (
        <div className="flex items-center">
          <div className="h-4 w-4 mr-2 rounded-full bg-red-500" />
          <p>Disconnected from server</p>
        </div>
      )}
    </div>
  )
}
