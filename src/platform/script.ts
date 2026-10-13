/** Динамическая загрузка скрипта. Веб-сборка этот путь не вызывает. */
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.async = true
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(src))
    document.head.appendChild(s)
  })
}
