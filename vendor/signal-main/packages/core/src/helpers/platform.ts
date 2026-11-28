// Check if we are running in Electron using the user agent
export function isRunningInElectron() {
  return "electronAPI" in window
}
