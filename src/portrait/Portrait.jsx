import React, { useId, useMemo } from 'react'
import { compose } from './engine'

// Draws a portrait spec as inline SVG. No background of its own: it sits on
// whatever surface holds it (the infobox, the composer stage).
export default function Portrait({ spec, frame = 'bust', anchors = false, className = '' }) {
  const id = useId()
  const svg = useMemo(() => compose(spec, { id, frame, anchors }), [spec, id, frame, anchors])
  return <div className={'portrait-svg ' + className} dangerouslySetInnerHTML={{ __html: svg }} />
}
