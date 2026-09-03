import { useCallback, useEffect, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { message } from 'antd'
import * as settingsApi from '../api/settings'
import './SliderCaptcha.css'

// 默认随机图 API：picsum.photos 用 seed 参数，保证背景与拼图块拿到同一张图
// （背景 <img> 与拼图块 background-image 同时请求同一 URL，浏览器缓存命中）
const DEFAULT_BG = 'https://picsum.photos/seed/{seed}/{w}/{h}'

// 拼图尺寸常量
const PUZZLE_SIZE = 40        // 拼图块尺寸
const TOLERANCE = 6          // 容差

// 给 URL 追加缓存破坏参数，刷新时强制重新拉取（换一张随机图）
function withCacheBust(url, t) {
    if (!url) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}t=${t}`
}

// 默认 picsum 模板替换：seed/w/h 占位符 → 实际值
function buildPicsumUrl(seed, w, h) {
    return DEFAULT_BG.replace('{seed}', seed).replace('{w}', w).replace('{h}', h)
}

export default function SliderCaptcha({ width = 320, height = 160, onSuccess, onFail }) {
    // 背景图地址：从系统配置读取，未配置时用默认 picsum.photos
    const [bgUrl, setBgUrl] = useState('')
    // 缓存破坏参数：刷新换图时更新，强制浏览器重新请求（用户配置的随机图 API 用）
    const [cacheBust, setCacheBust] = useState(() => Date.now())
    // 默认 picsum 模板的 seed：挂载即随机，刷新换图时更新；保证背景与拼图块同图
    const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
    // 缺口位置：挂载时随机生成（父组件改 key 重挂载即可整体验证码重置，无需 effect 内 setState）
    const [bgOffset, setBgOffset] = useState(() => Math.floor(Math.random() * (width - PUZZLE_SIZE - 60)) + 60)
    const [puzzleTop, setPuzzleTop] = useState(() => Math.floor(Math.random() * (height - PUZZLE_SIZE - 10)) + 5)
    const [sliderX, setSliderX] = useState(0)          // 当前滑块 x
    const [passed, setPassed] = useState(false)
    const [dragging, setDragging] = useState(false)
    const startXRef = useRef(0)

    // 首次挂载：从系统配置读取验证码背景图地址（setState 在 async 回调中，非 effect 同步路径）
    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                const res = await settingsApi.getSettings()
                if (alive && res.code === 200 && res.data.captchaBgUrl) {
                    setBgUrl(res.data.captchaBgUrl)
                }
            } catch { /* 读取失败用默认值，不影响验证流程 */ }
        })()
        return () => { alive = false }
    }, [])

    // 重新生成缺口位置 + 换一张随机图：仅由「刷新」按钮触发（事件处理，非 effect）
    const regenerate = useCallback(() => {
        setBgOffset(Math.floor(Math.random() * (width - PUZZLE_SIZE - 60)) + 60)
        setPuzzleTop(Math.floor(Math.random() * (height - PUZZLE_SIZE - 10)) + 5)
        setSliderX(0)
        setPassed(false)
        setDragging(false)
        // 默认模板换 seed，用户配置换 cacheBust
        setSeed(Math.floor(Math.random() * 100000))
        setCacheBust(Date.now())
    }, [width, height])

    const onPointerDown = (e) => {
        if (passed) return
        startXRef.current = e.clientX
        setDragging(true)
    }

    const onPointerMove = (e) => {
        if (!dragging || passed) return
        const dx = e.clientX - startXRef.current
        const max = width - PUZZLE_SIZE
        setSliderX(Math.max(0, Math.min(dx, max)))
    }

    const onPointerUp = () => {
        if (!dragging || passed) return
        setDragging(false)
        if (Math.abs(sliderX - bgOffset) < TOLERANCE) {
            setPassed(true)
            onSuccess?.()
            message.success('验证通过')
        } else {
            setSliderX(0)
            onFail?.()
            message.error('验证失败，请重试')
        }
    }

    // 全局松手兜底
    useEffect(() => {
        if (!dragging) return
        const handler = () => setDragging(false)
        window.addEventListener('pointerup', handler)
        return () => window.removeEventListener('pointerup', handler)
    }, [dragging])

    // 实际使用的图 URL：
    // - 用户配置了 bgUrl：用 cacheBust ?t= 强制换图（随机图 API 兼容）
    // - 未配置：用 picsum.photos seed 模板，背景与拼图块同 URL 同图（不依赖 cacheBust）
    const fullBg = bgUrl
        ? withCacheBust(bgUrl, cacheBust)
        : buildPicsumUrl(seed, width, height)

    return (
        <div className="slider-captcha" style={{ width }}>
            <div className="sc-bg" style={{ width, height }}>
                <img src={fullBg} alt="captcha bg" draggable={false} />
                {/* 缺口阴影 */}
                <div
                    className="sc-hole"
                    style={{
                        left: bgOffset,
                        top: puzzleTop,
                        width: PUZZLE_SIZE,
                        height: PUZZLE_SIZE
                    }}
                />
                {/* 拼图块：跟随滑块移动 */}
                <div
                    className="sc-puzzle"
                    style={{
                        left: sliderX,
                        top: puzzleTop,
                        width: PUZZLE_SIZE,
                        height: PUZZLE_SIZE,
                        backgroundImage: `url(${fullBg})`,
                        backgroundPosition: `-${bgOffset}px -${puzzleTop}px`,
                        backgroundSize: `${width}px ${height}px`
                    }}
                />
                <button type="button" className="sc-refresh" onClick={regenerate} title="刷新换图">
                    <ReloadOutlined />
                </button>
            </div>
            <div
                className={`sc-track ${passed ? 'is-passed' : ''} ${dragging ? 'is-dragging' : ''}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                <div className="sc-progress" style={{ width: sliderX + PUZZLE_SIZE }} />
                <div className="sc-slider" style={{ left: sliderX }}>
                    {passed ? '✓' : '→'}
                </div>
                <span className="sc-hint">{passed ? '验证通过' : '向右拖动滑块完成验证'}</span>
            </div>
        </div>
    )
}
