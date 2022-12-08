import * as React from 'react'
import { NodeEntry, Range, Element } from 'slate'
import { useStore } from 'zustand'
import { Decorate } from '../plugin/decorate'
import { useEditableStatic } from './use-editable'

export const useDecorateStore = () => {
  const editor = useEditableStatic()
  return React.useMemo(() => {
    return Decorate.getStore(editor)
  }, [editor])
}

export const useDecorates = (entry: NodeEntry) => {
  const store = useDecorateStore()
  const isElement = Element.isElement(entry[0])
  const decorates = useStore(store, state =>
    state.decorates.filter(d => d.type === (isElement ? 'element' : 'text')),
  )
  return React.useMemo(() => {
    const nodeDecorates: { decorate: Decorate; ranges: Range[] }[] = []
    decorates.forEach(decorate => {
      const ranges = decorate.decorate(entry)
      if (ranges.length > 0) {
        nodeDecorates.push({ decorate, ranges })
      }
    })
    return nodeDecorates
  }, [decorates, entry])
}
