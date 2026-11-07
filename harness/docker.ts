// Research: how this process reaches Docker on each host OS.
//   VC_DOCKER: JSON array, the command prefix for docker, e.g. ["wsl.exe","-d","Ubuntu-24.04","-u","root","-e","docker"]. Default ["docker"].
//   VC_HOST_ALIAS: what host.docker.internal maps to in the browser container (an IP or host-gateway).
//                  Default host-gateway on Linux, and nothing elsewhere (the runtime provides the name).
//   VC_HOST_NAME: the name the browser uses for the host, default host.docker.internal (wslc: host.wslc.internal).
//   VC_MINIMAL_FLAGS=1: leave out --init, --ipc, --cpus, --memory and --platform, for a runtime that lacks them.
//   VC_MOUNT=wsl: a Windows path in a bind mount becomes /mnt/<drive>/..., for a daemon inside WSL.
export const DOCKER: string[] = process.env.VC_DOCKER ? JSON.parse(process.env.VC_DOCKER) : ['docker']
export const dockerArgs = (args: string[]) => [...DOCKER.slice(1), ...args]
export const HOST_ALIAS = process.env.VC_HOST_ALIAS ?? (process.platform === 'linux' ? 'host-gateway' : '')
export const mountPath = (p: string) =>
  process.env.VC_MOUNT === 'wsl' ? p.replace(/^([A-Za-z]):[\\/]/, (_, d: string) => `/mnt/${d.toLowerCase()}/`).replaceAll('\\', '/') : p
export const HOST_NAME = process.env.VC_HOST_NAME ?? 'host.docker.internal'
export const MINIMAL = !!process.env.VC_MINIMAL_FLAGS
