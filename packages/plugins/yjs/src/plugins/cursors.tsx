import { Editable, Range, Slot, useEditableStatic } from '@editablejs/editor'
import * as React from 'react'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import create, { StoreApi, UseBoundStore } from 'zustand'
import {
  CursorOverlayState,
  useRemoteCursorOverlayPositions,
} from '../hooks/useRemoteCursorOverlayPositions'
import { RelativeRange } from '../types'
import { slateRangeToRelativeRange } from '../utils/position'
import { CaretPosition } from '../utils/selection'
import { YjsEditor } from './yjs'

export interface RemoteCursorChangeState {
  added: number[]
  removed: number[]
  updated: number[]
}
export interface CursorStore {
  clientIds: RemoteCursorChangeState
}

const CURSORS_TO_EDITABLE = new WeakMap<Editable, UseBoundStore<StoreApi<CursorStore>>>()

const getStore = (editor: Editable) => {
  let store = CURSORS_TO_EDITABLE.get(editor)
  if (!store) {
    store = create(() => ({
      clientIds: {
        added: [],
        removed: [],
        updated: [],
      },
      states: {},
    }))
    CURSORS_TO_EDITABLE.set(editor, store)
  }
  return store
}

export type CursorData = {
  name: string
  color: string
  avatar: string
}

type CaretProps = {
  position: CaretPosition
  data: CursorData
}

function Caret({ position, data }: CaretProps) {
  const caretStyle: React.CSSProperties = {
    ...position,
    background: data.color,
  }

  const labelStyle: React.CSSProperties = {
    transform: 'translateY(-100%)',
    background: data.color,
  }

  return (
    <div style={caretStyle} tw="absolute w-0.5 z-10">
      <div
        tw="absolute top-0 whitespace-nowrap rounded rounded-bl-none px-1.5 py-0.5 text-xs text-white"
        style={labelStyle}
      >
        {data.name}
      </div>
    </div>
  )
}

const RemoteSelection = ({
  data,
  selectionRects,
  caretPosition,
}: CursorOverlayState<CursorData>) => {
  if (!data) {
    return null
  }

  const selectionStyle: React.CSSProperties = {
    // Add a opacity to the background color
    backgroundColor: `${data.color}66`,
  }

  return (
    <React.Fragment>
      {selectionRects.map(({ left, top, height, width }, i) => (
        <div
          style={{ ...selectionStyle, left, top, width, height }}
          tw="pointer-events-none absolute z-10"
          // eslint-disable-next-line react/no-array-index-key
          key={i}
        />
      ))}
      {caretPosition && <Caret position={caretPosition} data={data} />}
    </React.Fragment>
  )
}

const RemoteCursors = () => {
  const containerRef = React.useRef<HTMLElement | null>(null)
  const editor = useEditableStatic()
  React.useEffect(() => {
    containerRef.current = Editable.toDOMNode(editor, editor)
  }, [editor])

  const { cursors } = useRemoteCursorOverlayPositions<CursorData>({
    containerRef,
  })

  return (
    <>
      {cursors.map(cursor => (
        <RemoteSelection key={cursor.clientId} {...cursor} />
      ))}
    </>
  )
}

export type RemoteCursorChangeEventListener = (event: RemoteCursorChangeState) => void

export type CursorState<TCursorData extends Record<string, unknown> = Record<string, unknown>> = {
  relativeSelection: RelativeRange | null
  data?: TCursorData
  clientId: number
}

export type CursorEditor<TCursorData extends Record<string, unknown> = Record<string, unknown>> =
  YjsEditor & {
    awareness: Awareness

    cursorDataField: string
    selectionStateField: string

    sendCursorPosition: (range: Range | null) => void
    sendCursorData: (data: TCursorData) => void
  }

export const CursorEditor = {
  isCursorEditor(value: unknown): value is CursorEditor {
    return (
      YjsEditor.isYjsEditor(value) &&
      (value as CursorEditor).awareness instanceof Awareness &&
      typeof (value as CursorEditor).cursorDataField === 'string' &&
      typeof (value as CursorEditor).selectionStateField === 'string' &&
      typeof (value as CursorEditor).sendCursorPosition === 'function' &&
      typeof (value as CursorEditor).sendCursorData === 'function'
    )
  },

  getStore,

  sendCursorPosition<TCursorData extends Record<string, unknown>>(
    editor: CursorEditor<TCursorData>,
    range: Range | null = editor.selection,
  ) {
    editor.sendCursorPosition(range)
  },

  sendCursorData<TCursorData extends Record<string, unknown>>(
    editor: CursorEditor<TCursorData>,
    data: TCursorData,
  ) {
    editor.sendCursorData(data)
  },

  cursorState<TCursorData extends Record<string, unknown>>(
    editor: CursorEditor<TCursorData>,
    clientId: number,
  ): CursorState<TCursorData> | null {
    if (clientId === editor.awareness.clientID || !YjsEditor.connected(editor)) {
      return null
    }

    const state = editor.awareness.getStates().get(clientId)
    if (!state) {
      return null
    }

    return {
      relativeSelection: state[editor.selectionStateField] ?? null,
      data: state[editor.cursorDataField],
      clientId,
    }
  },

  cursorStates<TCursorData extends Record<string, unknown>>(
    editor: CursorEditor<TCursorData>,
  ): Record<string, CursorState<TCursorData>> {
    if (!YjsEditor.connected(editor)) {
      return {}
    }

    return Object.fromEntries(
      Array.from(editor.awareness.getStates().entries(), ([id, state]) => {
        // Ignore own state
        if (id === editor.awareness.clientID || !state) {
          return null
        }

        return [
          id,
          {
            relativeSelection: state[editor.selectionStateField],
            data: state[editor.cursorDataField],
          },
        ]
      }).filter(Array.isArray),
    )
  },
}

export type WithCursorsOptions<
  TCursorData extends Record<string, unknown> = Record<string, unknown>,
> = {
  // Local state field used to store the user selection
  cursorStateField?: string

  // Local state field used to store data attached to the local client
  cursorDataField?: string

  data?: TCursorData
  autoSend?: boolean
}

export function withCursors<TCursorData extends Record<string, unknown>, TEditor extends YjsEditor>(
  editor: TEditor,
  awareness: Awareness,
  {
    cursorStateField: selectionStateField = 'selection',
    cursorDataField = 'data',
    autoSend = true,
    data,
  }: WithCursorsOptions<TCursorData> = {},
): TEditor & CursorEditor<TCursorData> {
  const e = editor as Editable & TEditor & CursorEditor<TCursorData>

  Slot.mount(e, RemoteCursors)

  e.awareness = awareness
  e.cursorDataField = cursorDataField
  e.selectionStateField = selectionStateField

  e.sendCursorData = (cursorData: TCursorData) => {
    e.awareness.setLocalStateField(e.cursorDataField, cursorData)
  }

  e.sendCursorPosition = range => {
    const localState = e.awareness.getLocalState()
    const currentRange = localState?.[selectionStateField]

    if (!range) {
      if (currentRange) {
        e.awareness.setLocalStateField(e.selectionStateField, null)
      }

      return
    }

    const { anchor, focus } = slateRangeToRelativeRange(e.sharedRoot, e, range)

    if (
      !currentRange ||
      !Y.compareRelativePositions(anchor, currentRange) ||
      !Y.compareRelativePositions(focus, currentRange)
    ) {
      e.awareness.setLocalStateField(e.selectionStateField, { anchor, focus })
    }
  }

  const awarenessChangeListener: RemoteCursorChangeEventListener = yEvent => {
    const localId = e.awareness.clientID
    const clientIds = {
      added: yEvent.added.filter(id => id !== localId),
      removed: yEvent.removed.filter(id => id !== localId),
      updated: yEvent.updated.filter(id => id !== localId),
    }

    if (
      clientIds.added.length > 0 ||
      clientIds.removed.length > 0 ||
      clientIds.updated.length > 0
    ) {
      const store = CursorEditor.getStore(e)
      store.setState({
        clientIds,
      })
    }
  }

  const { connect, disconnect } = e
  e.connect = () => {
    connect()

    e.awareness.on('change', awarenessChangeListener)

    awarenessChangeListener({
      removed: [],
      added: Array.from(e.awareness.getStates().keys()),
      updated: [],
    })

    if (autoSend) {
      if (data) {
        CursorEditor.sendCursorData(e, data)
      }

      const { onChange } = e
      e.onChange = () => {
        onChange()

        if (YjsEditor.connected(e)) {
          CursorEditor.sendCursorPosition(e)
        }
      }
    }
  }

  e.disconnect = () => {
    e.awareness.off('change', awarenessChangeListener)

    awarenessChangeListener({
      removed: Array.from(e.awareness.getStates().keys()),
      added: [],
      updated: [],
    })

    disconnect()
  }

  return e
}
