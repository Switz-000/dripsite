import { useRef, useState, useEffect } from 'react'
import { fetchPreview } from '../utils/previews'

// Hover previews for article links inside the element `ref` points to.
// Spread the returned props onto <WikiPopup />. `rebind` lists values that
// change when the element's contents (or the element itself) are replaced.
export function useLinkPreview(ref, tree, { selector = 'a.wikilink, a.ibx-link', rebind = [] } = {}) {
  const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, data: null, slug: null })
  const hoverTimerRef = useRef(null)
  const hideTimerRef = useRef(null)
  const fetchTokenRef = useRef(0)

  const cancelHide = () => clearTimeout(hideTimerRef.current)
  const scheduleHide = () => {
    hideTimerRef.current = setTimeout(() => {
      setPopup(p => ({ ...p, visible: false }))
    }, 120)
  }

  useEffect(() => {
    const el = ref.current
    if (!el || !tree) return

    function onOver(e) {
      const link = e.target.closest(selector)
      if (!link) return
      const linkSlug = link.getAttribute('href')?.replace('/article/', '')
      if (!linkSlug) return
      cancelHide()
      clearTimeout(hoverTimerRef.current)
      const mx = e.clientX, my = e.clientY
      const token = ++fetchTokenRef.current
      hoverTimerRef.current = setTimeout(async () => {
        const data = await fetchPreview(linkSlug, tree)
        if (fetchTokenRef.current !== token) return
        if (data) setPopup({ visible: true, x: mx, y: my, data, slug: linkSlug })
      }, 350)
    }

    function onOut(e) {
      const link = e.target.closest(selector)
      if (!link) return
      if (link.contains(e.relatedTarget)) return
      clearTimeout(hoverTimerRef.current)
      fetchTokenRef.current++
      scheduleHide()
    }

    el.addEventListener('mouseover', onOver)
    el.addEventListener('mouseout', onOut)
    return () => {
      el.removeEventListener('mouseover', onOver)
      el.removeEventListener('mouseout', onOut)
      clearTimeout(hoverTimerRef.current)
      clearTimeout(hideTimerRef.current)
    }
  }, [tree, selector, ...rebind])

  return {
    ...popup,
    onMouseEnter: cancelHide,
    onMouseLeave: scheduleHide,
    onClose: () => setPopup(p => ({ ...p, visible: false })),
  }
}
