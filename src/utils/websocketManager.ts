import Logger from './Logger'
import {
  DEVICE_DESKTHING,
  DeviceToDeskthingData,
  DESKTHING_DEVICE,
  DeskThingToDeviceCore
} from '@deskthing/types'

type SocketEventListener = (msg: DeskThingToDeviceCore & { app?: string }) => void
type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

/** Reconnect backoff: quick first attempt, then ease off to this ceiling. */
const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 10000
type StatusListener = (status: ConnectionStatus) => void

/**
 * Manages the WebSocket connection and provides methods for sending and receiving messages.
 * This class is a singleton, and can be accessed using the `getInstance()` method.
 */
export class WebSocketManager {
  private socket: WebSocket | null = null
  private listeners: SocketEventListener[] = []
  private statusListeners: StatusListener[] = []
  private reconnecting = false
  private reconnectAttempts = 0
  private url: string
  private heartbeatInterval: NodeJS.Timeout | null = null
  private pongTimeout: NodeJS.Timeout | null = null
  private missedPongs = 0
  private readonly MAX_MISSED_PONGS = 3
  private clientId: string | null = null
  private code = Math.random() * 1000000

  private closeTimeoutId: NodeJS.Timeout | null = null
  private reconnectId: NodeJS.Timeout | null = null

  constructor(clientId: string, url?: string) {
    this.clientId = clientId
    this.url = url || this.url
    console.debug('WebSocketManager initialized with URL:', this.url)
  }

  getclientId() {
    return this.clientId
  }

  setId(id: string) {
    this.clientId = id
  }

  async closeExisting() {
    if (this.socket) {
      // Clean up event listeners
      this.socket.onopen = null
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.onmessage = null

      // Close the connection if it is open OR still connecting. A socket left
      // in CONNECTING (e.g. the server was unreachable when we dialed — the
      // case on a Bluetooth link that comes up ~80s after the device boots)
      // must be closed too, or it lingers half-open, holds a tunnel stream,
      // and blocks the client from ever cleanly reconnecting once the link is
      // up. Only closing OPEN sockets leaked these on every failed attempt.
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        await this.socket.close(4000, 'Closing existing connection')
      }

      // Clear heartbeat timers
      this.stopHeartbeat()

      // Reset state
      this.socket = null
      this.missedPongs = 0
    }
  }

  async connect(url?: string) {
    this.url = url || this.url

    const id = Math.floor(Math.random() * 10000).toString().padStart(4, '0')

    if (this.url == undefined || !this.url) {
      console.warn(`[${id}] No WebSocket URL provided`)
      return
    } else {
      console.debug(`[${id}] Connecting to WebSocket: ${this.url}`)
    }

    await this.closeExisting()

    console.log(`[${id}] Creating a new WebSocket instance on ${this.url}`)
    this.socket = new WebSocket(this.url)
    console.debug(`[${id}] Created new WebSocket instance`, this.socket.url)

    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.socket.readyState === WebSocket.CONNECTING) {
          reject(new Error(`[${id}] Connection timeout`))
        } else {
          resolve()
        }
      }, 10000)

      this.socket!.onopen = () => {
        clearTimeout(timeout)
        console.info(`[${id}] Connected to ${this.url}`)
        this.reconnecting = false
        this.reconnectAttempts = 0   // connected: start the backoff over
        this.startHeartbeat()
        this.notifyStatusChange('connected')
        resolve()
      }

      this.socket!.onerror = (error) => {
        clearTimeout(timeout)
        console.error(`[${id}] WebSocket error:`, error)
        reject(error)
      }
    })

    this.socket.onopen = () => {
      console.info(`[${id}] Connected to ${this.url}`)
      this.reconnecting = false
      this.reconnectAttempts = 0   // connected: start the backoff over
      this.startHeartbeat()
      this.notifyStatusChange('connected')
    }

    this.socket.onclose = (reason) => {
      console.warn(`[${id}] Disconnected, attempting to reconnect...`, this.code, reason)
      this.stopHeartbeat()
      this.notifyStatusChange('disconnected')

      if (this.closeTimeoutId) {
        clearTimeout(this.closeTimeoutId)
      }

      // Retry promptly. This used to wait 5s here and then a further 10s in
      // reconnect(), so the first attempt was 15s after a drop no matter how
      // briefly the link had gone away.
      this.closeTimeoutId = setTimeout(() => {
        this.reconnect()
      }, 250)
    }

    this.socket.onerror = (error) => {
      console.error(`[${id}] WebSocket error:`, error)
    }

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as DeskThingToDeviceCore & { app: string }
      if (data.app == 'client') {
        if (data.type == DESKTHING_DEVICE.PONG) {
          if (data.payload) {
            // Update the clientId with the one from the ping
            this.setId(data.payload)
          }
          this.resetPongTimeout()
        } else if (data.type == DESKTHING_DEVICE.PING) {
          if (data.payload) {
            // Update the clientId with the one from the ping
            this.setId(data.payload)
          }
          this.sendMessage({ app: 'server', type: DEVICE_DESKTHING.PONG })
        }
      }

      this.notifyListeners(data)
    }

    try {
      // Wait for the connection to be established
      await connectionPromise
      return true
    } catch (error) {
      console.error(`[${id}] Failed to establish connection:`, error)
      if (this.closeTimeoutId) {
        clearTimeout(this.closeTimeoutId)
      }

      this.closeTimeoutId = setTimeout(() => {
        this.reconnect()
      }, 250)
      return false
    }
  }

  disconnect() {
    this.closeExisting()
  }

  reconnect() {
    if (this.reconnecting) return
    this.reconnecting = true
    this.notifyStatusChange('reconnecting')

    this.disconnect()

    if (this.reconnectId) {
      clearTimeout(this.reconnectId)
    }

    // Back off instead of waiting a flat 10s. A dropped link usually comes
    // back immediately, so the first retry should be quick; only a genuinely
    // absent server should push the delay out.
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS
    )
    this.reconnectAttempts += 1
    Logger.info(`Reconnecting in ${delay}ms...`)

    this.reconnectId = setTimeout(() => {
      Logger.info('Conecting...')
      this.connect()
      this.reconnecting = false
    }, delay)
  }

  sendMessage(message: DeviceToDeskthingData) {
    if (!this.socket) {
      console.error('Socket is not initialized')
      console.debug(`Failed to send ${message.type}`)
      return
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.error('Socket is not open. The state is', this.socket.readyState)
      console.debug(`Failed to send ${message.type}`)
      return
    }

    const socketMessage = { ...message, clientId: this.clientId }
    console.debug(`[${message.app} ${message.type}]`, socketMessage)
    this.socket.send(JSON.stringify(socketMessage))
  }

  addListener(listener: SocketEventListener) {
    this.listeners.push(listener)
  }

  removeListener(listener: SocketEventListener) {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  addStatusListener(listener: StatusListener) {
    this.statusListeners.push(listener)
  }

  removeStatusListener(listener: StatusListener) {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener)
  }

  private notifyStatusChange(status: ConnectionStatus) {
    this.statusListeners.forEach((listener) => listener(status))
  }

  private notifyListeners(data: DeskThingToDeviceCore & { app: string }) {
    this.listeners.forEach((listener) => listener(data))
  }

  private startHeartbeat() {
    this.stopHeartbeat() // Clear any existing heartbeat
    this.missedPongs = 0

    // Send "ping" every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage({ app: 'server', type: DEVICE_DESKTHING.PING })
        this.startPongTimeout()
      }
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  private startPongTimeout() {
    // If "pong" isn't received within 10 seconds, increment missed pongs
    if (this.pongTimeout) clearTimeout(this.pongTimeout)
    this.pongTimeout = setTimeout(() => {
      this.missedPongs += 1
      console.warn(`Missed pong ${this.missedPongs}/${this.MAX_MISSED_PONGS}`)
      if (this.missedPongs >= this.MAX_MISSED_PONGS) {
        this.closeExisting()
        this.reconnect()
      }
    }, 10000)
  }

  private resetPongTimeout() {
    this.missedPongs = 0 // Reset missed pong count on successful pong
    if (this.pongTimeout) clearTimeout(this.pongTimeout)
  }
}
