import { createRoot } from 'react-dom/client'

import App from './App'
import { setRem } from './utils/setRem'

// 设置 rem 基准值，实现响应式适配
setRem()

createRoot(document.getElementById('root')!).render(<App />)
