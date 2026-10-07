import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const isWindows = process.platform === 'win32'
const python = path.join(
  root,
  '.venv',
  isWindows ? 'Scripts/python.exe' : 'bin/python',
)

if (!existsSync(python)) {
  console.error('Python 环境不存在，请先运行 npm run dev。')
  process.exit(1)
}

const child = spawn(python, process.argv.slice(2), {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

