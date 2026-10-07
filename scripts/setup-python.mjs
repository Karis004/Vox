import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const isWindows = process.platform === 'win32'
const venvPython = path.join(
  root,
  '.venv',
  isWindows ? 'Scripts/python.exe' : 'bin/python',
)

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })
}

if (!existsSync(venvPython)) {
  console.log('[setup] 正在创建 Python 虚拟环境 .venv')
  const candidates = isWindows
    ? [
        ['py', ['-3.11', '-m', 'venv', '.venv']],
        ['python', ['-m', 'venv', '.venv']],
      ]
    : [
        ['python3', ['-m', 'venv', '.venv']],
        ['python', ['-m', 'venv', '.venv']],
      ]

  let created = false
  for (const [command, args] of candidates) {
    const result = run(command, args)
    if (result.status === 0 && existsSync(venvPython)) {
      created = true
      break
    }
  }
  if (!created) {
    console.error('[setup] 未找到可用的 Python 3.11+，请先安装 Python。')
    process.exit(1)
  }
}

const check = spawnSync(
  venvPython,
  ['-c', 'import fastapi, httpx, openai, pydantic, uvicorn'],
  { cwd: root, stdio: 'ignore' },
)

if (check.status !== 0) {
  console.log('[setup] 正在安装 Python 依赖')
  const install = run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'])
  if (install.status !== 0) process.exit(install.status ?? 1)
}

console.log('[setup] Python 环境已就绪')
