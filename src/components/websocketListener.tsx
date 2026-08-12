import { useMusicStore, useWebSocketStore } from '@src/stores'
import {
  DESKTHING_DEVICE,
  DeskThingToDeviceCore,
  SongData
} from '@deskthing/types'
import { useEffect, useState } from 'react'
import { handleServerSocket } from '@src/utils/serverWebsocketHandler'
/**
 * The `WebSocketListener` component is responsible for handling WebSocket events and updating the application state accordingly.
 * It listens for various types of WebSocket messages, such as configuration updates, settings changes, button mappings, icon updates, and song data.
 * The component uses the `useWebSocketStore`, `useMappingStore`, `useAppStore`, and `useMusicStore` hooks to access and update the application state.
 */
export const WebSocketListener = () => {
  const setSong = useMusicStore((store) => store.setSong)
  const getSong = useMusicStore((store) => store.requestMusicData)
  const isConnected = useWebSocketStore((store) => store.isConnected)
  const [prevTrackName, setPrevTrackName] = useState('')

  // Ask for the current track as soon as we are connected. Without this the
  // only path to song data is an unsolicited push, so after any reconnect the
  // screen stays blank until the track happens to change or the server's
  // refresh interval comes round — seconds of "Waiting For Track…" while the
  // connection is actually fine. Most visible over Bluetooth, where the link
  // legitimately drops and returns.
  useEffect(() => {
    if (isConnected) getSong(true)
  }, [isConnected, getSong])

  useEffect(() => {
    const websocketManager = useWebSocketStore.getState()

    const handleSongData = (songData: SongData) => {
      if (songData.track_name != undefined && songData.track_name !== prevTrackName) {
        setPrevTrackName(songData.track_name)
        getSong()
      }
      setSong({ ...songData, id: String(Date.now()) })
    }

    const messageHandler = (socketData: DeskThingToDeviceCore & { app?: string }) => {
      if (socketData.app !== 'client') return

      if (socketData.type == DESKTHING_DEVICE.MUSIC) {
        handleSongData(socketData.payload)
      }
      handleServerSocket(socketData)
    }

    websocketManager.addListener(messageHandler)
    return () => websocketManager.removeListener(messageHandler)
  }, [setSong, prevTrackName, getSong])

  return null
}
