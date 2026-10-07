import {
  Braces,
  CloudSun,
  FileText,
  Globe2,
  Newspaper,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type { BlockType } from './types'

export const blockIcons: Record<BlockType, LucideIcon> = {
  text: FileText,
  weather: CloudSun,
  stocks: Braces,
  http: Globe2,
  news: Newspaper,
  actuarial: ShieldCheck,
}

export const blockLabels: Record<BlockType, string> = {
  text: 'TEXT',
  weather: 'WEATHER',
  stocks: 'MARKET',
  http: 'HTTP',
  news: 'NEWS',
  actuarial: 'ACTUARIAL',
}

