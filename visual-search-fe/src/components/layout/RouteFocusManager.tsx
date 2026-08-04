import { useEffect } from 'react'
import { useLocation } from 'react-router'

export function RouteFocusManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return null
}
